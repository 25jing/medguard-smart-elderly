# -*- coding: utf-8 -*-
"""检查 FAISS 持久化文件的完整性"""
import pickle
import numpy as np
import faiss

base = r"D:\智慧养老安全用药辅助平台\models\faiss_store"
arr = np.load(base + r"\index.npy")
print("index.npy dtype:", arr.dtype, "shape:", arr.shape)
idx = faiss.deserialize_index(arr)
print("反序列化后 ntotal:", idx.ntotal, "d:", idx.d)
if idx.ntotal > 0:
    v = idx.reconstruct(0)
    print("reconstruct(0) 前5维:", v[:5], "范数:", float(np.linalg.norm(v)))

with open(base + r"\docstore.pkl", "rb") as f:
    blob = pickle.load(f)
i2d = blob["index_to_docstore_id"]
items = list(i2d.items())[:3]
print("index_to_docstore_id 条数:", len(i2d), "样例:", items, "key类型:", type(items[0][0]))
print("docstore 条数:", len(blob["docstore"]))
