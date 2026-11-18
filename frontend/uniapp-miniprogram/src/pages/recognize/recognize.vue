<template>
  <view class="page">
    <!-- 步骤1：拍照/选择（申报书指标：3步内完成识药） -->
    <block v-if="step === 'idle'">
      <view class="card tip">第1步/共3步：把药盒正面（有药名的一面）对准相机，光线要亮</view>
      <view class="cam-btn" @click="pick(true)"><text class="cam-icon">📷</text><text>拍照识别</text></view>
      <view class="sub-btn" @click="pick(false)">🖼️ 从相册选择</view>
      <view class="sub-btn plain" @click="step = 'manual'">⌨️ 手动输入药名查询</view>
    </block>

    <!-- 识别中 -->
    <block v-if="step === 'busy'">
      <view class="card loading-card"><view class="spin">⏳</view><view>正在识别，大约需要几秒钟…</view><view class="small">（首次调用AI模型加载稍慢）</view></view>
    </block>

    <!-- 步骤2：选结果 -->
    <block v-if="step === 'result'">
      <view class="card tip">第2步/共3步：下面哪个是您拍的药？点一下</view>
      <view class="card cand" v-for="c in result.candidates" :key="c.medicationId" @click="choose(c)">
        <view class="cand-head">{{ c.name }} <text class="conf" :class="c.confidence >= 0.75 ? 'hi' : 'lo'">{{ Math.round(c.confidence * 100) }}%</text></view>
        <view class="cand-sub">{{ c.brandName }} · {{ c.matchedBy === 'OCR_DICT' ? '文字匹配' : 'AI识别' }}</view>
      </view>
      <view class="card warn-card" v-if="result.lowConfidence">识别置信度偏低，请核对药盒或手动搜索</view>
      <view class="sub-btn plain" @click="step = 'manual'">都不是？手动输入药名</view>
      <view class="sub-btn plain" @click="reset">重新拍照</view>
    </block>

    <!-- 步骤3：加入计划（带冲突校验） -->
    <block v-if="step === 'plan'">
      <view class="card tip">第3步/共3步：设置服药时间，加入用药计划</view>
      <view class="card">
        <view class="med-name">💊 {{ chosen.name }}</view>
        <view class="dose-row" v-if="chosen.dosage">说明书用法：{{ chosen.dosage }}</view>
        <view class="label">每天服药时间（可多选）</view>
        <view class="time-chips">
          <view class="chip" v-for="t in TIME_OPTS" :key="t" :class="{ on: times.includes(t) }" @click="toggleTime(t)">{{ t }}</view>
        </view>
      </view>
      <view class="card hint">保存时系统会自动做用药冲突校验（成分重复 / 同类叠加 / 禁忌配伍 / 老年慎用），如有风险会弹窗提示</view>
      <button class="btn-primary" :loading="saving" @click="savePlan">确认加入用药计划</button>
    </block>

    <!-- 手动搜索兜底 -->
    <block v-if="step === 'manual'">
      <view class="card">
        <input v-model="keyword" class="input" placeholder="输入药名，如：阿司匹林" @confirm="search" />
        <button class="btn-primary" style="margin-top:20rpx" @click="search">搜索</button>
      </view>
      <view class="card cand" v-for="m in meds" :key="m.id" @click="choose({ medicationId: m.id, name: m.genericName, dosage: m.dosage })">
        <view class="cand-head">{{ m.genericName }}</view>
        <view class="cand-sub">{{ m.brandName }} · {{ m.drugClass }}</view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { request, uploadRecognize } from '../../utils/request'
import { feedback } from '../../utils/tts'

const TIME_OPTS = ['07:00', '08:00', '12:00', '18:00', '20:00', '21:00']

const step = ref<'idle' | 'busy' | 'result' | 'plan' | 'manual'>('idle')
const result = ref<any>({})
const chosen = ref<any>({})
const times = ref<string[]>(['08:00'])
const saving = ref(false)
const keyword = ref('')
const meds = ref<any[]>([])

function reset() { step.value = 'idle'; result.value = {} }

function pick(camera: boolean) {
  uni.chooseImage({
    count: 1,
    sourceType: camera ? ['camera'] : ['album'],
    sizeType: ['compressed'], // 小程序端压缩（等效 H5 canvas 压缩长边1280）
    success: async (res) => {
      step.value = 'busy'
      try {
        const data = await uploadRecognize(res.tempFilePaths[0])
        result.value = data
        if (data.candidates && data.candidates.length) step.value = 'result'
        else { feedback('没认出来，试试手动输入药名', 'warn'); step.value = 'manual' }
      } catch (e: any) {
        feedback(e.message, 'err')
        step.value = 'idle'
      }
    }
  })
}

async function choose(c: any) {
  chosen.value = c
  times.value = ['08:00']
  step.value = 'plan'
  try {
    // 记录用户确认（用于识别质量闭环统计）
    if (result.value.logId) await request(`/api/recognize/${result.value.logId}/confirm`, { method: 'POST', body: { medicationId: c.medicationId } }).catch(() => {})
    // 补充说明书用法展示
    const med = await request(`/api/medications?keyword=${encodeURIComponent(c.name)}&size=1`)
    if (med.records && med.records[0]) chosen.value.dosage = med.records[0].dosage
  } catch (e) { /* 展示增强失败不阻塞主流程 */ }
}

