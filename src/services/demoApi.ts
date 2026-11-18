export type Role = 'elder' | 'guardian' | 'admin'
export type MedicationStatus = 'taken' | 'skipped' | 'missed'

export interface DemoUser {
  id: string
  username: string
  name: string
  role: Role
  enabled: boolean
  bindings: string[]
}

export interface MedicationPlan {
  id: string
  elderId: string
  medicineName: string
  dose: string
  timesPerDay: number
  reminderTime: string
  cycle: 'daily' | 'weekly'
  weekdays: number[]
  note: string
}

export interface MedicationLog {
  id: string
  planId: string
  elderId: string
  medicineName: string
  status: MedicationStatus
  scheduledAt: string
  operatedAt: string
}

interface Invite { code: string; elderId: string; expiresAt: number }
interface DemoDatabase {
  users: DemoUser[]
  plans: MedicationPlan[]
  logs: MedicationLog[]
  invites: Invite[]
}

const DB_KEY = 'elderly-care-demo-database'

/** 当天日期键在调用时实时计算：页面跨午夜保持打开时，“今日”判断才不会失效。 */
function todayKey(): string {
  return localDateKey(new Date())
}

function createInitialDatabase(): DemoDatabase {
  return {
    users: [
      { id: 'elder-001', username: 'user_elder', name: '王奶奶', role: 'elder', enabled: true, bindings: ['guardian-001'] },
      { id: 'guardian-001', username: 'user_guard', name: '王女士', role: 'guardian', enabled: true, bindings: ['elder-001'] },
      { id: 'admin-001', username: 'admin', name: '系统管理员', role: 'admin', enabled: true, bindings: [] },
      { id: 'elder-002', username: 'elder_demo2', name: '李爷爷', role: 'elder', enabled: true, bindings: ['guardian-001'] },
    ],
    plans: [
      { id: 'plan-001', elderId: 'elder-001', medicineName: '降压药（示例）', dose: '1片', timesPerDay: 1, reminderTime: '08:00', cycle: 'daily', weekdays: [], note: '饭后' },
      { id: 'plan-002', elderId: 'elder-001', medicineName: '维生素（示例）', dose: '1片', timesPerDay: 1, reminderTime: '20:00', cycle: 'daily', weekdays: [], note: '睡前' },
      { id: 'plan-003', elderId: 'elder-002', medicineName: '心脏用药（示例）', dose: '1片', timesPerDay: 2, reminderTime: '09:00', cycle: 'daily', weekdays: [], note: '饭后' },
    ],
    logs: [
      { id: 'log-seed-001', planId: 'plan-001', elderId: 'elder-001', medicineName: '降压药（示例）', status: 'taken', scheduledAt: `${todayKey()}T08:00:00`, operatedAt: `${todayKey()}T08:05:00` },
      { id: 'log-seed-002', planId: 'plan-003', elderId: 'elder-002', medicineName: '心脏用药（示例）', status: 'missed', scheduledAt: `${todayKey()}T09:00:00`, operatedAt: `${todayKey()}T11:01:00` },
    ],
    invites: [],
  }
}

/** 数据库内存缓存：仪表盘的多个 computed 共享同一份解析结果，避免反复 JSON.parse。 */
let cachedDatabase: DemoDatabase | null = null

function readDatabase(): DemoDatabase {
  if (cachedDatabase) return cachedDatabase
  try {
    const stored = localStorage.getItem(DB_KEY)
    if (stored) {
      cachedDatabase = JSON.parse(stored) as DemoDatabase
      return cachedDatabase
    }
  } catch {
    localStorage.removeItem(DB_KEY)
  }
  cachedDatabase = createInitialDatabase()
  writeDatabase(cachedDatabase)
  return cachedDatabase
}

function writeDatabase(database: DemoDatabase): void {
  cachedDatabase = database
  localStorage.setItem(DB_KEY, JSON.stringify(database))
}

// 其他标签页修改数据库时让本页缓存失效，读到最新数据。
window.addEventListener('storage', (event) => {
  if (event.key === null || event.key === DB_KEY) cachedDatabase = null
})

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function getStoredSession(): { token: string; userId: string; role: Role } | null {
  const token = localStorage.getItem('token')
  const userId = localStorage.getItem('userId')
  const role = localStorage.getItem('role') as Role | null
  if (!token || !userId || !role || !['elder', 'guardian', 'admin'].includes(role)) return null
  return { token, userId, role }
}

