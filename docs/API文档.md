# API 文档 · 智慧养老安全用药辅助平台

> Base URL: `http://127.0.0.1:8080` · 所有响应统一为 `{ "code": 0, "msg": "ok", "data": ... }`
> code≠0 即业务错误（401 未登录 / 403 无权限 / 429 限流 / 503 AI服务不可用）
> 鉴权：除 `/api/auth/login`、`/api/auth/register`、`/api/health`、`/api/internal/**` 外均需请求头 `Authorization: Bearer <JWT>`
> 角色：ELDER（老人）/ FAMILY（家属）/ ADMIN（管理员）；家属访问老人数据必须持有对应授权 scope

## 0. 公共

### GET /api/health（无需登录）
```json
{ "code":0, "data": { "status":"UP", "backend":"UP", "ai":"UP", "time":"2026-11-15T17:05:00" } }
```

## 1. 认证与账号 `/api/auth`

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | /register | 公开 | 注册。body: `{name, phone, password(≥6位), role(ELDER/FAMILY), birthYear?, consent:true}`；consent 必须为 true（知情同意时间落库） |
| POST | /login | 公开 | 登录。body: `{phone, password}`（管理员 phone=`admin`）。返回 `{token, user:{id,phone,name,role,birthYear,consentAt,healthConsentAt}}` |
| GET | /me | 登录 | 当前用户信息（同上 user 结构） |
| POST | /consent/health | 登录 | 健康信息单独同意/撤回。body: `{agree: true/false}`，落库 `healthConsentAt` |
| DELETE | /account | 登录 | 注销账号（软删除；用药记录保存至注销后30天由定时任务级联清除） |

## 2. 用药计划 `/api/plans`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /plans | 我的计划列表（MedPlan：`id, medicationId, medName, doseText, times("08:00,20:00"), startDate, endDate, notes, active, createdAt`） |
| POST | /plans | 新建计划，**服务端自动做全量冲突校验**。body: `{medicationId?, medName?, doseText, times:["08:00","20:00"], startDate?, endDate?, notes?}`（medicationId 与 medName 至少其一）。返回 `{plan, conflictWarnings:[...]}`，conflictWarnings 结构见 §5 |
| POST | /plans/{id}/stop | 停用计划（软停用，今日任务随之消失） |

## 3. 冲突校验 `/api/conflict/check`

POST，无 body（或 `{}`）。对**当前老人全部在用计划**跑 AI 规则引擎，返回裸数组：
```json
{ "code":0, "data": [ {
  "ruleCode":"CR-ASP-IBU", "ruleType":"CONTRAINDICATED", "riskLevel":"HIGH",
  "drugs":["阿司匹林肠溶片","布洛芬缓释胶囊"],
  "explanation":"布洛芬会抢占阿司匹林的抗血小板作用位点……",
  "basisSource":"阿司匹林/布洛芬说明书【药物相互作用】；FDA安全通告",
  "ruleVersion":1 } ] }
```
ruleType 四类：`DUPLICATE_INGREDIENT` 成分重复 / `CLASS_STACKING` 同类叠加 / `CONTRAINDICATED` 禁忌配伍 / `ELDERLY_CAUTION` 老年慎用（Beers/中国老年PIM标准）。排序 HIGH>MEDIUM>LOW。

## 4. 打卡·提醒·依从率

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /checkins/today | 今日任务（Checkin：`id, planId, elderId, medName, scheduledAt, checkedAt, status, note`；status: PENDING/TAKEN/LATE/MISSED） |
| POST | /checkins/{id} | 打卡。body 可选 `{note}`。判定规则：计划时间±10分钟内=TAKEN；超10–60分钟=LATE；超60分钟由定时任务标 MISSED，**MISSED 后仍可补打卡→转 LATE** |
| GET | /checkins/history?days=30 | 历史记录（按日分组友好结构） |
| GET | /reminders | 我的未读/待处理应用内提醒（服药前10分钟自动生成，2小时未读自动过期） |
| POST | /reminders/{id}/read | 标记已读 |
| GET | /stats/adherence?days=7 | 依从率 `{days, taken, late, missed, pending, adherenceRate, trend:[{d,status,cnt}]}`（家属调用时仅汇总无 trend） |

## 5. AI 能力（后端代理，含限流：识别10次/分、问答20次/分）

### POST /api/recognize（multipart，字段名 `file`）
拍照识药链路：YOLOv8 药盒检测（自训权重或演示模式）→ RapidOCR 文字识别 → 药品词典归一化（编辑距离 Top-3）。**原图仅在内存中转，不落盘**。
```json
{ "code":0, "data": {
  "ocrText":"阿司匹林肠溶片 拜阿司匹灵 100mg x 30片 …",
  "ocrLines":[...], "charAccuracyEstimate":0.93,
  "candidates":[{"medicationId":1,"name":"阿司匹林肠溶片","brandName":"拜阿司匹灵","confidence":0.875,"matchedBy":"OCR_DICT"}],
  "detect":{"mode":"demo-yolov8n-coco"},   // 如实标注检测模式；配 MEDBOX_YOLO_MODEL 后为 custom
  "lowConfidence":false,                    // Top1<0.75 时 true，前端提示核对
  "hint":"...", "latencyMs":1580, "logId":3 } }
```
### POST /api/recognize/{logId}/confirm
用户从候选中确认后回传 `{medicationId}`，用于识别准确率闭环统计（管理端可见）。

