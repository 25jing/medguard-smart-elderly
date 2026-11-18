<template>
  <view class="page">
    <view class="card" v-for="p in plans" :key="p.id">
      <view class="plan-head">
        <view class="plan-name">💊 {{ p.medName }}</view>
        <view class="plan-stop" @click="stop(p)">停用</view>
      </view>
      <view class="plan-dose">{{ p.doseText }}</view>
      <view class="plan-times">
        <text class="t" v-for="t in (p.times || '').split(',')" :key="t">⏰ {{ t }}</text>
      </view>
      <view class="plan-meta" v-if="p.notes">备注：{{ p.notes }}</view>
    </view>
    <view class="card empty" v-if="!plans.length && loaded">还没有用药计划，点击下方按钮添加</view>

    <view class="add-bar">
      <button class="btn-primary" @click="openAdd">＋ 添加用药计划</button>
    </view>

    <view v-if="adding" class="mask">
      <view class="sheet">
        <view class="sheet-title">添加用药计划</view>
        <input v-model="keyword" class="input" placeholder="搜索药名，如：阿司匹林" @input="search" />
        <scroll-view scroll-y class="med-list">
          <view class="med" v-for="m in meds" :key="m.id" :class="{ on: chosen && chosen.id === m.id }" @click="chosen = m">
            <view class="med-name">{{ m.genericName }}</view>
            <view class="med-sub">{{ m.brandName }} · {{ m.drugClass }}</view>
          </view>
        </scroll-view>
        <view class="label">每天服药时间（可多选）</view>
        <view class="time-chips">
          <view class="chip" v-for="t in TIME_OPTS" :key="t" :class="{ on: times.includes(t) }" @click="toggleTime(t)">{{ t }}</view>
        </view>
        <view class="sheet-btns">
          <button @click="adding = false">取消</button>
          <button class="btn-primary" style="margin:0" :loading="saving" @click="save">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/request'
import { feedback } from '../../utils/tts'

const TIME_OPTS = ['07:00', '08:00', '12:00', '18:00', '20:00', '21:00']
const plans = ref<any[]>([])
const loaded = ref(false)
const adding = ref(false)
const saving = ref(false)
const keyword = ref('')
const meds = ref<any[]>([])
const chosen = ref<any>(null)
const times = ref<string[]>(['08:00'])

async function load() {
  try { plans.value = await request('/api/plans') } catch (e: any) { feedback(e.message, 'err') }
  loaded.value = true
}

function openAdd() {
  adding.value = true
  keyword.value = ''
  meds.value = []
  chosen.value = null
  times.value = ['08:00']
  search()
}

let timer: any = null
function search() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      const d = await request(`/api/medications?keyword=${encodeURIComponent(keyword.value.trim())}&size=20`)
      meds.value = d.records
    } catch (e) { /* ignore */ }
  }, 300)
}

function toggleTime(t: string) {
  const i = times.value.indexOf(t)
  if (i >= 0) times.value.splice(i, 1)
  else times.value.push(t)
}

async function save() {
  if (!chosen.value) return feedback('请先选择药品', 'warn')
  if (!times.value.length) return feedback('请至少选择一个时间', 'warn')
  saving.value = true
  try {
    const r: any = await request('/api/plans', {
      method: 'POST',
      body: { medicationId: chosen.value.id, doseText: '1次量（遵医嘱）', times: times.value.sort() }
    })
    const ws = r.conflictWarnings || []
    if (ws.length) {
      uni.showModal({
        title: `发现 ${ws.length} 条用药冲突`,
        content: ws.map((w: any) => `【${w.riskLevel === 'HIGH' ? '高危' : w.riskLevel}】${w.explanation}`).join('\n\n'),
        showCancel: false,
        confirmText: '知道了'
      })
    } else {
      feedback('已添加用药计划')
    }
    adding.value = false
    load()
  } catch (e: any) {
    feedback(e.message, 'err')
  } finally {
    saving.value = false
  }
}

async function stop(p: any) {
  const ok = await new Promise<boolean>(resolve => {
    uni.showModal({ title: '停用计划', content: `确定停用「${p.medName}」吗？`, success: r => resolve(!!r.confirm) })
  })
  if (!ok) return
  try {
    await request(`/api/plans/${p.id}/stop`, { method: 'POST' })
    feedback('已停用')
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

onShow(load)
</script>

<style scoped>
.page { padding-bottom: 200rpx; }
.plan-head { display: flex; justify-content: space-between; align-items: center; }
.plan-name { font-size: 36rpx; font-weight: 800; color: #0f172a; letter-spacing: 1rpx; }
.plan-stop { color: #b91c1c; font-weight: 700; font-size: 28rpx; padding: 8rpx 22rpx; background: #fef2f2; border: 2rpx solid #fecaca; border-radius: 999rpx; }
.plan-dose { font-size: 28rpx; color: #64748b; margin-top: 10rpx; }
.plan-times { display: flex; gap: 14rpx; flex-wrap: wrap; margin-top: 16rpx; }
.t { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); color: #115e59; font-size: 28rpx; font-weight: 700; padding: 8rpx 24rpx; border-radius: 999rpx; border: 1rpx solid rgba(20,184,166,0.3); }
.plan-meta { font-size: 24rpx; color: #94a3b8; margin-top: 10rpx; }
.empty { text-align: center; color: #94a3b8; padding: 60rpx; }
.add-bar { position: fixed; left: 0; right: 0; bottom: calc(120rpx + env(safe-area-inset-bottom)); padding: 0 24rpx; }
.mask { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: flex-end; z-index: 99; }
.sheet { width: 100%; background: #ffffff; border-radius: 48rpx 48rpx 0 0; padding: 40rpx 32rpx 48rpx; max-height: 85vh; overflow-y: auto; box-shadow: 0 -12rpx 60rpx rgba(15,23,42,0.18); }
.sheet-title { font-size: 38rpx; font-weight: 900; margin-bottom: 20rpx; color: #0f172a; letter-spacing: 1rpx; }
.input { background: rgba(255,255,255,0.95); border: 2rpx solid #e2e8f0; border-radius: 28rpx; padding: 22rpx; font-size: 32rpx; }
.med-list { max-height: 400rpx; margin-top: 16rpx; }
.med { padding: 20rpx; border-radius: 24rpx; border: 3rpx solid transparent; background: rgba(248,250,252,0.9); margin-bottom: 12rpx; }
.med.on { border-color: #14b8a6; background: linear-gradient(135deg, #f0fdfa, #ccfbf1); box-shadow: 0 8rpx 22rpx rgba(13,148,136,0.16); }
.med-name { font-size: 32rpx; font-weight: 700; color: #0f172a; }
.med-sub { font-size: 24rpx; color: #64748b; }
.label { font-size: 30rpx; font-weight: 800; color: #0f172a; margin: 24rpx 0 12rpx; letter-spacing: 1rpx; }
.time-chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.chip { padding: 16rpx 28rpx; background: rgba(255,255,255,0.95); border-radius: 22rpx; font-size: 30rpx; font-weight: 600; color: #64748b; border: 3rpx solid #e2e8f0; }
.chip.on { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border-color: #14b8a6; color: #115e59; font-weight: 800; box-shadow: 0 8rpx 22rpx rgba(13,148,136,0.16); }
.sheet-btns { display: flex; gap: 20rpx; margin-top: 32rpx; }
.sheet-btns button { flex: 1; margin: 0; border-radius: 28rpx; font-size: 32rpx; font-weight: 700; line-height: 92rpx; }
</style>
