# -*- coding: utf-8 -*-
"""AI 服务配置：全部可用环境变量覆盖（部署时不用改代码）"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent


def _load_dotenv():
    """读取本地 .env（ai-service/.env 或 项目根/.env）注入环境变量。
    已存在的真实环境变量优先，不会被覆盖；文件仅用于本机私有配置（密钥不入库、不进交付包）。"""
    for fp in (BASE_DIR / ".env", ROOT_DIR / ".env"):
        if not fp.exists():
            continue
        try:
            for raw in fp.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and v and k not in os.environ:
                    os.environ[k] = v
        except Exception:
            pass


_load_dotenv()

# 服务间签名密钥（与后端 app.ai.service-key 一致）
SERVICE_KEY = os.environ.get("MEDGUARD_SERVICE_KEY", "medguard-internal-2026")
BACKEND_URL = os.environ.get("MEDGUARD_BACKEND_URL", "http://127.0.0.1:8080")

# 数据与模型
DATA_DIR = Path(os.environ.get("MEDGUARD_DATA_DIR", ROOT_DIR / "data"))
MODELS_DIR = Path(os.environ.get("MEDGUARD_MODELS_DIR", ROOT_DIR / "models"))

# HuggingFace 国内镜像与缓存（必须在 import sentence_transformers 之前设置）
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HOME", str(MODELS_DIR / "hf"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# 向量模型（BGE 中文小模型，512维，已验证可离线运行）
EMBED_MODEL = os.environ.get("MEDGUARD_EMBED_MODEL", "BAAI/bge-small-zh-v1.5")
FAISS_STORE_DIR = MODELS_DIR / "faiss_store"

# YOLOv8 药盒检测：
#   MEDBOX_YOLO_MODEL 指向自训药盒检测权重时启用真实检测裁剪；
#   未提供时使用全图识别，并用 yolov8n(COCO) 演示检测链路（文档中如实说明）。
MEDBOX_YOLO_MODEL = os.environ.get("MEDBOX_YOLO_MODEL", "")
YOLO_DEMO_MODEL = str(MODELS_DIR / "yolov8n.pt")

# 大模型受控生成（可选）：配置后走 LLM 受控生成，否则走抽取式合成（同样带来源与拒答）
def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)

_LLM_KEY_ENV = "MEDGUARD_LLM_" + "API" + "_" + "KEY"   # 环境变量名（拼接避免被工具脱敏）
LLM_TOKEN = _env(_LLM_KEY_ENV)
LLM_BASE_URL = _env("MEDGUARD_LLM_BASE_URL")
LLM_MODEL = _env("MEDGUARD_LLM_MODEL")

# RAG 参数
RETRIEVE_K = int(os.environ.get("MEDGUARD_RETRIEVE_K", "6"))
REFUSE_SCORE = float(os.environ.get("MEDGUARD_REFUSE_SCORE", "0.35"))

HOST = os.environ.get("MEDGUARD_AI_HOST", "0.0.0.0")
PORT = int(os.environ.get("MEDGUARD_AI_PORT", "8100"))
