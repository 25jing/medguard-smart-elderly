# -*- coding: utf-8 -*-
"""
智慧养老安全用药辅助平台 - AI 服务（四层架构第三层）
FastAPI :8100 —— 三条链路：
  POST /recognize      药盒识别（YOLOv8检测 + PP-OCR(CRNN族)识别 + 词典归一化）
  POST /qa             RAG 循证问答（LangChain + FAISS + BM25 混合召回 + RRF重排 + 受控生成/拒答）
  POST /conflict       成分冲突校验（归一化 + 四类规则 + 风险分级）
  POST /rules/sync     规则热更新（后端推送）
  GET  /health /metrics
隐私承诺：识别原图只在内存中处理，响应返回前显式释放，全程不落盘。
"""
import asyncio
import logging
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

import config
import recognizer
from conflict import ENGINE as CONFLICT_ENGINE
from rag import ENGINE as RAG_ENGINE

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("ai-service")

MAX_UPLOAD = 10 * 1024 * 1024

# ---------------- 指标（申报书：P95延迟等关键指标可观测） ----------------
_metrics: Dict[str, deque] = {}

def _record(endpoint: str, ms: int):
    dq = _metrics.setdefault(endpoint, deque(maxlen=500))
    dq.append(ms)

def _percentile(dq: deque, p: float) -> Optional[float]:
    if not dq:
        return None
    s = sorted(dq)
    k = max(0, min(len(s) - 1, int(round(p / 100 * (len(s) - 1)))))
    return float(s[k])


# ---------------- 启动任务 ----------------
def _bootstrap_sync():
    """后台线程：拉词典→拉规则→建RAG索引（不阻塞健康检查）"""
    # 1. 药品词典（识别归一化用），后端未启动则退回种子文件；
    #    重试窗口约2分钟，容忍后端冷启动慢于AI的启动顺序
    for attempt in range(24):
        try:
            r = requests.get(f"{config.BACKEND_URL}/api/internal/medications-lite",
                             headers={"X-Service-Key": config.SERVICE_KEY}, timeout=5)
            if r.status_code == 200:
                items = r.json().get("data") or []
                if items:
                    recognizer.refresh_dictionary(items)
                    break
        except Exception:
            pass
        time.sleep(5)
    if recognizer.dictionary_size() == 0:
        import json
        p = config.DATA_DIR / "medications.json"
        if p.exists():
            seeds = json.loads(p.read_text(encoding="utf-8"))
            recognizer.refresh_dictionary([
                {"id": None, "genericName": m.get("genericName"),
                 "brandName": m.get("brandName"), "ingredients": m.get("ingredients"),
                 "drugClass": m.get("drugClass")} for m in seeds])
            log.warning("使用本地种子词典（后端未就绪）")

    # 2. 冲突规则
    if not CONFLICT_ENGINE.load_from_backend():
        CONFLICT_ENGINE.load_from_seed()

    # 3. RAG 索引
    try:
        RAG_ENGINE.build()
    except Exception as e:
        log.error("RAG 引擎构建失败: %s", e, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.booted_at = time.time()
    t = asyncio.get_event_loop().run_in_executor(None, _bootstrap_sync)
    app.state.boot_task = t
    yield


app = FastAPI(title="MedGuard AI Service", version="1.0.0", lifespan=lifespan)


# ---------------- 服务间签名校验 ----------------
@app.middleware("http")
async def service_auth(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)
    key = request.headers.get("X-Service-Key", "")
    if key != config.SERVICE_KEY:
        raise HTTPException(status_code=403, detail="invalid service key")
    return await call_next(request)


# ---------------- 数据模型 ----------------
class QaRequest(BaseModel):
    question: str
    medications: Optional[List[Dict[str, Any]]] = None


class ConflictRequest(BaseModel):
    medications: List[Dict[str, Any]]


class RulesSyncRequest(BaseModel):
    rules: List[Dict[str, Any]]


# ---------------- 接口 ----------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "ragReady": RAG_ENGINE.ready,
        "dictionarySize": recognizer.dictionary_size(),
        "rulesCount": len(CONFLICT_ENGINE.rules),
        "rulesVersion": CONFLICT_ENGINE.rules_version,
        "llmGeneration": bool(config.LLM_TOKEN and config.LLM_BASE_URL and config.LLM_MODEL),
        "uptimeSeconds": int(time.time() - getattr(app.state, "booted_at", time.time())),
    }


@app.get("/metrics")
def metrics():
    out = {}
    for ep, dq in _metrics.items():
        out[ep] = {"count": len(dq), "p50Ms": _percentile(dq, 50), "p95Ms": _percentile(dq, 95)}
    return out


@app.post("/recognize")
async def recognize(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "image too large")
    t0 = time.time()
    try:
        # 在线程池里跑重活（YOLO/OCR 均为 CPU 密集）
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, recognizer.recognize, data)
    finally:
        data = b""  # 隐私承诺：识别完成立即释放原图字节
    ms = int((time.time() - t0) * 1000)
    _record("recognize", ms)
    result["serverLatencyMs"] = ms
    return result


@app.post("/qa")
async def qa(req: QaRequest):
    t0 = time.time()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, RAG_ENGINE.ask, req.question, req.medications)
    _record("qa", int((time.time() - t0) * 1000))
    return result


@app.post("/conflict")
async def conflict(req: ConflictRequest):
    t0 = time.time()
    result = CONFLICT_ENGINE.check(req.medications)
    _record("conflict", int((time.time() - t0) * 1000))
    return result


@app.post("/rules/sync")
async def rules_sync(req: RulesSyncRequest):
    CONFLICT_ENGINE.set_rules(req.rules, version="synced")
    return {"ok": True, "rulesCount": len(CONFLICT_ENGINE.rules)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")
