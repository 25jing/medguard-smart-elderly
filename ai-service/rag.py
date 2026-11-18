# -*- coding: utf-8 -*-
"""
RAG 循证问答链路（LangChain + FAISS + BM25 混合召回 + RRF 重排 + 受控生成 + 来源标注 + 拒答）

知识源：药品说明书结构化字段（data/medications.json）+ 老年安全用药科普（data/science_articles.json）
生成：
  - 配置了 LLM_TOKEN/LLM_BASE_URL/LLM_MODEL → LangChain ChatOpenAI 受控生成（只准引用给定片段）
  - 未配置 → 抽取式合成（按问题意图抽取对应说明书小节，逐句可溯源）
拒答：检索得分低于阈值，或问题属于诊断/处方类越界请求。
"""
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import jieba

import config

log = logging.getLogger("rag")

# ---------------- 文档构建 ----------------

def _load_json(name: str) -> Any:
    p: Path = config.DATA_DIR / name
    if not p.exists():
        log.warning("缺少数据文件: %s", p)
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def build_documents() -> List[Dict[str, Any]]:
    """药品说明书 + 科普文章 → LangChain Document 列表（每片带元数据，用于来源标注）"""
    from langchain_core.documents import Document

    docs: List[Document] = []
    for med in _load_json("medications.json"):
        name = med.get("genericName", "")
        brand = med.get("brandName") or ""
        title = name + (f"（{brand}）" if brand else "")
        base_meta = {
            "doc_type": "medication",
            "title": title,
            "med_id": med.get("id"),
            "source": med.get("source", "药品说明书"),
        }
        sections = [
            ("成分与分类", f"成分：{med.get('ingredients', '')}。药理分类：{med.get('drugClass', '')}。"),
            ("适应证", med.get("indications")),
            ("用法用量", med.get("dosage")),
            ("禁忌", med.get("contraindications")),
            ("注意事项", med.get("precautions")),
            ("不良反应", med.get("adverseReactions")),
            ("储存", med.get("storage")),
        ]
        for sec, content in sections:
            if not content:
                continue
            docs.append(Document(
                page_content=f"【{name}·{sec}】{content}",
                metadata={**base_meta, "section": sec},
            ))

    for art in _load_json("science_articles.json"):
        title = art.get("title", "")
        text = art.get("content", "")
        # 科普长文按段落切成 ~300 字片段
        paras = [p.strip() for p in re.split(r"\n+", text) if len(p.strip()) > 20]
        buf = ""
        idx = 0
        for p in paras:
            if len(buf) + len(p) > 300 and buf:
                idx += 1
                docs.append(Document(
                    page_content=f"【{title}】{buf}",
                    metadata={"doc_type": "science", "title": title, "section": f"第{idx}段",
                              "source": art.get("source", "老年安全用药科普")},
                ))
                buf = p
            else:
                buf = (buf + "\n" + p) if buf else p
        if buf:
            idx += 1
            docs.append(Document(
                page_content=f"【{title}】{buf}",
                metadata={"doc_type": "science", "title": title, "section": f"第{idx}段",
                          "source": art.get("source", "老年安全用药科普")},
            ))
    log.info("知识库文档构建完成: %d 片段", len(docs))
    return docs


# ---------------- 索引 ----------------

# BGE 系列官方推荐：查询侧加检索指令前缀（文档侧不加），显著提升短查询→长文档的检索相关性
BGE_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


class _QueryPrefixEmbeddings:
    """包装 HuggingFaceEmbeddings：embed_query 自动加 BGE 检索指令前缀"""

    def __init__(self, inner):
        self.inner = inner

    def embed_query(self, text: str):
        return self.inner.embed_query(BGE_QUERY_PREFIX + text)

    def embed_documents(self, texts):
        return self.inner.embed_documents(texts)

    def __call__(self, text: str):
        # langchain_community FAISS._embed_query 兼容路径：非 Embeddings 实例时直接调用
        # （构建路径传入本对象，缓存加载路径传入绑定方法，两条路径都要能工作）
        return self.embed_query(text)


