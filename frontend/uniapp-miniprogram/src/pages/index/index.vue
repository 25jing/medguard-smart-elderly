<template>
  <view>
    <!-- 老人首页 -->
    <block v-if="user.isElder">
      <view class="hero">
        <view class="hello">{{ greeting }}，{{ user.user?.name }}</view>
        <view class="date">{{ todayText }}</view>
        <view class="progress-card" @click="goToday">
          <view class="progress-num">{{ taken }} / {{ totalTask }}</view>
          <view class="progress-label">今日已服药（点击查看任务）</view>
          <view class="progress-bar"><view class="progress-fill" :style="{ width: pct + '%' }"></view></view>
        </view>
      </view>

      <view class="card alert-card" v-if="highConflicts.length" @click="goToday">
        <text class="alert-icon">⚠️</text>
        <view class="alert-body">
          <view class="alert-title">用药风险提醒（{{ highConflicts.length }}条高危）</view>
          <view class="alert-text">{{ highConflicts[0].explanation }}</view>
        </view>
      </view>

      <view class="grid">
        <view class="grid-item g1" @click="go('/pages/recognize/recognize')">
          <text class="g-icon">📷</text><text class="g-title">拍照识药</text><text class="g-sub">拍药盒·大字说明</text>
        </view>
        <view class="grid-item g2" @click="goToday">
          <text class="g-icon">✅</text><text class="g-title">今日用药</text><text class="g-sub">到点提醒·一键打卡</text>
        </view>
        <view class="grid-item g3" @click="go('/pages/qa/qa')">
          <text class="g-icon">💬</text><text class="g-title">问药助手</text><text class="g-sub">有依据才回答</text>
        </view>
        <view class="grid-item g4" @click="go('/pages/plans/plans')">
          <text class="g-icon">📋</text><text class="g-title">用药计划</text><text class="g-sub">添加·停用</text>
        </view>
        <view class="grid-item g5" @click="go('/pages/family/family')">
          <text class="g-icon">👨‍👩‍👧</text><text class="g-title">家庭协同</text><text class="g-sub">授权子女查看</text>
        </view>
        <view class="grid-item g6" @click="go('/pages/profile/profile')">
          <text class="g-icon">⚙️</text><text class="g-title">我的</text><text class="g-sub">设置·隐私</text>
        </view>
      </view>
    </block>

    <!-- 家属首页 -->
    <block v-else>
      <view class="hero family">
        <view class="hello">{{ greeting }}，{{ user.user?.name }}（家属端）</view>
        <view class="date">管理你照护的老人的用药安全</view>
      </view>
      <view class="card" v-if="!elders.length">
        <view class="empty">还没有绑定的老人</view>
        <button class="btn-primary" @click="go('/pages/family/family')">去绑定老人</button>
      </view>
      <view class="card elder-card" v-for="e in elders" :key="e.bindId" @click="viewSummary(e.elderId)">
        <view class="elder-head">👴 {{ e.name }} <text class="scope-tag">{{ scopesText(e.scopes) }}</text></view>
        <view class="elder-stats" v-if="summaries[e.elderId]">
          <text>用药 {{ summaries[e.elderId].summary.medCount }} 种</text>
          <text>今日 {{ summaries[e.elderId].summary.todayTaken }}/{{ summaries[e.elderId].summary.todayTotal }}</text>
          <text v-if="summaries[e.elderId].summary.alertLevel" class="alert-text-mini">⚠️ {{ summaries[e.elderId].summary.alertLevel }}</text>
        </view>
      </view>
      <view class="grid">
        <view class="grid-item g3" @click="go('/pages/qa/qa')"><text class="g-icon">💬</text><text class="g-title">问药助手</text><text class="g-sub">帮老人查用药</text></view>
        <view class="grid-item g5" @click="go('/pages/family/family')"><text class="g-icon">👨‍👩‍👧</text><text class="g-title">家庭协同</text><text class="g-sub">绑定·授权管理</text></view>
      </view>
    </block>

    <view v-if="summaryView" class="mask" @click="summaryView = null">
      <view class="sheet" @click.stop>
        <view class="sheet-title">{{ summaryView.name }} 的用药摘要</view>
        <view class="sheet-item" v-for="(b, i) in summaryView.summary.medBriefs" :key="i">💊 {{ b }}</view>
        <view class="sheet-item">今日服药：{{ summaryView.summary.todayTaken }} / {{ summaryView.summary.todayTotal }}</view>
        <view class="sheet-item" v-if="summaryView.summary.adherence7d">近7天依从率：{{ summaryView.summary.adherence7d.adherenceRate }}%</view>
        <view class="sheet-item" v-if="summaryView.summary.missed7d">近7天漏服：{{ summaryView.summary.missed7d }} 次</view>
        <button class="btn-primary" @click="summaryView = null">关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { request } from '../../utils/request'
