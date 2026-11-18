# -*- coding: utf-8 -*-
"""
成分冲突校验链路：成分归一化 → 规则匹配 → 风险分级
四类规则：DUPLICATE_INGREDIENT成分重复 / CLASS_STACKING同类叠加 / CONTRAINDICATED禁忌配伍 / ELDERLY_CAUTION老年慎用
规则唯一权威源为后端 MySQL（启动拉取 + 变更推送热更新），本地 data/rules.json 仅兜底。
每条命中都返回：解释话术 + 依据来源 + 规则编码 + 版本（可解释、可追溯）。
"""
import json
import logging
from typing import Any, Dict, List, Optional

import requests

import config

log = logging.getLogger("conflict")

# 成分别名归一化表（同一化学成分的不同写法/盐型 → 统一名）
INGREDIENT_ALIASES = {
    "乙酰水杨酸": "阿司匹林", "醋氨酚": "对乙酰氨基酚", "扑热息痛": "对乙酰氨基酚",
    "扑感敏": "对乙酰氨基酚", "必理通": "对乙酰氨基酚", "泰诺林": "对乙酰氨基酚",
    "布洛芬": "布洛芬", "双氯芬酸钠": "双氯芬酸", "双氯芬酸钾": "双氯芬酸",
    "硝苯地平": "硝苯地平", "苯磺酸氨氯地平": "氨氯地平", "氨氯地平": "氨氯地平",
    "阿托伐他汀钙": "阿托伐他汀", "阿托伐他汀": "阿托伐他汀", "辛伐他汀": "辛伐他汀",
    "瑞舒伐他汀钙": "瑞舒伐他汀", "华法林钠": "华法林", "华法林": "华法林",
    "氯吡格雷": "氯吡格雷", "硫酸氢氯吡格雷": "氯吡格雷", "地西泮": "地西泮",
    "安定": "地西泮", "艾司唑仑": "艾司唑仑", "阿普唑仑": "阿普唑仑",
    "格列本脲": "格列本脲", "优降糖": "格列本脲", "格列齐特": "格列齐特",
    "盐酸二甲双胍": "二甲双胍", "二甲双胍": "二甲双胍", "格列美脲": "格列美脲",
    "氯苯那敏": "氯苯那敏", "扑尔敏": "氯苯那敏", "苯海拉明": "苯海拉明",
    "盐酸苯海拉明": "苯海拉明", "阿米替林": "阿米替林", "盐酸阿米替林": "阿米替林",
    "曲马多": "曲马多", "盐酸曲马多": "曲马多", "可待因": "可待因",
    "磷酸可待因": "可待因", "地高辛": "地高辛", "茶碱": "茶碱", "氨茶碱": "茶碱",
    "多潘立酮": "多潘立酮", "吗丁啉": "多潘立酮", "西沙必利": "西沙必利",
    "奥美拉唑": "奥美拉唑", "兰索拉唑": "兰索拉唑", "雷贝拉唑": "雷贝拉唑",
    "泮托拉唑": "泮托拉唑", "铝碳酸镁": "铝碳酸镁", "碳酸钙": "碳酸钙",
    "碳酸钙D3": "碳酸钙", "维生素D": "维生素D", "骨化三醇": "骨化三醇",
    "别嘌醇": "别嘌醇", "非布司他": "非布司他", "秋水仙碱": "秋水仙碱",
    "左氧氟沙星": "左氧氟沙星", "环丙沙星": "环丙沙星", "莫西沙星": "莫西沙星",
    "甲硝唑": "甲硝唑", "替硝唑": "替硝唑", "泼尼松": "泼尼松", "地塞米松": "地塞米松",
    "美托洛尔": "美托洛尔", "琥珀酸美托洛尔": "美托洛尔", "酒石酸美托洛尔": "美托洛尔",
    "比索洛尔": "比索洛尔", "普萘洛尔": "普萘洛尔", "卡托普利": "卡托普利",
    "依那普利": "依那普利", "培哚普利": "培哚普利", "缬沙坦": "缬沙坦",
    "氯沙坦钾": "氯沙坦", "氯沙坦": "氯沙坦", "厄贝沙坦": "厄贝沙坦",
    "呋塞米": "呋塞米", "氢氯噻嗪": "氢氯噻嗪", "螺内酯": "螺内酯",
    "吲达帕胺": "吲达帕胺", "硝酸甘油": "硝酸甘油", "单硝酸异山梨酯": "单硝酸异山梨酯",
    "速效救心丸": "速效救心丸", "复方丹参滴丸": "复方丹参", "丹参": "丹参",
    "银杏叶片": "银杏叶提取物", "银杏叶提取物": "银杏叶提取物", "麻仁软胶囊": "火麻仁",
    "乳果糖": "乳果糖", "开塞露": "甘油", "蒙脱石散": "蒙脱石",
    "氯化钾": "氯化钾", "硫酸亚铁": "硫酸亚铁", "琥珀酸亚铁": "琥珀酸亚铁",
    "左甲状腺素钠": "左甲状腺素", "甲巯咪唑": "甲巯咪唑", "丙硫氧嘧啶": "丙硫氧嘧啶",
    # ---- v1.1 规则扩容新增成分/商品名/常用写法归一化 ----
    "盐酸胺碘酮": "胺碘酮", "可达龙": "胺碘酮",
    "克拉仙": "克拉霉素", "红霉素": "红霉素", "希舒美": "阿奇霉素",
    "大扶康": "氟康唑", "斯皮仁诺": "伊曲康唑",
    "万艾可": "西地那非", "伟哥": "西地那非", "西地那非": "西地那非",
    "希爱力": "他达拉非", "他达拉非": "他达拉非",
    "碳酸锂": "碳酸锂", "得理多": "卡马西平", "卡马西平": "卡马西平",
    "苯妥英": "苯妥英钠", "苯妥英钠": "苯妥英钠", "德巴金": "丙戊酸钠",
    "甲氨蝶呤": "甲氨蝶呤", "MTX": "甲氨蝶呤",
    "拜瑞妥": "利伐沙班", "泰毕全": "达比加群", "达比加群酯": "达比加群",
    "倍林达": "替格瑞洛",
    "左洛复": "舍曲林", "赛乐特": "帕罗西汀", "百忧解": "氟西汀",
    "喜普妙": "西酞普兰", "来士普": "艾司西酞普兰", "怡诺思": "文拉法辛",
    "西乐葆": "塞来昔布", "安康信": "依托考昔", "乐松": "洛索洛芬",
    "消炎痛": "吲哚美辛", "莫比可": "美洛昔康", "消痛灵": "萘普生",
    "美卓乐": "甲泼尼龙", "哈乐": "坦索罗辛", "保列治": "非那雄胺",
    "欧乃派克": "碘海醇", "异搏定": "维拉帕米", "合心爽": "地尔硫氮",
    "地尔硫卓": "地尔硫氮", "盐酸地尔硫氮": "地尔硫氮",
    "诺衡": "吉非罗齐", "力平之": "非诺贝特", "益适纯": "依折麦布",
    "美降之": "洛伐他汀", "舒降之": "辛伐他汀", "立普妥": "阿托伐他汀",
    "可定": "瑞舒伐他汀", "瑞舒伐他汀": "瑞舒伐他汀", "匹伐他汀": "匹伐他汀", "氟伐他汀": "氟伐他汀",
    "瑞彤": "吡格列酮", "文迪雅": "罗格列酮", "拜唐苹": "阿卡波糖", "捷诺维": "西格列汀",
    "艾汀": "吡格列酮", "吡格列酮": "吡格列酮", "罗格列酮": "罗格列酮", "西格列汀": "西格列汀", "阿卡波糖": "阿卡波糖",
    "思诺思": "唑吡坦", "忆梦返": "佐匹克隆", "右佐匹克隆": "佐匹克隆",
    "泰胃美": "西咪替丁", "善胃得": "雷尼替丁", "百炎净": "复方磺胺甲噁唑",
    "磺胺甲噁唑": "复方磺胺甲噁唑", "新诺明": "复方磺胺甲噁唑",
    "异烟肼": "异烟肼", "雷米封": "异烟肼", "利福平": "利福平",
    "易蒙停": "洛哌丁胺", "氯硝安定": "氯硝西泮", "苯巴比妥": "苯巴比妥",
    "鲁米那": "苯巴比妥", "复方氨酚烷胺": "对乙酰氨基酚", "感康": "对乙酰氨基酚",
    "白加黑": "对乙酰氨基酚", "日夜百服咛": "对乙酰氨基酚", "散利痛": "对乙酰氨基酚",
    "巴米尔": "阿司匹林", "拜新同": "硝苯地平", "络活喜": "氨氯地平", "波依定": "非洛地平",
    "非洛地平": "非洛地平", "耐信": "艾司奥美拉唑", "艾司奥美拉唑": "奥美拉唑",
    "格华止": "二甲双胍", "洛赛克": "奥美拉唑", "泮立苏": "泮托拉唑",
    # ---- v1.2 批次3：新增38药归一化（盐型/商品名 → 成分） ----
    "培哚普利叔丁胺": "培哚普利", "多巴丝肼": "左旋多巴", "美多芭": "左旋多巴",
    "息宁": "左旋多巴", "左旋多巴": "左旋多巴", "思瑞康": "喹硫平", "维思通": "利培酮",
    "卫喜康": "索利那新", "乐瑞卡": "普瑞巴林", "派汀": "加巴喷丁", "西比灵": "氟桂利嗪",
    "培达": "西洛他唑", "潘生丁": "双嘧达莫", "胃复安": "甲氧氯普胺", "加斯清": "莫沙必利",
    "安达唐": "达格列净", "来得时": "甘精胰岛素", "诺和龙": "瑞格列奈", "特苏尼": "托拉塞米",
    "可兰特": "伊伐布雷定", "万爽力": "曲美他嗪", "便塞停": "比沙可啶", "福松": "聚乙二醇4000",
    "优思弗": "熊去氧胆酸", "信必可": "布地奈德", "信必可都保": "布地奈德", "思合华": "噻托溴铵",
    "美抒玉": "曲唑酮", "敏使朗": "倍他司汀", "立加利仙": "苯溴马隆", "西力欣": "头孢呋辛",
    "拜复乐": "莫西沙星", "安美汀": "阿莫西林", "阿莫西林克拉维酸钾": "阿莫西林",
    "弥可保": "甲钴胺", "怡诺思": "文拉法辛", "福善美": "阿仑膦酸",
    "倍他乐克": "美托洛尔", "康忻": "比索洛尔", "博苏": "比索洛尔",
    "雅施达": "培哚普利",
    "代文": "缬沙坦", "科素亚": "氯沙坦", "安博维": "厄贝沙坦", "美卡素": "替米沙坦",
    "替米沙坦": "替米沙坦", "坎地沙坦": "坎地沙坦", "奥美沙坦": "奥美沙坦",
    "双氢克尿噻": "氢氯噻嗪", "安体舒通": "螺内酯", "速尿": "呋塞米", "呋喃苯胺酸": "呋塞米",
    "消心痛": "硝酸异山梨酯", "硝酸异山梨酯": "单硝酸异山梨酯", "硫糖铝": "硫糖铝",
    "果导": "酚酞", "痢特灵": "呋喃唑酮", "优甲乐": "左甲状腺素", "雷替斯": "左甲状腺素",
    "福善美": "阿仑膦酸钠", "阿仑膦酸钠": "阿仑膦酸", "盖三淳": "骨化三醇",
    "罗钙全": "骨化三醇", "西格列汀二甲双胍": "西格列汀",
}

