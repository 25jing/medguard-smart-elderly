# -*- coding: utf-8 -*-
"""RAG 调试脚本：定位重打分全部失配的原因"""
import sys, time
sys.path.insert(0, r"D:\智慧养老安全用药辅助平台\ai-service")
import rag

t0 = time.time()
rag.ENGINE.build()
E = rag.ENGINE
print(f"[built {time.time()-t0:.1f}s] docs={len(E.docs)} content_row={len(E._content_row)} doc_mat={E._doc_mat.shape}")

q = "阿司匹林肠溶片怎么吃，饭前还是饭后"
docs = E.ensemble.invoke(q)
print(f"[ensemble] 返回 {len(docs)} 个文档")
for i, d in enumerate(docs[:6]):
    row = E._content_row.get(d.page_content)
    print(f"  #{i} row={row} title={d.metadata.get('title')} section={d.metadata.get('section')} len={len(d.page_content)}")

r = E.ask(q, [])
print(f"[ask] refused={r['refused']} conf={r.get('confidence')} mode={r.get('mode')}")
for s in r.get("sources", [])[:3]:
    print(f"  来源: {s['title']}·{s['section']} score={s['score']}")

# 直接算：查询向量 vs 阿司匹林·用法用量 的余弦
import numpy as np
qv = np.array(E.embeddings.embed_query(q), dtype=np.float32)
qv = qv / (np.linalg.norm(qv) + 1e-9)
for i, d in enumerate(E.docs):
    if d.metadata.get("title", "").startswith("阿司匹林") and d.metadata.get("section") == "用法用量":
        cos = float(np.dot(qv, E._doc_mat[i]))
        print(f"[manual] 阿司匹林·用法用量 row={i} cos={cos:.4f}")
        # 不加前缀的对照
        qv2 = np.array(E.raw_embeddings.embed_query(q), dtype=np.float32)
        qv2 = qv2 / (np.linalg.norm(qv2) + 1e-9)
        print(f"[manual] 无前缀对照 cos={float(np.dot(qv2, E._doc_mat[i])):.4f}")
        break