import { useUser } from '../../store/user'

const user = useUser()
const taken = ref(0)
const totalTask = ref(0)
const highConflicts = ref<any[]>([])
const elders = ref<any[]>([])
const summaries = ref<Record<number, any>>({})
const summaryView = ref<any>(null)

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好'
})
const todayText = computed(() => {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`
})
const pct = computed(() => (totalTask.value ? Math.round((taken.value / totalTask.value) * 100) : 0))

function go(url: string) { uni.navigateTo({ url }) }
function goToday() { uni.switchTab({ url: '/pages/today/today' }) }
function scopesText(scopes: string[]) {
  const CN: Record<string, string> = { VIEW_SUMMARY: '看摘要', VIEW_ADHERENCE: '看依从', RECEIVE_ALERTS: '收提醒' }
  return (scopes || []).map(s => CN[s] || s).join('·') || '未授权'
}

async function load() {
  try {
    if (user.isElder) {
      const tasks: any[] = await request('/api/checkins/today')
      totalTask.value = tasks.length
      taken.value = tasks.filter(t => t.status === 'TAKEN' || t.status === 'LATE').length
      const cf: any[] = await request('/api/conflict/check', { method: 'POST', body: {} })
      highConflicts.value = (cf || []).filter((c: any) => c.riskLevel === 'HIGH')
    } else {
      elders.value = await request('/api/family/elders')
      for (const e of elders.value) {
        if (!(e.scopes || []).includes('VIEW_SUMMARY')) continue
        request(`/api/family/summary/${e.elderId}`).then(s => { summaries.value[e.elderId] = s }).catch(() => {})
      }
    }
  } catch (e) { /* 静默：首页可降级展示 */ }
}

async function viewSummary(elderId: number) {
  const e = elders.value.find(x => x.elderId === elderId)
  if (!(e.scopes || []).includes('VIEW_SUMMARY')) return uni.showToast({ title: '老人未授权查看摘要', icon: 'none' })
  try {
    const s = await request(`/api/family/summary/${elderId}`)
    summaryView.value = { name: e.name, ...s }
  } catch (err: any) { uni.showToast({ title: err.message, icon: 'none' }) }
}

onShow(load)
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>

<style scoped>
.hero { background: linear-gradient(135deg, #0f766e 0%, #0d9488 48%, #2dd4bf 100%); padding: 44rpx 36rpx 100rpx; color: #fff; border-radius: 0 0 48rpx 48rpx; }
.hero.family { padding-bottom: 44rpx; }
.hello { font-size: 46rpx; font-weight: 900; letter-spacing: 2rpx; }
.date { font-size: 28rpx; opacity: 0.92; margin-top: 8rpx; }
.progress-card { background: rgba(255,255,255,0.18); border: 2rpx solid rgba(255,255,255,0.28); border-radius: 28rpx; padding: 30rpx; margin-top: 30rpx; box-shadow: inset 0 2rpx 0 rgba(255,255,255,0.25); }
.progress-num { font-size: 66rpx; font-weight: 900; letter-spacing: -1rpx; }
.progress-label { font-size: 28rpx; opacity: 0.92; }
.progress-bar { height: 16rpx; background: rgba(255,255,255,0.3); border-radius: 8rpx; margin-top: 16rpx; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #fbbf24, #fde68a); border-radius: 8rpx; transition: width 0.4s; }
.alert-card { display: flex; gap: 16rpx; margin-top: -70rpx; border: 2rpx solid #fca5a5; background: linear-gradient(135deg, #fef2f2, #fee2e2);
  box-shadow: 0 12rpx 34rpx rgba(220, 38, 38, 0.14); animation: mgRise2 0.45s ease-out backwards, mgBreathe 2.6s ease-in-out 0.6s infinite; }
@keyframes mgRise2 { from { opacity: 0; transform: translateY(24rpx); } to { opacity: 1; transform: none; } }
@keyframes mgBreathe { 0%,100% { box-shadow: 0 12rpx 34rpx rgba(220,38,38,0.14); } 50% { box-shadow: 0 12rpx 46rpx rgba(220,38,38,0.30); } }
.alert-icon { font-size: 44rpx; }
.alert-title { font-size: 32rpx; font-weight: 900; color: #b91c1c; letter-spacing: 1rpx; }
.alert-text { font-size: 26rpx; color: #7f1d1d; margin-top: 6rpx; }
.grid { display: flex; flex-wrap: wrap; padding: 0 16rpx; }
.grid-item { width: calc(50% - 16rpx); margin: 8rpx; border-radius: 40rpx; padding: 32rpx 24rpx; display: flex; flex-direction: column;
  background: rgba(255,255,255,0.96); border: 1rpx solid rgba(255,255,255,0.85);
  box-shadow: 0 2rpx 8rpx rgba(15,23,42,0.04), 0 8rpx 28rpx rgba(15,23,42,0.08);
  animation: mgRise2 0.5s ease-out backwards; }
.g1 { animation-delay: 0.02s; } .g2 { animation-delay: 0.07s; } .g3 { animation-delay: 0.12s; }
.g4 { animation-delay: 0.17s; } .g5 { animation-delay: 0.22s; } .g6 { animation-delay: 0.27s; }
.g-icon { width: 104rpx; height: 104rpx; border-radius: 34rpx; font-size: 54rpx; line-height: 104rpx; text-align: center; }
.g1 .g-icon { background: linear-gradient(145deg, #ecfdf9, #d5f6ee); box-shadow: 0 8rpx 24rpx rgba(13,148,136,0.14); }
.g2 .g-icon { background: linear-gradient(145deg, #eff6ff, #dbeafe); box-shadow: 0 8rpx 24rpx rgba(59,130,246,0.14); }
.g3 .g-icon { background: linear-gradient(145deg, #fefce8, #fef9c3); box-shadow: 0 8rpx 24rpx rgba(202,138,4,0.14); }
.g4 .g-icon { background: linear-gradient(145deg, #fdf2f8, #fce7f3); box-shadow: 0 8rpx 24rpx rgba(219,39,119,0.14); }
.g5 .g-icon { background: linear-gradient(145deg, #f0fdf4, #dcfce7); box-shadow: 0 8rpx 24rpx rgba(22,163,74,0.14); }
.g6 .g-icon { background: linear-gradient(145deg, #f1f5f9, #e2e8f0); box-shadow: 0 8rpx 24rpx rgba(100,116,139,0.14); }
.g-title { font-size: 34rpx; font-weight: 800; margin-top: 18rpx; color: #0f172a; letter-spacing: 1rpx; }
.g-sub { font-size: 24rpx; color: #64748b; margin-top: 4rpx; }
.empty { text-align: center; color: #94a3b8; padding: 30rpx 0; }
.elder-card { padding: 30rpx; }
.elder-head { font-size: 36rpx; font-weight: 800; color: #0f172a; }
.scope-tag { font-size: 22rpx; color: #115e59; background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border: 1rpx solid rgba(20,184,166,0.3); border-radius: 999rpx; padding: 4rpx 16rpx; margin-left: 12rpx; font-weight: 700; }
.elder-stats { display: flex; gap: 24rpx; font-size: 28rpx; color: #64748b; margin-top: 14rpx; }
.alert-text-mini { color: #dc2626; font-weight: 800; }
.mask { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: flex-end; z-index: 99; }
.sheet { width: 100%; background: #ffffff; border-radius: 48rpx 48rpx 0 0; padding: 40rpx 32rpx 48rpx; box-shadow: 0 -12rpx 60rpx rgba(15,23,42,0.18); }
.sheet-title { font-size: 38rpx; font-weight: 900; margin-bottom: 20rpx; color: #0f172a; letter-spacing: 1rpx; }
.sheet-item { font-size: 30rpx; padding: 16rpx 0; border-bottom: 1rpx solid rgba(15,23,42,0.05); color: #0f172a; }
</style>
