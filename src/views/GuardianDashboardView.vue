<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import StatCharts from '@/components/StatCharts.vue'
import { bindByInvite, deletePlan, getBoundElders, getCurrentUser, getMedicationLogs, getMissedAlerts, getPlans, getStatistics, savePlan, type MedicationLog, type MedicationPlan } from '@/services/demoApi'

const user = getCurrentUser()
const elders = ref(user ? getBoundElders(user.id) : [])
const selectedElderId = ref(elders.value[0]?.id ?? '')
const plans = ref<MedicationPlan[]>([])
const logs = ref<MedicationLog[]>([])
const inviteCode = ref('')
const saving = ref(false)
const planDialog = ref(false)
const editingId = ref('')
const planForm = ref({ medicineName: '', dose: '', timesPerDay: 1, reminderTime: '08:00', cycle: 'daily' as 'daily' | 'weekly', weekdays: [] as number[], note: '饭后' })
const weekdays = [{ label: '一', value: 1 }, { label: '二', value: 2 }, { label: '三', value: 3 }, { label: '四', value: 4 }, { label: '五', value: 5 }, { label: '六', value: 6 }, { label: '日', value: 0 }]
const selectedElder = computed(() => elders.value.find((elder) => elder.id === selectedElderId.value))
const alerts = computed(() => getMissedAlerts(elders.value.map((elder) => elder.id)))
const stats = computed(() => getStatistics(elders.value.map((elder) => elder.id)))

function reloadSelected(): void {
  plans.value = selectedElderId.value ? getPlans(selectedElderId.value) : []
  logs.value = selectedElderId.value ? getMedicationLogs([selectedElderId.value]) : []
}
watch(selectedElderId, reloadSelected)
onMounted(reloadSelected)

