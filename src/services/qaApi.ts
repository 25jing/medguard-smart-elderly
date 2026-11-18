import axios, { type AxiosInstance } from 'axios'

/** 命中知识库条目的类别，用于前端展示与统计。 */
export type QaCategory = 'medicine' | 'care'

/** 一条 RAG 参考来源：Python 服务返回命中的知识库片段时使用相同结构。 */
export interface QaSource {
  title: string
  snippet: string
}

/** 一次问答的完整回答：正文 + 参考来源列表。 */
export interface QaAnswer {
  answer: string
  sources: QaSource[]
}

/** 问答请求附带角色，Python 服务可据此调整回答语气（老人版更通俗）。 */
export type QaRole = 'elder' | 'guardian'

/**
 * 联调独立 Python RAG 服务时改为 false，并配置 VITE_QA_API_BASE_URL。
 * 该服务独立于 SpringBoot 后端部署，因此使用单独的环境变量与请求实例。
 *
 * 对 Python 服务的接口约定（收到 question 后检索知识库再生成回答）：
 *   POST {VITE_QA_API_BASE_URL}/ask
 *   请求体: { "question": string, "role": "elder" | "guardian", "topK": number }
 *   响应体: { "success": true, "data": { "answer": string, "sources": [{ "title": string, "snippet": string }] }, "message": string }
 */
const USE_MOCK_API = true

const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_QA_API_BASE_URL ?? '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

interface KnowledgeEntry {
  id: string
  category: QaCategory
  title: string
  keywords: string[]
  answer: string
}

/**
 * 演示用本地知识库：内容为面向大众的通用健康科普，
 * 不能替代医生或药师的专业意见；接 Python 服务后由向量检索替代。
 */
