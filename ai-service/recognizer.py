# -*- coding: utf-8 -*-
"""
药盒识别链路：YOLOv8 检测 → CRNN 族文字识别(PP-OCRv4 rec, CTC解码) → 词典+编辑距离归一化
隐私承诺：图像只在内存处理，识别完成立即释放，全程不落盘。
"""
import logging
import re
import time
from typing import List, Dict, Any, Optional

import numpy as np
from PIL import Image
import io

import config

log = logging.getLogger("recognizer")

# ---------- OCR（RapidOCR = PP-OCRv4 检测+识别 ONNX 版，识别模型为 CRNN 族 CTC 结构） ----------
_ocr = None
def get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr

# ---------- YOLOv8 检测 ----------
_yolo_custom = None   # 自训药盒模型
_yolo_demo = None     # COCO 演示模型
def get_yolo():
    """返回 (model, mode)：custom=自训药盒权重；demo=COCO yolov8n 演示链路；None=全图"""
    global _yolo_custom, _yolo_demo
    if config.MEDBOX_YOLO_MODEL:
        if _yolo_custom is None:
            from ultralytics import YOLO
            _yolo_custom = YOLO(config.MEDBOX_YOLO_MODEL)
            log.info("已加载自训药盒检测模型: %s", config.MEDBOX_YOLO_MODEL)
        return _yolo_custom, "custom"
    return None, "full-image"


def load_demo_yolo():
    """演示模式：加载 yolov8n 跑通检测链路（COCO 80类无药盒类，结果仅展示流程，不参与裁剪）"""
    global _yolo_demo
    try:
        from ultralytics import YOLO
        if _yolo_demo is None:
            _yolo_demo = YOLO(config.YOLO_DEMO_MODEL)
        return _yolo_demo
    except Exception as e:
        log.warning("演示 YOLO 加载失败: %s", e)
        return None


# ---------- 药品词典（后端为权威数据源，启动拉取；失败则读本地种子文件） ----------
_dict_items: List[Dict[str, Any]] = []

FORM_SUFFIX = re.compile(
    r"(肠溶片|肠溶胶囊|缓释片|缓释胶囊|分散片|咀嚼片|含片|滴丸|软胶囊|硬胶囊|胶囊|片剂|片|颗粒|散剂|散|丸|膏|糖浆|口服液|溶液|滴眼液|滴鼻液|喷雾剂|气雾剂|吸入剂|注射液|粉针剂|凝胶|乳膏|软膏|贴剂|贴膏|栓|膜|泡腾片|干混悬剂)$")

def normalize_name(name: str) -> str:
    """名称归一化：去剂型后缀、去品牌括号、去空格"""
    if not name:
        return ""
    n = re.sub(r"[（(][^）)]*[）)]", "", name)          # 去商品名括号
    n = re.sub(r"\s+", "", n)
    n = re.sub(r"^(盐酸|甲磺酸|苯磺酸|硫酸|枸橼酸|酒石酸|琥珀酸|马来酸|富马酸|磷酸|醋酸|氢溴酸|氯化)", "", n)  # 去盐前缀（匹配时双向宽容）
    core = FORM_SUFFIX.sub("", n)
    return core if core else n

def refresh_dictionary(items: List[Dict[str, Any]]):
    global _dict_items
    _dict_items = items
    log.info("药品词典已更新: %d 条", len(items))

def dictionary_size() -> int:
    return len(_dict_items)


# ---------- 编辑距离匹配 ----------
def edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la == 0 or lb == 0:
        return max(la, lb)
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        ca = a[i - 1]
        for j in range(1, lb + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != b[j - 1]))
        prev = cur
    return prev[lb]

def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    d = edit_distance(a, b)
    return max(0.0, 1.0 - d / max(len(a), len(b)))