### POST /api/qa
RAG 循证问答：`{question, medicationId?}`。检索链 = BM25(jieba) + FAISS(bge-small-zh-v1.5，查询带 BGE 检索指令前缀) 加权 RRF → 余弦重排 Top5 → 低于阈值(0.35)或命中超范围词表则**拒答**。
```json
{ "code":0, "data": {
  "answer":"根据药品知识库资料……（[来源·阿司匹林肠溶片（拜阿司匹灵）·用法用量]）",
  "sources":[{"index":1,"title":"阿司匹林肠溶片（拜阿司匹灵）","section":"用法用量","source":"药品说明书（NMPA批准文本摘要）","score":0.7751,"text":"..."}],
  "confidence":0.8776, "refused":false,
  "mode":"extractive",   // extractive摘编 | llm受控生成 | refuse无依据拒答 | guard超范围拒答 | booting启动中
  "corpusChunks":1022,   // RAG 语料片段总数（144药×7节+科普文章），前端展示"知识库规模"
  "retrievalMs":122,     // 纯检索耗时（混合检索+重排），与 latencyMs(后端全链路)区分
  "latencyMs":320, "qaLogId":12 } }
```

## 6. 药品知识库 `/api/medications`

GET `/api/medications?keyword=&page=1&size=20` → `{total, records:[Medication]}`
GET `/api/medications/{id}` → Medication 全字段：`genericName, brandName, ingredients(CSV), drugClass, indications, dosage, contraindications, precautions, adverseReactions, storage, source, version, enabled`

## 7. 家庭协同 `/api/family`（授权矩阵 + 脱敏）

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | /bind | FAMILY | 家属发起绑定 `{elderPhone, scopes:["VIEW_SUMMARY","VIEW_ADHERENCE","RECEIVE_ALERTS"]}`，需老人审批 |
| GET | /invites | ELDER | 老人查看待处理申请 |
| POST | /invites/{id}/respond | ELDER | `{approve:true/false}` |
| GET | /members | ELDER | 老人查看已授权家属（可随时撤销） |
| POST | /members/{bindId}/revoke | 双方 | 解除授权，即时生效 |
| GET | /elders | FAMILY | 我绑定的老人（姓名脱敏 `张*芳`） |
| GET | /summary/{elderId} | FAMILY | 需 VIEW_SUMMARY。返回 `{summary:{medCount, medBriefs(药名脱敏), todayTaken, todayTotal, adherence7d:{...adherenceRate}(需VIEW_ADHERENCE), missed7d, alertLevel(需RECEIVE_ALERTS)}, scopes}`——**只见汇总不见明细** |
| GET | /alerts?limit | FAMILY | 需 RECEIVE_ALERTS。风险提醒收件箱 `{items, unread}`（老人新增高危计划时服务端即时生成，落库可补看） |
| POST | /alerts/{id}/read | FAMILY | 标记已读（只能操作自己的提醒） |
| GET | /stream?token=JWT | FAMILY | **SSE 实时警报流**：事件 `hello`(连接确认)/`alert`(新警报 JSON)。EventSource 不支持自定义 Header，故令牌经查询参数传递（内网演示取舍，生产建议一次性 ticket，详见《隐私与安全设计》§2.7） |

> 代办说明：家属获 **MANAGE_PLANS** 授权后，可调用 `POST /api/plans`（body 带 `elderId`）与 `POST /api/plans/{id}/stop?elderId=` 帮老人增停用药计划；新建时同样触发冲突校验，HIGH/MEDIUM 结果经 `/alerts` + SSE 秒级推给家属本人。

## 8. 管理端 `/api/admin`（ADMIN 角色，拦截器强制校验）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /users?keyword&role&page&size | 用户列表（手机号脱敏，姓名全显——权限管理需要） |
| PUT | /users/{id}/role | 变更角色 `{role}`，审计留痕 |
| POST/PUT | /medications · /medications/{id} | 新增/编辑药品（**版本自动+1，自动同步 AI 词典与 RAG 知识库**） |
| POST | /medications/{id}/toggle | 启用/停用 `{enabled}` |
| GET | /rules?type&reviewStatus&page&size | 规则分页 |
| POST/PUT | /rules · /rules/{id} | 新增（默认 PENDING）/编辑（版本+1并推送AI热更新） |
| POST | /rules/{id}/review | 药师审核 `{reviewer, approve}`；**只有 APPROVED+enabled 的规则参与校验** |
| POST | /rules/{id}/toggle | 启停 |
| POST | /rules/sync | 手动全量推送规则到 AI 服务 |
| GET | /dashboard | 脱敏统计看板：userCounts/medicationCount/ruleCounts/activePlans/todayCheckins/recognizeTrend/qaTrend(7天)/adherence7dRate/citationCoverage(引用覆盖率)/refusedCount |
| GET | /audits · /recognize-logs · /qa-logs | 三类日志分页（审计保存6个月） |

## 9. 内部接口 `/api/internal`（服务间，校验 `X-Service-Key`，不对浏览器开放）

| 方法 | 路径 | 调用方 | 说明 |
|---|---|---|---|
| GET | /dictionary | AI服务 | 拉取启用药品词典（识别归一化用） |
| GET | /rules/effective | AI服务 | 拉取生效规则（APPROVED+enabled） |
| POST | /alerts | AI服务 | 高危冲突回推提醒 |

## 10. AI 服务原生接口（:8100，均需 `X-Service-Key`，一般经后端代理访问）

`POST /recognize`（multipart file）· `POST /conflict` `{medications:[{name,ingredients,drugClass}]}` → `{conflicts, checkedCount, rulesVersion}` · `POST /qa` `{question, medications}` · `GET /health`