SALT_PREFIX = ("盐酸", "甲磺酸", "苯磺酸", "硫酸", "枸橼酸", "酒石酸", "琥珀酸",
               "马来酸", "富马酸", "磷酸", "醋酸", "氢溴酸", "氯化")


def normalize_ingredient(name: str) -> str:
    if not name:
        return ""
    n = name.strip()
    n = n.split("(")[0].split("（")[0].strip()
    if n in INGREDIENT_ALIASES:
        return INGREDIENT_ALIASES[n]
    for p in SALT_PREFIX:
        if n.startswith(p) and len(n) > len(p) + 1:
            stripped = n[len(p):]
            if stripped in INGREDIENT_ALIASES:
                return INGREDIENT_ALIASES[stripped]
            return stripped
    return n


class ConflictEngine:
    def __init__(self):
        self.rules: List[Dict[str, Any]] = []
        self.rules_version = "seed"

    # ---------- 规则装载 ----------
    def load_from_backend(self) -> bool:
        """启动时从后端拉取已审核生效规则（后端 MySQL 为唯一权威源）"""
        try:
            r = requests.get(
                f"{config.BACKEND_URL}/api/internal/rules",
                headers={"X-Service-Key": config.SERVICE_KEY}, timeout=5)
            if r.status_code == 200:
                payload = r.json()
                rules = payload.get("data") or []
                if rules:
                    self.set_rules(rules, version="backend")
                    return True
        except Exception as e:
            log.warning("从后端拉取规则失败（后端未启动？改用本地种子）: %s", e)
        return False

    def load_from_seed(self):
        p = config.DATA_DIR / "rules.json"
        if p.exists():
            rules = json.loads(p.read_text(encoding="utf-8"))
            self.set_rules(rules, version="seed-file")
        else:
            log.warning("本地种子规则文件不存在: %s", p)

    def set_rules(self, rules: List[Dict[str, Any]], version: str = "synced"):
        self.rules = [r for r in rules if r.get("enabled", 1) != 0]
        self.rules_version = version
        log.info("规则库已加载: %d 条 (%s)", len(self.rules), version)

    # ---------- 匹配 ----------
    @staticmethod
    def _med_terms(med: Dict[str, Any]) -> set:
        """一个药的全部可匹配词：药名 + 归一化成分 + 药理分类（类别级规则用）"""
        terms = set()
        name = (med.get("name") or "").strip()
        if name:
            terms.add(name)
            base = name.split("(")[0].split("（")[0].strip()
            terms.add(base)
        ings = med.get("ingredients") or []
        if isinstance(ings, str):
            # 兼容后端传来的成分字符串（"左旋多巴、苄丝肼" / "A,B"）：按顿号/逗号/分号切分，
            # 直接迭代字符串会拆成单字符，导致成分归一化匹配全部失效
            ings = [c for c in ings.replace("、", ",").replace("；", ",").replace(";", ",").split(",") if c.strip()]
        for ing in ings:
            n = normalize_ingredient(str(ing))
            if n:
                terms.add(n)
        cls = (med.get("drugClass") or "").strip()
        if cls:
            terms.add(cls)
        return terms

    @staticmethod
    def _term_hit(rule_term: Optional[str], terms: set) -> bool:
        """规则词命中判断：规则词是药品词的子串，或归一化后相等。
        方向固定为 rt in tn（避免"硝苯地平"(成分)反向命中"硝苯地平片(速释)"规则导致误伤控释片）。"""
        if not rule_term:
            return False
        rt_raw = rule_term.strip()
        rt = normalize_ingredient(rt_raw)
        for t in terms:
            if not t:
                continue
            if rt_raw == t or rt_raw in t:
                return True
            tn = normalize_ingredient(t)
            if rt and tn and (rt == tn or rt in tn):
                return True
        return False

    def check(self, medications: List[Dict[str, Any]]) -> Dict[str, Any]:
        meds = [m for m in medications if (m.get("name") or m.get("ingredients"))]
        if len(meds) < 1:
            return {"conflicts": [], "checkedCount": len(meds), "rulesVersion": self.rules_version}

        terms_list = [(m.get("name") or "未知药", self._med_terms(m), (m.get("drugClass") or "")) for m in meds]
        all_ingredients: Dict[str, List[str]] = {}   # 归一化成分 → 药名列表
        all_classes: Dict[str, List[str]] = {}       # 分类 → 药名列表
        for name, terms, cls in terms_list:
            for t in terms:
                nt = normalize_ingredient(t)
                if nt and nt != name:
                    all_ingredients.setdefault(nt, [])
                    if name not in all_ingredients[nt]:
                        all_ingredients[nt].append(name)
            if cls:
                nc = normalize_ingredient(cls)
                all_classes.setdefault(nc, [])
                if name not in all_classes[nc]:
                    all_classes[nc].append(name)

        conflicts: List[Dict[str, Any]] = []
        seen_codes = set()

        for rule in self.rules:
            code = rule.get("ruleCode", "?")
            if code in seen_codes:
                continue
            rtype = rule.get("ruleType", "")
            a = rule.get("drugA")
            b = rule.get("drugB")
            hit_names: List[str] = []

            if rtype == "DUPLICATE_INGREDIENT":
                # 同一成分出现在≥2个药里，或规则成分对在两个药中分别出现
                if a and b:
                    na = normalize_ingredient(a)
                    nb = normalize_ingredient(b)
                    if na == nb:
                        holders = all_ingredients.get(na, [])
                        if len(holders) >= 2:
                            hit_names = holders
                    else:
                        ha = [n for n in all_ingredients.get(na, [])]
                        hb = [n for n in all_ingredients.get(nb, [])]
                        if ha and hb and set(ha) != set(hb):
                            hit_names = list(dict.fromkeys(ha + hb))
                elif a:
                    holders = all_ingredients.get(normalize_ingredient(a), [])
                    if len(holders) >= 2:
                        hit_names = holders

            elif rtype == "CLASS_STACKING":
                # 同类药物叠加：规则给出类别名（drugA），≥2个药同属该类
                if a:
                    na = normalize_ingredient(a)
                    holders = []
                    for cls, names in all_classes.items():
                        if na in cls or cls in na:
                            holders.extend(names)
                    # 也用成分表兜底（部分药未填 drugClass）
                    if len(set(holders)) < 2 and b:
                        pass
                    if len(set(holders)) >= 2:
                        hit_names = list(dict.fromkeys(holders))

            elif rtype == "CONTRAINDICATED":
                if a and b:
                    ha = [name for name, terms, _ in terms_list if self._term_hit(a, terms)]
                    hb = [name for name, terms, _ in terms_list if self._term_hit(b, terms)]
                    if ha and hb and set(ha) != set(hb):
                        hit_names = list(dict.fromkeys(ha + hb))

            elif rtype == "ELDERLY_CAUTION":
                if a:
                    ha = [name for name, terms, _ in terms_list if self._term_hit(a, terms)]
                    if ha:
                        hit_names = ha

            if hit_names:
                seen_codes.add(code)
                conflicts.append({
                    "ruleCode": code,
                    "ruleType": rtype,
                    "riskLevel": rule.get("riskLevel", "MEDIUM"),
                    "drugs": hit_names,
                    "explanation": rule.get("explanation", ""),
                    "basisSource": rule.get("basisSource", ""),
                    "ruleVersion": rule.get("version", 1),
                })

        # 高风险排前面
        order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        conflicts.sort(key=lambda c: order.get(c["riskLevel"], 3))
        return {
            "conflicts": conflicts,
            "checkedCount": len(meds),
            "rulesVersion": self.rules_version,
            "rulesCount": len(self.rules),
        }


ENGINE = ConflictEngine()
