<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import MedicineRecognitionView from '@/views/MedicineRecognitionView.vue'
import AppShell from '@/components/AppShell.vue'
import { generateInvite, getCurrentUser, getMedicationLogs, getTodayReminders, recordMedication, type MedicationLog } from '@/services/demoApi'

const user = computed(() => getCurrentUser())
const reminders = ref(getTodayReminders(user.value?.id ?? ''))
const personalLogs = ref<MedicationLog[]>([])
const currentReminder = ref<(typeof reminders.value)[number] | null>(null)
const reminderDialogOpen = ref(false)
const inviteCode = ref('')
const inviteExpiry = ref('')
let pollTimer = 0

function refreshReminders(): void {
  if (!user.value || user.value.role !== 'elder') return
  reminders.value = getTodayReminders(user.value.id)
  const now = Date.now()
  if (currentReminder.value && reminders.value.some((item) => item.id === currentReminder.value?.id && !item.completed)) return
  currentReminder.value = reminders.value.find((item) => {
    const elapsed = now - new Date(item.scheduledAt).getTime()
    return !item.completed && elapsed >= 0 && elapsed < 2 * 60 * 60 * 1000
  }) ?? null
  reminderDialogOpen.value = currentReminder.value !== null
}

async function markMedication(status: 'taken' | 'skipped'): Promise<void> {
  if (!currentReminder.value) return
  await recordMedication(currentReminder.value.id, status)
  ElMessage.success(status === 'taken' ? '已记录：今天已服药' : '已记录：跳过本次服药')
  currentReminder.value = null
  reminderDialogOpen.value = false
  refreshReminders()
  personalLogs.value = getMedicationLogs([user.value?.id ?? ''])
}

async function createInvite(): Promise<void> {
  if (!user.value) return
  const invite = await generateInvite(user.value.id)
  inviteCode.value = invite.code
  inviteExpiry.value = new Date(invite.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  refreshReminders()
  if (user.value?.role === 'elder') {
    personalLogs.value = getMedicationLogs([user.value.id])
    // 此定时轮询只用于前端演示；生产环境应由后端定时任务推送提醒。
    pollTimer = window.setInterval(refreshReminders, 15_000)
  }
})
onBeforeUnmount(() => window.clearInterval(pollTimer))
</script>

<template>
  <div v-if="user?.role === 'elder'" class="elder-app">
    <AppShell />
    <main class="elder-main">
      <section class="elder-welcome"><div><p class="eyebrow">{{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</p><h1>{{ user.name }}，您好</h1><p>今天的用药安排都在这里。</p></div><div class="welcome-symbol" aria-hidden="true">✳</div></section>
      <section class="surface reminder-section"><div class="section-title"><div><p class="eyebrow">TODAY</p><h2>今日用药提醒</h2></div><span class="count-badge">{{ reminders.filter((item) => !item.completed).length }} 项待处理</span></div>
        <div v-if="reminders.length" class="reminder-list"><article v-for="reminder in reminders" :key="reminder.id" class="reminder-row" :class="{ done: reminder.completed }"><span class="reminder-time">{{ reminder.reminderTime }}</span><div class="reminder-details"><strong>{{ reminder.medicineName }}</strong><span>{{ reminder.dose }} · {{ reminder.note }}</span></div><span v-if="reminder.completed" class="status-pill status-done">已记录</span><span v-else class="status-pill status-pending">待服用</span></article></div>
        <p v-else class="empty-copy">暂时没有用药安排，请联系家人添加。</p>
      </section>
      <section class="surface invite-section"><div><p class="eyebrow">家庭照护</p><h2>邀请家人关注用药</h2><p>生成 6 位数字邀请码，5 分钟内有效。</p></div><div class="invite-output"><strong v-if="inviteCode" class="invite-code">{{ inviteCode }}</strong><span v-if="inviteCode">有效至 {{ inviteExpiry }}</span><button class="secondary-button" type="button" @click="createInvite">{{ inviteCode ? '重新生成' : '生成邀请码' }}</button></div></section>
      <section class="log-section"><div class="section-title"><div><p class="eyebrow">MY RECORD</p><h2>最近服药记录</h2></div></div><div v-if="personalLogs.length" class="surface log-list"><article v-for="log in personalLogs.slice(0, 5)" :key="log.id" class="log-row"><div><strong>{{ log.medicineName }}</strong><time>{{ new Date(log.operatedAt).toLocaleString('zh-CN') }}</time></div><span class="status-pill" :class="log.status === 'taken' ? 'status-done' : log.status === 'missed' ? 'status-alert' : 'status-pending'">{{ log.status === 'taken' ? '已服药' : log.status === 'missed' ? '漏服' : '已跳过' }}</span></article></div><p v-else class="empty-copy">服药打卡后，记录会显示在这里。</p></section>
      <section class="recognition-section"><div class="section-title"><div><p class="eyebrow">MEDICINE SCAN</p><h2>药品拍照识别</h2></div></div><MedicineRecognitionView /></section>
    </main>
    <el-dialog v-model="reminderDialogOpen" class="elder-reminder-dialog" width="min(680px, 94vw)" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" center>
      <div v-if="currentReminder" class="reminder-dialog-content"><div class="alarm-icon">!</div><p class="eyebrow">服药时间到了</p><h2>{{ currentReminder.medicineName }}</h2><p class="reminder-dose">{{ currentReminder.dose }} · {{ currentReminder.note }}</p><p class="reminder-instruction">服药后请点“我已服药”；如果这次不方便，请点“跳过本次”。</p><div class="reminder-actions"><el-button class="take-button" @click="markMedication('taken')">我已服药</el-button><el-button class="skip-button" @click="markMedication('skipped')">跳过本次</el-button></div></div>
    </el-dialog>
  </div>
  <div v-else class="welcome-home"><AppShell /><main><section class="welcome-home-heading"><p class="eyebrow">家庭用药照护</p><h1>你好，{{ user?.name }}</h1><p>从这里进入你的健康工作台。</p></section><RouterLink v-if="user?.role === 'guardian'" class="surface launch-link" to="/guardian-dashboard"><span><strong>家属工作台</strong><small>计划管理、服药记录、告警与统计</small></span><b>→</b></RouterLink><RouterLink v-if="user?.role === 'admin'" class="surface launch-link" to="/admin"><span><strong>平台管理后台</strong><small>全局数据、账号管理与平台日志</small></span><b>→</b></RouterLink></main></div>
</template>