const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: 'med-antihypertensive',
    category: 'medicine',
    title: '降压药的作用',
    keywords: ['降压药', '血压高', '高血压', '血压'],
    answer: '降压药用于控制血压、降低心脑血管疾病的风险，常见类型包括地平类、普利类、沙坦类等。\n高血压多数需要长期规律服药，即使感觉没有不舒服也不能自行停药或减量，血压波动反而更危险。\n如果服药后出现头晕、乏力、脚踝水肿等不适，请及时告诉医生，由医生调整方案。',
  },
  {
    id: 'med-hypoglycemic',
    category: 'medicine',
    title: '降糖药的作用',
    keywords: ['降糖药', '血糖', '糖尿病', '二甲双胍', '胰岛素'],
    answer: '降糖药用于控制血糖，常见的二甲双胍一般随餐或餐后服用，可减少胃肠不适。\n要警惕低血糖：出现心慌、出汗、手抖、明显饥饿感时，应立即吃点糖块或喝糖水，缓解后告诉家人。\n规律监测血糖并做好记录，复诊时带给医生看。',
  },
  {
    id: 'med-aspirin',
    category: 'medicine',
    title: '阿司匹林肠溶片的作用',
    keywords: ['阿司匹林', '抗血小板', '血栓'],
    answer: '小剂量阿司匹林常用于抗血小板聚集、预防血栓，多在医生指导下长期服用。\n服药期间注意出血倾向，如牙龈出血不止、皮肤瘀斑、黑便等，应尽快就医。\n是否需要服用、服用剂量必须由医生评估，不要自行开始或停用。',
  },
  {
    id: 'med-nitroglycerin',
    category: 'medicine',
    title: '硝酸甘油的急救用法',
    keywords: ['硝酸甘油', '心绞痛', '急救', '胸口疼'],
    answer: '硝酸甘油是心绞痛急救药，发作时取半坐位，将药片含在舌下，不要吞服。\n含服 5 分钟仍不缓解可再含一片，最多 3 片；若胸痛持续超过 15 分钟不缓解，要立即拨打 120，警惕心肌梗死。\n药品需避光密封保存，注意有效期，家人应定期检查并帮老人更换过期药。',
  },
  {
    id: 'med-statin',
    category: 'medicine',
    title: '他汀类降脂药的作用',
    keywords: ['他汀', '降脂', '血脂', '胆固醇'],
    answer: '他汀类药物用于降低血脂、稳定血管斑块，通常在晚间服用效果较好，具体遵医嘱。\n少数人服药后出现肌肉酸痛、乏力，若症状明显请告知医生，由医生判断是否调整。\n服药期间仍需配合低脂饮食和适度活动，定期复查血脂和肝功能。',
  },
  {
    id: 'med-sedative',
    category: 'medicine',
    title: '安眠药的使用注意',
    keywords: ['安眠药', '助眠', '镇静', '失眠药'],
    answer: '安眠药一般用于短期改善睡眠，应在医生指导下使用，不要自行加量或长期服用。\n服药后夜间起床容易跌倒，建议先在床边坐一会儿再慢慢起身，最好有夜灯和家人陪护。\n服用安眠药期间不要饮酒，也不要与感冒药随意同服。',
  },
  {
    id: 'med-cold',
    category: 'medicine',
    title: '老人服用感冒药的注意',
    keywords: ['感冒药', '复方感冒', '伪麻黄碱', '感冒'],
    answer: '复方感冒药成分相近，同时吃两种容易重复用药，选一种即可。\n高血压、心脏病老人慎用含伪麻黄碱的感冒药，可能引起血压升高；买药时可请药师帮忙选择。\n感冒期间多休息、多喝温水；若发烧不退、咳嗽加重或气短，请及时就医。',
  },
  {
    id: 'med-calcium',
    category: 'medicine',
    title: '钙片与维生素D的补充',
    keywords: ['钙片', '补钙', '维生素d', '骨质疏松'],
    answer: '钙片配合维生素D有助于维持骨密度、预防骨质疏松；维生素D还能促进钙吸收。\n钙片一次不宜吃太多，可分次服用，与牛奶、浓茶间隔开效果更好。\n平时适当晒太阳、做散步等负重活动，对骨骼健康同样重要。',
  },
  {
    id: 'med-stomach',
    category: 'medicine',
    title: '常见胃药的使用',
    keywords: ['胃药', '胃酸', '烧心', '反酸', '奥美拉唑'],
    answer: '常见的抑酸类胃药（如奥美拉唑）多在晨起空腹时服用，效果较好，具体遵药品说明书或医嘱。\n偶尔胃部不适可短期使用；若反复烧心、反酸超过两周，或出现黑便、消瘦，请及时就医检查。\n平时少食多餐，避免过烫、辛辣和油腻食物。',
  },
  {
    id: 'med-tcm',
    category: 'medicine',
    title: '中药与中成药的使用',
    keywords: ['中药', '中成药', '草药', '中医药'],
    answer: '中药、中成药同样需要辨证使用，建议由中医师诊断后开具，不要长期自行服用同一种药。\n中西药同服可能相互作用，一般建议间隔 1-2 小时，并把正在服用的所有药品告诉医生。\n选购中成药时认准批准文号，谨防来路不明的"祖传秘方"。',
  },
  {
    id: 'care-missed-dose',
    category: 'care',
    title: '漏服药物怎么办',
    keywords: ['漏服', '忘记吃', '漏吃', '补服', '忘服药'],
    answer: '通用原则：想起时距离下次服药还早，可以立即补服；已临近下次服药时间，就跳过这一次，切勿一次吃双倍剂量。\n降压药、降糖药等特殊药品的补服规则不同，拿不准时咨询医生或药师。\n经常漏服可以用分格药盒、手机提醒，或请家人帮忙核对。',
  },
  {
    id: 'care-storage',
    category: 'care',
    title: '家庭药品的储存',
    keywords: ['存药', '储存', '过期药', '药箱'],
    answer: '药品放在避光、干燥、阴凉处，保留原包装和说明书，方便查阅用法和有效期。\n硝酸甘油等急救药放在容易拿到的地方，家人都应知道位置。\n每 3-6 个月清理一次家庭药箱，过期药品及时处理，不要继续服用。',
  },
  {
    id: 'care-diet',
    category: 'care',
    title: '老人的日常饮食',
    keywords: ['饮食', '吃什么', '营养', '食谱', '吃饭'],
    answer: '饮食总体原则：少盐、少油、少糖，多吃新鲜蔬果和粗粮。\n保证优质蛋白摄入，如鸡蛋、牛奶、鱼虾、豆制品；牙口不好可做成蒸蛋、豆腐、鱼茸等软食。\n吃饭小口慢咽防噎食，每天足量饮水；若有糖尿病、肾病等，饮食方案请遵医嘱调整。',
  },
  {
    id: 'care-fall',
    category: 'care',
    title: '预防老人跌倒',
    keywords: ['跌倒', '摔倒', '防滑', '防跌倒'],
    answer: '起床遵循"三个半分钟"：醒后躺半分钟、坐起半分钟、双腿下垂半分钟再站立，避免体位性低血压。\n家中保持地面干燥无杂物，卫生间装扶手和防滑垫，夜里留一盏夜灯。\n穿合脚防滑的鞋，裤腿不要太长；视力和听力下降也会增加跌倒风险，及时矫正。',
  },
  {
    id: 'care-bp-monitor',
    category: 'care',
    title: '在家自测血压',
    keywords: ['量血压', '测血压', '血压计', '血压监测'],
    answer: '测量前静坐 5 分钟，不喝浓茶咖啡、不吸烟；坐位，袖带与心脏保持同一高度。\n每天早晚固定时间各测一次并记录，复诊时把记录带给医生，比单次数值更有参考价值。\n测量时保持安静不说话，连测两次间隔 1-2 分钟取平均值。',
  },
  {
    id: 'care-med-management',
    category: 'care',
    title: '帮助老人按时服药',
    keywords: ['按时服药', '服药管理', '药盒', '提醒服药', '监督'],
    answer: '使用一周分格药盒，由家人每周帮忙分装，服药情况一眼可见。\n把服药时间和日常生活绑定，例如"早饭后一片"，更容易形成习惯。\n家属定期核对剩余药量，既能发现漏服，也能及时补充药品；本平台的用药计划和提醒功能也可以帮忙。',
  },
  {
    id: 'care-sleep',
    category: 'care',
    title: '老人的睡眠照护',
    keywords: ['睡眠', '睡不好', '失眠', '作息'],
    answer: '保持规律作息，白天多活动、多晒太阳，晚上更容易入睡。\n午睡控制在 30 分钟以内；傍晚后少喝茶水，减少夜间起夜。\n若长期失眠、夜间打鼾严重或白天嗜睡，建议就医评估，不要长期自行服用安眠药。',
  },
  {
    id: 'care-memory',
    category: 'care',
    title: '老人记忆力下降的应对',
    keywords: ['记性', '忘事', '记忆力', '痴呆', '认知'],
    answer: '用日历、便签、手机提醒辅助记忆，常用物品固定放在同一位置。\n与老人交流时语速放慢、一次说一件事，多耐心少纠正。\n偶尔忘事属正常衰老，但若频繁忘记刚发生的事、迷路或性格明显改变，应尽早到记忆门诊评估。',
  },
]

