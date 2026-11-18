<template>
  <view class="page">
    <view class="hero">
      <view class="hero-num">{{ taken }} / {{ tasks.length }}</view>
      <view class="hero-label">今日已服药</view>
      <view class="bar"><view class="fill" :style="{ width: pct + '%' }"></view></view>
    </view>

    <view class="card conflict" v-for="c in conflicts" :key="c.ruleCode">
      <view class="cf-head">⚠️ {{ drugNames(c) }} <text class="risk" :class="c.riskLevel">{{ riskCn(c.riskLevel) }}</text></view>
      <view class="cf-text">{{ c.explanation }}</view>
      <view class="cf-src">依据：{{ c.basisSource }}</view>
    </view>

    <view class="card task" v-for="t in tasks" :key="t.id" :class="t.status">
      <view class="task-time">{{ fmtHM(t.scheduledAt) }}</view>
      <view class="task-body">
        <view class="task-name">{{ t.medName }}</view>
        <view class="task-dose">{{ doseOf(t) }}</view>
        <view class="task-status" :class="t.status">{{ statusCn(t.status) }}</view>
      </view>
      <button v-if="t.status === 'PENDING' || t.status === 'MISSED'" class="check-btn" @click="checkin(t)">
        {{ t.status === 'MISSED' ? '补打卡' : '已服药' }}
      </button>
      <view v-else class="done-mark">✓</view>
    </view>

    <view class="card empty" v-if="!tasks.length && loaded">
      今天没有用药任务<view class="sub">去「用药计划」添加，或用「拍照识药」快速添加</view>
    </view>

    <view class="card" v-if="reminders.length">
      <view class="section-title">🔔 提醒消息</view>
      <view class="rem" v-for="r in reminders" :key="r.id" :class="{ unread: r.status === 'UNREAD' }" @click="readRem(r)">
        <view class="rem-title">{{ r.title }}</view>
        <view class="rem-text">{{ r.content }}</view>
        <view class="rem-time">{{ fmt(r.dueAt) }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { request } from '../../utils/request'
import { feedback } from '../../utils/tts'

const RISK_CN: Record<string, string> = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' }
const STATUS_CN: Record<string, string> = { PENDING: '待服药', TAKEN: '已按时服药', LATE: '已补打卡（迟）', MISSED: '已错过' }

const tasks = ref<any[]>([])
const plans = ref<any[]>([])
const conflicts = ref<any[]>([])
const reminders = ref<any[]>([])
const loaded = ref(false)

const taken = computed(() => tasks.value.filter(t => t.status === 'TAKEN' || t.status === 'LATE').length)
const pct = computed(() => (tasks.value.length ? Math.round((taken.value / tasks.value.length) * 100) : 0))

function doseOf(t: any) {
  const p = plans.value.find(x => x.id === t.planId)
  return p ? '每次 ' + p.doseText : ''
}

function fmtHM(t: string) { return t ? String(t).replace('T', ' ').slice(11, 16) : '' }
function fmt(t: string) { return t ? String(t).replace('T', ' ').slice(5, 16) : '' }
function statusCn(s: string) { return STATUS_CN[s] || s }
function riskCn(r: string) { return RISK_CN[r] || r }
function drugNames(c: any) { return (c.drugs && c.drugs.length ? c.drugs.join(' × ') : '在用药组合') }

async function load() {
  try {
    tasks.value = await request('/api/checkins/today')
    plans.value = await request('/api/plans')
    const cf: any[] = await request('/api/conflict/check', { method: 'POST', body: {} })
    conflicts.value = cf || []
    reminders.value = await request('/api/reminders')
  } catch (e: any) {
    feedback(e.message, 'err')
  } finally {
    loaded.value = true
  }
}

async function checkin(t: any) {
  try {
    await request(`/api/checkins/${t.id}`, { method: 'POST', body: { note: '' } })
    feedback(t.status === 'MISSED' ? '已补打卡' : '已记录服药，真棒！')
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

async function readRem(r: any) {
  if (r.status === 'UNREAD') {
    await request(`/api/reminders/${r.id}/read`, { method: 'POST' }).catch(() => {})
    r.status = 'READ'
  }
}

onShow(load)
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>

<style scoped>
.page { padding-bottom: 60rpx; }
.hero { background: linear-gradient(135deg, #0f766e 0%, #0d9488 48%, #2dd4bf 100%); color: #fff; padding: 44rpx 32rpx 60rpx; border-radius: 0 0 48rpx 48rpx; }
.hero-num { font-size: 80rpx; font-weight: 900; letter-spacing: -2rpx; }
.hero-label { font-size: 28rpx; opacity: 0.92; }
.bar { height: 18rpx; background: rgba(255,255,255,0.3); border-radius: 9rpx; margin-top: 20rpx; overflow: hidden; box-shadow: inset 0 2rpx 6rpx rgba(0,0,0,0.12); }
.fill { height: 100%; background: linear-gradient(90deg, #fbbf24, #fde68a); border-radius: 9rpx; transition: width 0.4s; }
.task { display: flex; align-items: center; gap: 20rpx; animation: mgRiseT 0.45s ease-out backwards; }
.task:nth-child(3) { animation-delay: 0.05s; } .task:nth-child(4) { animation-delay: 0.1s; }
.task:nth-child(5) { animation-delay: 0.15s; } .task:nth-child(6) { animation-delay: 0.2s; }
@keyframes mgRiseT { from { opacity: 0; transform: translateY(24rpx); } to { opacity: 1; transform: none; } }
.task-time { font-size: 44rpx; font-weight: 900; color: #0d9488; width: 130rpx; letter-spacing: -1rpx; }
.task-body { flex: 1; }
.task-name { font-size: 34rpx; font-weight: 800; color: #0f172a; letter-spacing: 1rpx; }
.task-dose { font-size: 26rpx; color: #64748b; }
.task-status { font-size: 24rpx; font-weight: 700; margin-top: 8rpx; display: inline-block; padding: 4rpx 18rpx; border-radius: 999rpx; border: 1rpx solid transparent; }
.task-status.TAKEN { color: #15803d; background: #f0fdf4; border-color: #bbf7d0; }
.task-status.LATE { color: #4338ca; background: #eef2ff; border-color: #c7d2fe; }
.task-status.MISSED { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.task-status.PENDING { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.check-btn { flex: none; background: linear-gradient(135deg, #ea580c, #fb923c); color: #fff; font-size: 32rpx; font-weight: 800; letter-spacing: 2rpx; border: none; border-radius: 24rpx; padding: 0 34rpx; line-height: 88rpx; margin: 0; box-shadow: 0 10rpx 28rpx rgba(249,115,22,0.32), inset 0 2rpx 0 rgba(255,255,255,0.3); }
.check-btn::after { border: none; }
.done-mark { flex: none; width: 88rpx; height: 88rpx; border-radius: 50%; background: linear-gradient(145deg, #f0fdf4, #dcfce7); border: 2rpx solid #bbf7d0; color: #16a34a; font-size: 44rpx; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 8rpx 20rpx rgba(22,163,74,0.18); }
.task.TAKEN { opacity: 0.7; }
.conflict { border-left: 10rpx solid #dc2626; background: linear-gradient(135deg, #fef2f2, #fee2e2); box-shadow: 0 12rpx 34rpx rgba(220,38,38,0.12); }
.cf-head { font-size: 32rpx; font-weight: 900; color: #b91c1c; letter-spacing: 1rpx; }
.risk { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx; margin-left: 10rpx; color: #fff; font-weight: 700; }
.risk.HIGH { background: linear-gradient(135deg, #dc2626, #f87171); box-shadow: 0 6rpx 16rpx rgba(220,38,38,0.35); }
.risk.MEDIUM { background: linear-gradient(135deg, #d97706, #fbbf24); box-shadow: 0 6rpx 16rpx rgba(217,119,6,0.35); }
.risk.LOW { background: linear-gradient(135deg, #2563eb, #60a5fa); box-shadow: 0 6rpx 16rpx rgba(37,99,235,0.35); }
.cf-text { font-size: 28rpx; color: #7f1d1d; margin: 10rpx 0; }
.cf-src { font-size: 24rpx; color: #94a3b8; }
.empty { text-align: center; color: #64748b; font-size: 32rpx; padding: 60rpx 30rpx; }
.empty .sub { font-size: 26rpx; color: #94a3b8; margin-top: 12rpx; }
.section-title { font-size: 32rpx; font-weight: 800; margin-bottom: 16rpx; color: #0f172a; letter-spacing: 1rpx; }
.rem { padding: 18rpx 0; border-bottom: 1rpx solid rgba(15,23,42,0.05); }
.rem.unread .rem-title::before { content: "●"; color: #f97316; margin-right: 8rpx; }
.rem-title { font-size: 30rpx; font-weight: 700; color: #0f172a; }
.rem-text { font-size: 26rpx; color: #64748b; margin-top: 4rpx; }
.rem-time { font-size: 22rpx; color: #94a3b8; margin-top: 4rpx; }
</style>