function toggleTime(t: string) {
  const i = times.value.indexOf(t)
  if (i >= 0) times.value.splice(i, 1)
  else times.value.push(t)
}

async function savePlan() {
  if (!times.value.length) return feedback('请至少选择一个服药时间', 'warn')
  saving.value = true
  try {
    const r: any = await request('/api/plans', { method: 'POST', body: { medicationId: chosen.value.medicationId, medName: chosen.value.name, doseText: '1次量（遵医嘱）', times: times.value.sort() } })
    const ws = r.conflictWarnings || []
    if (ws.length) {
      // 服务端在建计划时做了全量冲突校验（成分重复/同类叠加/禁忌配伍/老年慎用）
      uni.showModal({
        title: `发现 ${ws.length} 条用药冲突`,
        content: ws.map((w: any) => `【${w.riskLevel === 'HIGH' ? '高危' : w.riskLevel === 'MEDIUM' ? '中风险' : '提示'}】${w.explanation}`).join('\n\n'),
        showCancel: false,
        confirmText: '知道了',
        success: () => uni.switchTab({ url: '/pages/today/today' })
      })
    } else {
      feedback('已加入用药计划')
      setTimeout(() => uni.switchTab({ url: '/pages/today/today' }), 800)
    }
  } catch (e: any) {
    feedback(e.message, 'err')
  } finally {
    saving.value = false
  }
}

async function search() {
  if (!keyword.value.trim()) return
  try {
    const d = await request(`/api/medications?keyword=${encodeURIComponent(keyword.value.trim())}&size=20`)
    meds.value = d.records
    if (!meds.value.length) feedback('知识库里没有这个药，试试通用名', 'warn')
  } catch (e: any) { feedback(e.message, 'err') }
}
</script>

<style scoped>
.page { padding: 20rpx 0 60rpx; }
.tip { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border: 2rpx solid rgba(20,184,166,0.35); font-size: 32rpx; color: #115e59; font-weight: 700; letter-spacing: 1rpx; }
.small { font-size: 24rpx; color: #94a3b8; }
.cam-btn { margin: 30rpx 24rpx; background: linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%); color: #fff; border-radius: 40rpx; padding: 80rpx 0; text-align: center; font-size: 44rpx; font-weight: 900; letter-spacing: 4rpx; display: flex; flex-direction: column; gap: 16rpx;
  box-shadow: 0 20rpx 50rpx rgba(13,148,136,0.38), inset 0 4rpx 0 rgba(255,255,255,0.3); }
.cam-icon { font-size: 100rpx; width: 200rpx; height: 200rpx; line-height: 200rpx; margin: 0 auto; border-radius: 68rpx; background: rgba(255,255,255,0.16); box-shadow: inset 0 4rpx 0 rgba(255,255,255,0.3); }
.sub-btn { margin: 20rpx 24rpx; background: rgba(255,255,255,0.96); border: 1rpx solid rgba(255,255,255,0.85); border-radius: 32rpx; padding: 34rpx 0; text-align: center; font-size: 34rpx; font-weight: 700; color: #0d9488; box-shadow: 0 2rpx 8rpx rgba(15,23,42,0.04), 0 8rpx 28rpx rgba(15,23,42,0.08); }
.sub-btn.plain { color: #64748b; font-weight: 500; }
.loading-card { text-align: center; padding: 80rpx 30rpx; font-size: 34rpx; }
.spin { font-size: 80rpx; animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { opacity: 0.4; } }
.cand-head { font-size: 38rpx; font-weight: 800; color: #0f172a; display: flex; justify-content: space-between; letter-spacing: 1rpx; }
.conf { font-size: 30rpx; font-weight: 800; } .conf.hi { color: #0d9488; } .conf.lo { color: #d97706; }
.cand-sub { font-size: 26rpx; color: #64748b; margin-top: 8rpx; }
.warn-card { background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 2rpx solid #fde68a; color: #92400e; font-size: 28rpx; font-weight: 600; }
.med-name { font-size: 40rpx; font-weight: 900; color: #0f172a; letter-spacing: 1rpx; }
.dose-row { font-size: 28rpx; color: #64748b; margin: 12rpx 0; }
.hint { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); color: #115e59; font-size: 26rpx; }
.label { font-size: 30rpx; font-weight: 800; color: #0f172a; margin: 20rpx 0 12rpx; letter-spacing: 1rpx; }
.time-chips { display: flex; flex-wrap: wrap; gap: 16rpx; }
.chip { padding: 18rpx 30rpx; background: rgba(255,255,255,0.95); border-radius: 24rpx; font-size: 32rpx; font-weight: 600; color: #64748b; border: 3rpx solid #e2e8f0; }
.chip.on { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border-color: #14b8a6; color: #115e59; font-weight: 800; box-shadow: 0 8rpx 22rpx rgba(13,148,136,0.16); }
.conflict { border-left: 10rpx solid #dc2626; background: linear-gradient(135deg, #fef2f2, #fee2e2); }
.input { background: rgba(255,255,255,0.95); border: 2rpx solid #e2e8f0; border-radius: 28rpx; padding: 24rpx; font-size: 34rpx; }
.btn-primary { margin: 24rpx; }
</style>