async function bindElder(): Promise<void> {
  if (!user || !/^\d{6}$/.test(inviteCode.value)) { ElMessage.warning('请输入 6 位数字邀请码。'); return }
  try {
    const elder = await bindByInvite(user.id, inviteCode.value)
    if (!elders.value.some((item) => item.id === elder.id)) elders.value.push(elder)
    selectedElderId.value = elder.id
    inviteCode.value = ''
    ElMessage.success(`已绑定${elder.name}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '绑定失败。')
  }
}

function openNewPlan(): void {
  editingId.value = ''
  planForm.value = { medicineName: '', dose: '', timesPerDay: 1, reminderTime: '08:00', cycle: 'daily', weekdays: [], note: '饭后' }
  planDialog.value = true
}

function editPlan(plan: MedicationPlan): void {
  editingId.value = plan.id
  planForm.value = { medicineName: plan.medicineName, dose: plan.dose, timesPerDay: plan.timesPerDay, reminderTime: plan.reminderTime, cycle: plan.cycle, weekdays: [...plan.weekdays], note: plan.note }
  planDialog.value = true
}

async function submitPlan(): Promise<void> {
  if (!selectedElderId.value || !planForm.value.medicineName.trim() || !planForm.value.dose.trim()) { ElMessage.warning('请填写药品名称和单次剂量。'); return }
  if (planForm.value.cycle === 'weekly' && !planForm.value.weekdays.length) { ElMessage.warning('每周计划至少选择一天。'); return }
  saving.value = true
  try {
    await savePlan({ ...planForm.value, medicineName: planForm.value.medicineName.trim(), elderId: selectedElderId.value, id: editingId.value || undefined })
    planDialog.value = false
    reloadSelected()
    ElMessage.success('用药计划已保存。')
  } finally { saving.value = false }
}

async function removePlan(plan: MedicationPlan): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除“${plan.medicineName}”计划吗？`, '删除用药计划', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    await deletePlan(plan.id)
    reloadSelected()
    ElMessage.success('计划已删除。')
  } catch { /* 用户取消删除 */ }
}
</script>

<template>
  <div class="dashboard-page">
    <AppShell />
    <main class="dashboard-main">
      <section class="dashboard-heading"><div><p class="eyebrow">FAMILY CARE</p><h1>家属工作台</h1><p>查看家人用药执行情况，及时了解关心对象的健康变化。</p></div><label class="elder-picker">当前老人<el-select v-model="selectedElderId" aria-label="选择老人" placeholder="选择老人"><el-option v-for="elder in elders" :key="elder.id" :label="elder.name" :value="elder.id" /></el-select></label></section>
      <section class="binding-row"><div class="binding-copy"><span class="binding-icon">＋</span><div><strong>绑定老人账号</strong><p>使用老人生成的 6 位临时邀请码，5 分钟内有效。</p></div></div><div class="binding-form"><el-input v-model="inviteCode" maxlength="6" inputmode="numeric" placeholder="输入 6 位邀请码" aria-label="6 位邀请码" /><el-button type="primary" @click="bindElder">绑定老人</el-button></div></section>
      <section class="metric-grid"><article class="metric-card"><span>已绑定老人</span><strong>{{ elders.length }}</strong><small>个家庭成员</small></article><article class="metric-card"><span>当前用药计划</span><strong>{{ stats.planCount }}</strong><small>项有效计划</small></article><article class="metric-card metric-warm"><span>服药完成率</span><strong>{{ stats.completionRate }}<i>%</i></strong><small>基于已记录打卡</small></article><article class="metric-card" :class="{ 'metric-alert': alerts.length }"><span>漏服告警</span><strong>{{ alerts.length }}</strong><small>超过提醒时间 2 小时</small></article></section>
      <section class="section-block"><div class="section-title"><div><p class="eyebrow">MEDICATION PLAN</p><h2>用药计划</h2></div><el-button type="primary" :disabled="!selectedElderId" @click="openNewPlan">＋ 新增计划</el-button></div><div v-if="plans.length" class="surface plan-table-wrap"><table class="data-table"><thead><tr><th>药品</th><th>剂量</th><th>频率与时间</th><th>服用周期</th><th>备注</th><th>操作</th></tr></thead><tbody><tr v-for="plan in plans" :key="plan.id"><td><strong>{{ plan.medicineName }}</strong></td><td>{{ plan.dose }}</td><td>每日 {{ plan.timesPerDay }} 次 · {{ plan.reminderTime }}</td><td>{{ plan.cycle === 'daily' ? '每日' : `每周 ${plan.weekdays.map((day) => weekdays.find((item) => item.value === day)?.label).join('、')}` }}</td><td>{{ plan.note }}</td><td class="row-actions"><button class="text-action" @click="editPlan(plan)">编辑</button><button class="text-action danger-action" @click="removePlan(plan)">删除</button></td></tr></tbody></table></div><div v-else class="surface empty-state">{{ selectedElder ? '还没有用药计划，添加一项开始安排。' : '还没有绑定老人，请先输入邀请码。' }}</div></section>
      <section v-if="alerts.length" class="section-block"><div class="section-title"><div><p class="eyebrow alert-eyebrow">ACTION REQUIRED</p><h2>漏服告警</h2></div><span class="alert-count">{{ alerts.length }} 条待关注</span></div><div class="alert-list"><article v-for="alert in alerts" :key="alert.plan.id" class="alert-row"><span class="alert-mark">!</span><div><strong>{{ alert.elder.name }} · {{ alert.plan.medicineName }}</strong><p>原定 {{ new Date(alert.scheduledAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}，已超过 {{ Math.floor(alert.overdueMinutes / 60) }} 小时 {{ alert.overdueMinutes % 60 }} 分钟未打卡</p></div><span class="status-pill status-alert">漏服待确认</span></article></div></section>
      <section class="section-block"><div class="section-title"><div><p class="eyebrow">OVERVIEW</p><h2>用药数据</h2></div><span class="section-caption">{{ selectedElder?.name || '全部已绑定老人' }}</span></div><StatCharts scope="guardian" :elder-name="selectedElder?.name" /></section>
      <section class="section-block"><div class="section-title"><div><p class="eyebrow">ADHERENCE LOG</p><h2>服药打卡记录</h2></div></div><div v-if="logs.length" class="surface log-list"><article v-for="log in logs" :key="log.id" class="log-row"><div><strong>{{ log.medicineName }}</strong><time>计划 {{ new Date(log.scheduledAt).toLocaleString('zh-CN') }} · 操作 {{ new Date(log.operatedAt).toLocaleTimeString('zh-CN') }}</time></div><span class="status-pill" :class="log.status === 'taken' ? 'status-done' : log.status === 'missed' ? 'status-alert' : 'status-pending'">{{ log.status === 'taken' ? '已服药' : log.status === 'missed' ? '漏服' : '已跳过' }}</span></article></div><div v-else class="surface empty-state">该老人暂时没有服药记录。</div></section>
    </main>
    <el-dialog v-model="planDialog" :title="editingId ? '编辑用药计划' : '新增用药计划'" width="min(620px, 94vw)" destroy-on-close>
      <el-form label-position="top" class="plan-form"><div class="form-two-col"><el-form-item label="药品名称"><el-input v-model="planForm.medicineName" placeholder="例如：降压药" /></el-form-item><el-form-item label="单次剂量"><el-input v-model="planForm.dose" placeholder="例如：1 片" /></el-form-item></div><div class="form-two-col"><el-form-item label="每日服用次数"><el-input-number v-model="planForm.timesPerDay" :min="1" :max="12" /></el-form-item><el-form-item label="提醒时间"><el-time-picker v-model="planForm.reminderTime" format="HH:mm" value-format="HH:mm" placeholder="选择时间" /></el-form-item></div><el-form-item label="服用周期"><el-radio-group v-model="planForm.cycle"><el-radio-button value="daily">每日</el-radio-button><el-radio-button value="weekly">每周指定星期</el-radio-button></el-radio-group></el-form-item><el-form-item v-if="planForm.cycle === 'weekly'" label="每周服用日"><el-checkbox-group v-model="planForm.weekdays"><el-checkbox v-for="day in weekdays" :key="day.value" :value="day.value">周{{ day.label }}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="服用备注"><el-select v-model="planForm.note"><el-option v-for="note in ['饭前', '饭后', '睡前', '随餐', '遵医嘱']" :key="note" :label="note" :value="note" /></el-select></el-form-item></el-form>
      <template #footer><el-button @click="planDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitPlan">保存计划</el-button></template>
    </el-dialog>
  </div>
</template>