def match_candidates(ocr_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """OCR 全文 × 词典 → Top-K 候选（通用名/商品名双向匹配，含盐前缀宽容）"""
    if not _dict_items:
        return []
    compact = re.sub(r"\s+", "", ocr_text)
    scored: Dict[int, Dict[str, Any]] = {}
    for idx, item in enumerate(_dict_items):
        best = 0.0
        names = [item.get("genericName") or "", item.get("brandName") or ""]
        for raw in names:
            if not raw:
                continue
            target = normalize_name(raw)
            if not target:
                continue
            # 1) 全文包含 → 高分（长度越长分越高）
            if target in compact:
                s = min(0.99, 0.75 + len(target) / 40.0)
                best = max(best, s)
                continue
            # 2) 滑窗编辑距离（对 OCR 错字鲁棒）
            L = len(target)
            for w in (L - 1, L, L + 1, L + 2):
                if w <= 0 or w > len(compact):
                    continue
                for i in range(0, len(compact) - w + 1, max(1, w // 4)):
                    s = similarity(target, compact[i:i + w])
                    if s > best:
                        best = s
                    if best > 0.92:
                        break
                if best > 0.92:
                    break
        if best >= 0.45:
            # 键必须用索引：种子词典兜底时所有条目 id=None，用 id 做键会互相覆盖只剩一条
            scored[idx] = {
                "medicationId": item.get("id"),
                "name": item.get("genericName"),
                "brandName": item.get("brandName"),
                "confidence": round(best, 4),
                "matchedBy": "ocr+dict+edit-distance",
            }
    ranked = sorted(scored.values(), key=lambda x: -x["confidence"])
    return ranked[:top_k]


def recognize(image_bytes: bytes) -> Dict[str, Any]:
    """识别主流程：检测(可选) → OCR → 归一化匹配。图像只在内存中，返回前即释放。"""
    t0 = time.time()
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("RGB")
    # 方向校正 + 压缩（长边≤1600 供模型用）
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img)
    if max(img.size) > 1600:
        r = 1600 / max(img.size)
        img = img.resize((int(img.width * r), int(img.height * r)))
    arr = np.array(img)

    detect_info = {"mode": "full-image", "boxes": []}
    yolo, mode = get_yolo()
    crop = arr
    if yolo is not None:
        results = yolo(arr, verbose=False)
        boxes = []
        for r in results:
            for b in r.boxes:
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                boxes.append({"cls": int(b.cls[0]), "conf": round(float(b.conf[0]), 3),
                              "box": [x1, y1, x2, y2]})
        detect_info = {"mode": mode, "boxes": boxes}
        if boxes:
            b0 = max(boxes, key=lambda b: (b["box"][2] - b["box"][0]) * (b["box"][3] - b["box"][1]))
            x1, y1, x2, y2 = b0["box"]
            crop = arr[max(0, y1):y2, max(0, x1):x2]
    else:
        # 演示链路：COCO 模型跑一遍，证明 YOLOv8 集成可用（不参与裁剪决策）
        demo = load_demo_yolo()
        if demo is not None:
            try:
                results = demo(arr, verbose=False)
                n = sum(len(r.boxes) for r in results)
                detect_info = {"mode": "demo-yolov8n-coco", "objectsDetected": int(n),
                               "note": "COCO预训练模型演示检测链路；上线需替换为自训药盒模型(MEDBOX_YOLO_MODEL)"}
            except Exception as e:
                detect_info = {"mode": "full-image", "error": str(e)}

    # OCR（PP-OCRv4：det 定位 + rec(CRNN族CTC) 识别）
    ocr = get_ocr()
    result, _elapse = ocr(crop)
    lines = []
    if result:
        for item in result:
            txt, score = item[1], float(item[2])
            lines.append({"text": txt, "score": round(score, 3)})
    ocr_text = " ".join(x["text"] for x in lines)

    candidates = match_candidates(ocr_text)
    latency = int((time.time() - t0) * 1000)

    # 隐私承诺落地：显式释放图像内存
    del arr, crop, img
    image_bytes = None

    char_scores = [x["score"] for x in lines] or [0.0]
    return {
        "ocrText": ocr_text,
        "ocrLines": lines,
        "charAccuracyEstimate": round(sum(char_scores) / len(char_scores), 4),
        "candidates": candidates,
        "detect": detect_info,
        "lowConfidence": (not candidates) or candidates[0]["confidence"] < 0.75,
        "latencyMs": latency,
        "hint": "如候选都不对，请点【手动输入药名】" if ((not candidates) or candidates[0]["confidence"] < 0.75) else None,
    }