/** 无任何命中时的兜底回答。 */
const FALLBACK_ANSWER = '抱歉，暂时没有在知识库里找到与您问题直接相关的资料。\n建议您：\n1. 换成更具体的说法，例如带上药品名称（"降压药是干什么的"）；\n2. 咨询医生或药师获得专业意见；\n3. 情况紧急时请立即就医或拨打 120。'

/** 模拟向量检索：按关键词命中数排序，返回最相关的若干条。 */
function retrieve(question: string, topK: number): KnowledgeEntry[] {
  const normalized = question.toLowerCase()
  return KNOWLEDGE_BASE
    .map((entry) => {
      let score = 0
      for (const keyword of entry.keywords) {
        if (normalized.includes(keyword.toLowerCase())) score += keyword.length >= 3 ? 3 : 2
      }
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.entry)
}

/** 模拟 RAG 生成：把检索命中的条目组装成带参考来源的回答。 */
function composeMockAnswer(question: string, role: QaRole, topK: number): QaAnswer {
  const hits = retrieve(question, topK)
  if (!hits.length) return { answer: FALLBACK_ANSWER, sources: [] }
  const intro = role === 'elder' ? '为您找到以下参考信息：' : '根据您的问题，检索到以下参考信息：'
  const body = hits.map((entry) => `【${entry.title}】\n${entry.answer}`).join('\n\n')
  const outro = '\n\n—— 以上内容仅供健康参考，不能替代医生或药师的专业意见。'
  return {
    answer: `${intro}\n\n${body}${outro}`,
    sources: hits.map((entry) => ({ title: entry.title, snippet: `${entry.answer.slice(0, 50)}…` })),
  }
}

function waitForMockResponse(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 900))
}

/** 提交一个问答请求：默认走本地模拟 RAG，接通 Python 服务后走真实检索问答。 */
export async function askQuestion(question: string, role: QaRole, topK = 3): Promise<QaAnswer> {
  if (USE_MOCK_API) {
    await waitForMockResponse()
    return composeMockAnswer(question, role, topK)
  }
  const response = await request.post<{ success: boolean; data: QaAnswer; message?: string }>('/ask', { question, role, topK })
  if (!response.data.success) throw new Error(response.data.message || '问答服务暂时不可用。')
  return response.data.data
}