export async function login(username: string, password: string): Promise<DemoUser> {
  await delay()
  const credentials: Record<string, { password: string; id: string }> = {
    user_elder: { password: '123456', id: 'elder-001' },
    user_guard: { password: '123456', id: 'guardian-001' },
    admin: { password: 'Admin@123', id: 'admin-001' },
  }
  const credential = credentials[username]
  const database = readDatabase()
  const user = credential?.password === password ? database.users.find((item) => item.id === credential.id) : undefined
  if (!user) throw new Error('账号或密码不正确。')
  if (!user.enabled) throw new Error('该账号已停用，请联系管理员。')
  localStorage.setItem('token', `demo-${user.id}-${Date.now()}`)
  localStorage.setItem('userId', user.id)
  localStorage.setItem('role', user.role)
  return user
}

export async function register(username: string, password: string, name: string, role: 'elder' | 'guardian'): Promise<DemoUser> {
  await delay()
  const database = readDatabase()
  if (database.users.some((user) => user.username === username)) throw new Error('该账号名称已被使用。')
  const user: DemoUser = { id: newId(role), username, name, role, enabled: true, bindings: [] }
  database.users.push(user)
  writeDatabase(database)
  localStorage.setItem('token', `demo-${user.id}-${Date.now()}`)
  localStorage.setItem('userId', user.id)
  localStorage.setItem('role', user.role)
  return user
}

export function logout(): void {
  // 只清除登录态，保留演示数据库与药品识别历史等业务数据。
  localStorage.removeItem('token')
  localStorage.removeItem('userId')
  localStorage.removeItem('role')
}

export function getCurrentUser(): DemoUser | undefined {
  const session = getStoredSession()
  return session ? readDatabase().users.find((user) => user.id === session.userId) : undefined
}

export async function generateInvite(elderId: string): Promise<{ code: string; expiresAt: number }> {
  await delay()
  const database = readDatabase()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const invite = { code, elderId, expiresAt: Date.now() + 5 * 60 * 1000 }
  database.invites = database.invites.filter((item) => item.elderId !== elderId)
  database.invites.push(invite)
  writeDatabase(database)
  return invite
}

export async function bindByInvite(guardianId: string, code: string): Promise<DemoUser> {
  await delay()
  const database = readDatabase()
  const invite = database.invites.find((item) => item.code === code)
  if (!invite || invite.expiresAt < Date.now()) throw new Error('邀请码无效或已过期，请让老人重新生成。')
  const guardian = database.users.find((user) => user.id === guardianId && user.role === 'guardian')
  const elder = database.users.find((user) => user.id === invite.elderId && user.role === 'elder')
  if (!guardian || !elder) throw new Error('账号关系无效。')
  if (!guardian.bindings.includes(elder.id)) guardian.bindings.push(elder.id)
  if (!elder.bindings.includes(guardian.id)) elder.bindings.push(guardian.id)
  database.invites = database.invites.filter((item) => item.code !== code)
  writeDatabase(database)
  return elder
}

export function getBoundElders(guardianId: string): DemoUser[] {
  const database = readDatabase()
  const guardian = database.users.find((user) => user.id === guardianId)
  return database.users.filter((user) => user.role === 'elder' && guardian?.bindings.includes(user.id))
}

export function getPlans(elderId: string): MedicationPlan[] {
  return readDatabase().plans.filter((plan) => plan.elderId === elderId)
}

export async function savePlan(plan: Omit<MedicationPlan, 'id'> & { id?: string }): Promise<MedicationPlan> {
  await delay()
  const database = readDatabase()
  const saved: MedicationPlan = { ...plan, id: plan.id ?? newId('plan') }
  const index = database.plans.findIndex((item) => item.id === saved.id)
  if (index >= 0) database.plans.splice(index, 1, saved)
  else database.plans.push(saved)
  writeDatabase(database)
  return saved
}

export async function deletePlan(planId: string): Promise<void> {
  await delay()
  const database = readDatabase()
  database.plans = database.plans.filter((plan) => plan.id !== planId)
  writeDatabase(database)
}

function planAppliesToday(plan: MedicationPlan, date = new Date()): boolean {
  return plan.cycle === 'daily' || plan.weekdays.includes(date.getDay())
}

function scheduleForToday(plan: MedicationPlan, date = new Date()): string {
  const [hours, minutes] = plan.reminderTime.split(':').map(Number)
  const scheduled = new Date(date)
  scheduled.setHours(hours || 0, minutes || 0, 0, 0)
  return scheduled.toISOString()
}