# BM25 中文分词：jieba 切分后去掉标点与空白（避免单字符标点稀释词频）
_PUNCT = set("，。、；：？！“”‘’（）《》【】…—·,.;:?!()[]{}<>|~@#$%^&*-_+=/\\ \n\r\t")


def _bm25_tokenize(text: str) -> List[str]:
    return [t for t in jieba.lcut(text) if t.strip() and t not in _PUNCT]


# 药名存在性守门（防编造药名）：
#   问题带剂型词但既没命中知识库任何药名/成分、也没命中通用用药词 → 判定为库外药品，拒答不编造
_DOSAGE_FORMS = ("胶囊", "片", "颗粒", "丸", "口服液", "注射液", "滴眼液", "糖浆",
                 "喷雾剂", "软膏", "乳膏", "贴剂", "散剂", "胶丸")
_GENERAL_MED_TERMS = ("肠溶", "缓释", "控释", "泡腾", "中成药", "西药", "抗生素", "消炎药",
                      "退烧药", "止痛药", "感冒药", "降压药", "降糖药", "降脂药", "安眠药",
                      "泻药", "维生素", "钙片", "益生菌", "胃药", "止咳", "化痰",
                      "药盒", "说明书", "用药", "吃药", "服药", "漏服", "忘吃")


class RagEngine:
    def __init__(self):
        self.embeddings = None
        self.vectorstore = None
        self.ensemble = None
        self.docs: List[Any] = []
        self.llm_chain = None
        self.ready = False

    def build(self):
        t0 = time.time()
        from langchain_community.embeddings import HuggingFaceEmbeddings
        from langchain_community.vectorstores import FAISS
        from langchain_community.retrievers import BM25Retriever
        from langchain.retrievers import EnsembleRetriever

        self.docs = build_documents()
        if not self.docs:
            raise RuntimeError("知识库为空，无法构建索引")

        # 药名词表（编造药名守门用）：通用名/商品名/成分
        self.known_terms = set()
        for med in _load_json("medications.json"):
            for key in ("genericName", "brandName"):
                v = (med.get(key) or "").strip()
                if len(v) >= 2:
                    self.known_terms.add(v)
            for ing in str(med.get("ingredients") or "").replace("、", ",").replace("；", ",").replace(";", ",").split(","):
                ing = ing.strip()
                if len(ing) >= 2:
                    self.known_terms.add(ing)

        self.raw_embeddings = HuggingFaceEmbeddings(
            model_name=config.EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"device": "cpu", "batch_size": 16, "normalize_embeddings": True},
        )
        self.embeddings = _QueryPrefixEmbeddings(self.raw_embeddings)

        # 向量索引（FAISS）：优先加载持久化副本，语料变化则重建
        # 注意：faiss C++ 的 write_index 不支持中文路径，这里用 serialize_index + Python 文件 IO 持久化
        store_dir = config.FAISS_STORE_DIR
        if self._load_store(store_dir):
            log.info("FAISS 索引从缓存加载")
        else:
            self.vectorstore = FAISS.from_documents(self.docs, self.embeddings)
            self._save_store(store_dir)
            log.info("FAISS 索引构建并持久化: %s", store_dir)

        # 关键词索引（BM25 + jieba 中文分词，去标点）
        bm25 = BM25Retriever.from_documents(
            self.docs, preprocess_func=_bm25_tokenize, k=config.RETRIEVE_K)

        # 混合召回 + RRF 重排（EnsembleRetriever 内部即加权 RRF）
        faiss_ret = self.vectorstore.as_retriever(search_kwargs={"k": config.RETRIEVE_K})
        self.ensemble = EnsembleRetriever(retrievers=[bm25, faiss_ret], weights=[0.4, 0.6])

        # 预缓存全部文档向量（直接从 FAISS 索引 reconstruct，避免每次提问重复 embed 文档）
        self._cache_doc_vectors()

        self.llm_chain = self._build_llm_chain()
        self.ready = True
        log.info("RAG 引擎就绪，用时 %.1fs，LLM受控生成=%s",
                 time.time() - t0, "开" if self.llm_chain else "关(抽取式)")

    def _cache_doc_vectors(self):
        """从 FAISS 索引还原每个文档的归一化向量，建立 page_content→向量行 的映射。
        注意：LangChain FAISS 的 index_to_docstore_id 值是 UUID 文档id（不是行号），
        需要经 docstore.search(doc_id) 取回 Document，再按内容匹配 self.docs 的行号。"""
        import numpy as np
        idx = self.vectorstore.index
        content_row = {d.page_content: i for i, d in enumerate(self.docs)}
        self._content_row = content_row
        mat = np.zeros((len(self.docs), idx.d), dtype=np.float32)
        i2d = self.vectorstore.index_to_docstore_id
        docstore = self.vectorstore.docstore
        filled = 0
        for i in range(idx.ntotal):
            doc_id = i2d.get(i)
            if doc_id is None:
                continue
            try:
                doc = docstore.search(doc_id)
            except Exception:
                continue
            row = content_row.get(getattr(doc, "page_content", None))
            if row is None:
                continue
            mat[row] = idx.reconstruct(i)
            filled += 1
        self._doc_mat = mat
        log.info("文档向量缓存完成: %d x %d (填充 %d/%d)", *mat.shape, filled, idx.ntotal)

    def _corpus_fingerprint(self) -> dict:
        """语料指纹：条数 + 全量内容摘要，缓存与当前语料不一致时强制重建索引"""
        import hashlib
        h = hashlib.sha256()
        for d in self.docs:
            h.update(d.page_content.encode("utf-8", "ignore"))
        return {"n_docs": len(self.docs), "digest": h.hexdigest()[:32]}

    def _save_store(self, dirpath: Path):
        """自实现持久化（Unicode 路径安全）：index 用 faiss.serialize_index，docstore 用 pickle，meta 记录语料指纹"""
        import pickle
        import numpy as np
        import faiss
        try:
            dirpath.mkdir(parents=True, exist_ok=True)
            arr = faiss.serialize_index(self.vectorstore.index)
            np.save(str(dirpath / "index.npy"), arr)
            with open(dirpath / "docstore.pkl", "wb") as f:
                pickle.dump({
                    "docstore": self.vectorstore.docstore._dict,
                    "index_to_docstore_id": self.vectorstore.index_to_docstore_id,
                }, f)
            import json as _json
            (dirpath / "meta.json").write_text(
                _json.dumps(self._corpus_fingerprint(), ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            log.warning("FAISS 持久化失败（不影响本次运行，下次启动重建）: %s", e)

    def _load_store(self, dirpath: Path) -> bool:
        import pickle
        import numpy as np
        import faiss
        from langchain_community.vectorstores import FAISS
        from langchain_community.docstore.in_memory import InMemoryDocstore
        try:
            idx_file = dirpath / "index.npy"
            doc_file = dirpath / "docstore.pkl"
            meta_file = dirpath / "meta.json"
            if not (idx_file.exists() and doc_file.exists() and meta_file.exists()):
                return False
            import json as _json
            meta = _json.loads(meta_file.read_text(encoding="utf-8"))
            if meta != self._corpus_fingerprint():
                log.info("语料已变化（缓存 %s 条/指纹 %s，当前 %s 条/指纹 %s），FAISS 索引将重建",
                         meta.get("n_docs"), meta.get("digest"),
                         len(self.docs), self._corpus_fingerprint()["digest"])
                return False
            index = faiss.deserialize_index(np.load(str(idx_file)))
            with open(doc_file, "rb") as f:
                blob = pickle.load(f)
            self.vectorstore = FAISS(
                self.embeddings.embed_query, index,
                InMemoryDocstore(blob["docstore"]), blob["index_to_docstore_id"])
            return True
        except Exception as e:
            log.warning("FAISS 缓存加载失败，将重建: %s", e)
            return False

    def _build_llm_chain(self):
        """可选：OpenAI 兼容端点的受控生成链（提示词强约束：只准引用片段、必须标注来源、不确定就拒答）"""
        if not (config.LLM_TOKEN and config.LLM_BASE_URL and config.LLM_MODEL):
            return None
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.prompts import ChatPromptTemplate
            llm = ChatOpenAI(
                model=config.LLM_MODEL,
                api_key=config.LLM_TOKEN,
                base_url=config.LLM_BASE_URL,
                temperature=0.1,
                max_tokens=700,
                timeout=40,
            )
            prompt = ChatPromptTemplate.from_messages([
                ("system",
                 "你是适老化用药助手。只依据【资料片段】回答，禁止编造；每条结论后用[来源N]标注片段编号；"
                 "资料不足以回答或问题涉及诊断/开处方时，明确拒答并建议咨询医生或药师。"
                 "回答用通俗易懂的短句，适合老人阅读。"),
                ("human", "【资料片段】\n{context}\n\n【用户当前在用药】\n{meds}\n\n【问题】\n{question}"),
            ])
            return prompt | llm
        except Exception as e:
            log.warning("LLM 链构建失败，回退抽取式: %s", e)
            return None

    # ---------------- 检索 + 生成 ----------------

    INTENTS = [
        ("dosage", ["怎么吃", "怎么用", "用法", "用量", "剂量", "一次吃几", "一天吃几", "饭前", "饭后", "服用方法", "吃多少"]),
        ("contraindications", ["禁忌", "不能吃", "不宜", "忌服", "哪些人不能"]),
        ("adverse", ["副作用", "不良反应", "吃了难受", "头晕", "恶心"]),
        ("precautions", ["注意", "小心", "忌口", "能喝酒", "开车", "忘记吃", "漏服"]),
        ("storage", ["保存", "储存", "存放", "过期"]),
        ("interaction", ["一起吃", "同时服用", "冲突", "相互作用", "能同时", "混着吃"]),
    ]

    def _intent(self, question: str) -> str:
        for name, kws in self.INTENTS:
            if any(k in question for k in kws):
                return name
        return "general"

    def _unknown_drug_guard(self, question: str) -> Optional[str]:
        """编造/库外药名守门：问句带剂型词（胶囊/片/…）但未命中知识库任何药名、成分，
        也未命中通用用药词时，判定为库外药品。医疗场景宁拒答不编造——
        否则"XX胶囊的用法用量"会与所有【用法用量】片段句式相似而拿到虚高向量分。"""
        if any(t in question for t in self.known_terms):
            return None
        if any(g in question for g in _GENERAL_MED_TERMS):
            return None
        if any(f in question for f in _DOSAGE_FORMS):
            return ("药品知识库中未收录您问的这种药，我不能凭空回答。请核对药盒上的通用名后再问我"
                    "（例如：药名+怎么吃），或咨询医生、药师。")
        return None

    def _out_of_scope(self, question: str) -> Optional[str]:
        ban = ["帮我诊断", "我是什么病", "给我开药", "开处方", "处方开", "该做什么手术",
               "帮我挂号", "彩票", "写代码", "翻译一下", "讲个笑话",
               "股票", "炒股", "基金", "理财", "投资", "房价", "买房",
               "天气", "新闻", "你是谁", "你叫什么", "作文", "数学题",
               "编程", "赌博", "算命", "星座", "八卦"]
        for b in ban:
            if b in question:
                return ("这个问题超出了用药助手的范围。我只能回答药品用法、禁忌、注意事项等问题，"
                        "疾病诊断和处方请咨询医生。")
        return None

    def ask(self, question: str, medications: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        if not self.ready:
            return {"answer": "知识库还在启动中，请稍等10秒再试。", "sources": [],
                    "confidence": 0.0, "refused": True, "mode": "booting"}

        t0 = time.time()
        refuse = self._out_of_scope(question) or self._unknown_drug_guard(question)
        if refuse:
            return {"answer": refuse, "sources": [], "confidence": 0.0,
                    "refused": True, "mode": "guard"}

        docs = self.ensemble.invoke(question)
        # 归一化得分：查询向量(带BGE检索前缀) × 预缓存的文档向量（余弦，纯内存计算，毫秒级）
        import numpy as np
        q_vec = np.array(self.embeddings.embed_query(question), dtype=np.float32)
        q_vec = q_vec / (np.linalg.norm(q_vec) + 1e-9)
        scored = []
        seen_content = set()
        for d in docs[:10]:
            if d.page_content in seen_content:
                continue
            seen_content.add(d.page_content)
            row = self._content_row.get(d.page_content)
            if row is None:
                continue
            cos = float(np.dot(q_vec, self._doc_mat[row]))
            scored.append((cos, d))
        scored.sort(key=lambda x: -x[0])
        top = scored[:5]
        best_score = top[0][0] if top else 0.0
        retrieval_ms = int((time.time() - t0) * 1000)

        # 拒答机制：检索置信不足
        if best_score < config.REFUSE_SCORE or not top:
            return {
                "answer": "我在药品知识库里没有找到可靠依据，不敢乱回答。建议您咨询医生或药师，"
                          "或者换个说法再问我一次（比如药名+怎么吃）。",
                "sources": [], "confidence": round(best_score, 4),
                "refused": True, "mode": "refuse", "retrievalMs": retrieval_ms,
            }

        intent = self._intent(question)
        sources = [{
            "index": i + 1,
            "title": d.metadata.get("title", ""),
            "section": d.metadata.get("section", ""),
            "source": d.metadata.get("source", ""),
            "score": round(s, 4),
            "text": d.page_content[:400],
        } for i, (s, d) in enumerate(top)]

        meds_text = "无"
        if medications:
            meds_text = "、".join(m.get("name", "?") for m in medications)

        if self.llm_chain is not None:
            try:
                ctx = "\n".join(f"[来源{i+1}] {d.page_content}" for i, (_, d) in enumerate(top))
                resp = self.llm_chain.invoke({"context": ctx, "question": question, "meds": meds_text})
                answer = resp.content if hasattr(resp, "content") else str(resp)
                mode = "llm"
            except Exception as e:
                log.warning("LLM 生成失败，回退抽取式: %s", e)
                answer = self._extractive(question, intent, top)
                mode = "extractive-fallback"
        else:
            answer = self._extractive(question, intent, top)
            mode = "extractive"

        return {
            "answer": answer,
            "sources": sources,
            "confidence": round(min(0.99, (best_score + 0.2) * 0.9), 4),
            "refused": False,
            "mode": mode,
            "intent": intent,
            "corpusChunks": len(self.docs),
            "retrievalMs": retrieval_ms,
            "totalMs": int((time.time() - t0) * 1000),
        }

    def _extractive(self, question: str, intent: str, top: List[Any]) -> str:
        """抽取式受控合成：按意图优先选取对应小节，逐句可溯源，绝不生成知识库以外的内容"""
        picked: List[str] = []
        seen_titles = set()
        # 意图小节优先
        section_map = {
            "dosage": "用法用量", "contraindications": "禁忌", "adverse": "不良反应",
            "precautions": "注意事项", "storage": "储存", "interaction": None,
        }
        want = section_map.get(intent, None)
        for s, d in top:
            sec = d.metadata.get("section", "")
            if want and sec == want:
                body = re.sub(r"^【[^】]+】", "", d.page_content)
                tag = f"[来源·{d.metadata.get('title','')}·{sec}]"
                if tag not in seen_titles:
                    picked.append(f"{body}（{tag}）")
                    seen_titles.add(tag)
        # 补足到 2~3 条
        for s, d in top:
            if len(picked) >= 3:
                break
            sec = d.metadata.get("section", "")
            body = re.sub(r"^【[^】]+】", "", d.page_content)
            tag = f"[来源·{d.metadata.get('title','')}·{sec}]"
            if tag not in seen_titles:
                picked.append(f"{body}（{tag}）")
                seen_titles.add(tag)
        head = "根据药品知识库资料，为您找到这些信息：\n"
        if intent == "interaction":
            head = "关于能不能一起吃，资料如下（是否同服请再问医生或药师）：\n"
        return head + "\n".join(f"{i+1}. {p}" for i, p in enumerate(picked)) + \
               "\n\n温馨提示：以上信息来自药品说明书与权威资料，具体用药请遵医嘱。"


ENGINE = RagEngine()
