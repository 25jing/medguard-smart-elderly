<script setup lang="ts">
import { computed, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import StatCharts from '@/components/StatCharts.vue'
import { getAllUsers, getMissedAlerts, getOperationLogs, getStatistics, setUserEnabled, type DemoUser } from '@/services/demoApi'

const users = ref(getAllUsers())
const statistics = computed(() => getStatistics(users.value.filter((user) => user.role === 'elder').map((user) => user.id)))
const alerts = computed(() => getMissedAlerts(users.value.filter((user) => user.role === 'elder').map((user) => user.id)))
const operationLogs = getOperationLogs()
const roleLabel: Record<DemoUser['role'], string> = { elder: '老人', guardian: '监护人', admin: '管理员' }

async function toggleUser(user: DemoUser): Promise<void> {
  await setUserEnabled(user.id, !user.enabled)
  user.enabled = !user.enabled
  ElMessage.success(user.enabled ? '账号已启用。' : '账号已停用。')
}
</script>

<template>
  <div class="dashboard-page admin-page">
    <AppShell />
    <main class="dashboard-main">
      <section class="dashboard-heading"><div><p class="eyebrow">SYSTEM CONTROL</p><h1>平台管理后台</h1><p>全局业务概览、账号状态与平台操作记录。</p></div><span class="environment-tag"><i /> 演示数据</span></section>
      <section class="metric-grid admin-metrics"><article class="metric-card metric-dark"><span>系统总识别次数</span><strong>{{ statistics.totalRecognition }}</strong><small>全平台累计</small></article><article class="metric-card"><span>注册用户</span><strong>{{ statistics.totalUsers }}</strong><small>老人、监护人及管理员</small></article><article class="metric-card metric-warm"><span>全平台服药完成率</span><strong>{{ statistics.completionRate }}<i>%</i></strong><small>基于演示打卡数据</small></article><article class="metric-card" :class="{ 'metric-alert': alerts.length }"><span>漏服告警汇总</span><strong>{{ alerts.length }}</strong><small>超过提醒时间 2 小时</small></article></section>
      <section class="section-block"><div class="section-title"><div><p class="eyebrow">GLOBAL ANALYTICS</p><h2>全局数据看板</h2></div></div><StatCharts scope="admin" /></section>
      <section class="section-block"><div class="section-title"><div><p class="eyebrow">ACCOUNT DIRECTORY</p><h2>用户与绑定关系</h2></div><span class="section-caption">{{ users.length }} 个账号</span></div><div class="surface plan-table-wrap"><table class="data-table"><thead><tr><th>用户</th><th>账号</th><th>角色</th><th>绑定关系</th><th>状态</th><th>管理</th></tr></thead><tbody><tr v-for="account in users" :key="account.id"><td><strong>{{ account.name }}</strong></td><td>{{ account.username }}</td><td><span class="role-tag" :class="`role-${account.role}`">{{ roleLabel[account.role] }}</span></td><td>{{ account.bindings.map((id) => users.find((item) => item.id === id)?.name).filter(Boolean).join('、') || '—' }}</td><td><span class="status-pill" :class="account.enabled ? 'status-done' : 'status-alert'">{{ account.enabled ? '已启用' : '已停用' }}</span></td><td><button v-if="account.role !== 'admin'" class="text-action" @click="toggleUser(account)">{{ account.enabled ? '停用账号' : '启用账号' }}</button><span v-else class="muted-copy">系统账号</span></td></tr></tbody></table></div></section>
      <section class="section-block admin-bottom-grid"><div><div class="section-title"><div><p class="eyebrow alert-eyebrow">MISSED DOSE</p><h2>漏服告警</h2></div></div><div v-if="alerts.length" class="alert-list"><article v-for="alert in alerts" :key="alert.plan.id" class="alert-row"><span class="alert-mark">!</span><div><strong>{{ alert.elder.name }} · {{ alert.plan.medicineName }}</strong><p>已超时 {{ Math.floor(alert.overdueMinutes / 60) }} 小时 {{ alert.overdueMinutes % 60 }} 分钟</p></div></article></div><div v-else class="surface empty-state">当前没有漏服告警。</div></div><div><div class="section-title"><div><p class="eyebrow">AUDIT TRAIL</p><h2>系统操作日志</h2></div></div><div class="surface operation-list"><article v-for="(log, index) in operationLogs" :key="index"><span class="operation-dot" /><div><strong>{{ log.action }}</strong><p>{{ log.actor }} · {{ log.time }}</p></div></article></div></div></section>
    </main>
  </div>
</template>