export function getTodayReminders(elderId: string): Array<MedicationPlan & { scheduledAt: string; completed: boolean }> {
  const database = readDatabase()
  return database.plans.filter((plan) => plan.elderId === elderId && planAppliesToday(plan)).map((plan) => {
    const scheduledAt = scheduleForToday(plan)
    const completed = database.logs.some((log) => log.planId === plan.id && localDateKey(new Date(log.scheduledAt)) === todayKey())
    return { ...plan, scheduledAt, completed }
  })
}

export async function recordMedication(planId: string, status: 'taken' | 'skipped'): Promise<MedicationLog> {
  await delay(160)
  const database = readDatabase()
  const plan = database.plans.find((item) => item.id === planId)
  const session = getStoredSession()
  if (!plan || !session) throw new Error('用药计划不存在。')
  const scheduledAt = scheduleForToday(plan)
  const log: MedicationLog = {
    id: newId('log'), planId, elderId: session.userId, medicineName: plan.medicineName,
    status, scheduledAt, operatedAt: new Date().toISOString(),
  }
  database.logs.unshift(log)
  writeDatabase(database)
  return log
}

export function getMedicationLogs(elderIds: string[]): MedicationLog[] {
  return readDatabase().logs.filter((log) => elderIds.includes(log.elderId)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
}

export function getMissedAlerts(elderIds: string[]): Array<{ plan: MedicationPlan; elder: DemoUser; scheduledAt: string; overdueMinutes: number }> {
  const database = readDatabase()
  const current = Date.now()
  const alerts: Array<{ plan: MedicationPlan; elder: DemoUser; scheduledAt: string; overdueMinutes: number }> = []
  for (const plan of database.plans.filter((item) => elderIds.includes(item.elderId) && planAppliesToday(item))) {
    const scheduledAt = scheduleForToday(plan)
    const scheduledMs = new Date(scheduledAt).getTime()
    const matchingLog = database.logs.find((log) => log.planId === plan.id && localDateKey(new Date(log.scheduledAt)) === todayKey())
    const overdueMinutes = Math.floor((current - scheduledMs) / 60000)
    if (matchingLog?.status === 'missed' || (!matchingLog && overdueMinutes >= 120)) {
      const elder = database.users.find((user) => user.id === plan.elderId)
      if (elder) alerts.push({ plan, elder, scheduledAt, overdueMinutes })
    }
  }
  return alerts
}

export function getStatistics(elderIds: string[]) {
  const database = readDatabase()
  const logs = database.logs.filter((log) => elderIds.includes(log.elderId))
  const plans = database.plans.filter((plan) => elderIds.includes(plan.elderId))
  const missed = getMissedAlerts(elderIds)
  return {
    recognitionByMonth: [12, 18, 15, 24, 20, 28].map((count, index) => ({ month: `${index + 1}月`, count })),
    categories: [{ name: '慢性病用药', value: 46 }, { name: '维生素与营养', value: 24 }, { name: '其他', value: 30 }],
    completionByWeek: [82, 91, 86, 94, 88, 96, 92].map((rate, index) => ({ day: `周${'一二三四五六日'[index]}`, rate })),
    completionRate: logs.length ? Math.round((logs.filter((log) => log.status === 'taken').length / logs.length) * 100) : 0,
    missedCount: missed.length,
    totalRecognition: database.logs.length * 4 + 28,
    totalUsers: database.users.length,
    planCount: plans.length,
  }
}

export function getAllUsers(): DemoUser[] {
  return readDatabase().users
}

export async function setUserEnabled(userId: string, enabled: boolean): Promise<void> {
  await delay(160)
  const database = readDatabase()
  const user = database.users.find((item) => item.id === userId)
  if (user) user.enabled = enabled
  writeDatabase(database)
}

export function getOperationLogs(): Array<{ action: string; actor: string; time: string }> {
  return [
    { action: '登录系统', actor: 'user_guard', time: new Date().toLocaleString('zh-CN') },
    { action: '查看服药记录', actor: 'admin', time: new Date(Date.now() - 3600000).toLocaleString('zh-CN') },
    { action: '更新用药计划', actor: 'user_guard', time: new Date(Date.now() - 7200000).toLocaleString('zh-CN') },
  ]
}

function delay(milliseconds = 280): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
