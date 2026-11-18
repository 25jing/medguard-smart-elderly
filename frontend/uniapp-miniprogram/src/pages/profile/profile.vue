<template>
  <view class="page">
    <view class="hero">
      <view class="avatar">👤</view>
      <view class="info">
        <view class="name">{{ user.user?.name }}</view>
        <view class="phone">{{ user.user?.phone }} · {{ roleCn }}</view>
      </view>
    </view>

    <view class="card">
      <view class="row" @click="viewRecords">
        <text class="row-icon">📖</text><text class="row-label">用药记录与依从率</text><text class="arrow">›</text>
      </view>
      <view class="row" @click="goPlans">
        <text class="row-icon">📋</text><text class="row-label">我的用药计划</text><text class="arrow">›</text>
      </view>
      <view class="row" @click="goFamily">
        <text class="row-icon">👨‍👩‍👧</text><text class="row-label">家庭协同与授权</text><text class="arrow">›</text>
      </view>
    </view>

    <view class="card">
      <view class="section-title">健康数据知情同意</view>
      <view class="consent-row">
        <view class="consent-text">同意平台保存我的用药记录用于提醒与家属协同（保存至注销后30天；识别原图即传即删，不落盘）</view>
        <switch :checked="consented" color="#0f766e" @change="toggleConsent" />
      </view>
    </view>

    <view class="card">
      <view class="section-title">适老化说明</view>
      <view class="dim-text">小程序端跟随系统字体缩放（微信 → 我 → 设置 → 通用 → 字体大小）；界面按大字号、高对比、大按钮设计。如需语音朗读，请使用 H5/App 版（浏览器语音引擎）。</view>
    </view>

    <view class="card danger-zone">
      <view class="row" @click="logout"><text class="row-icon">🚪</text><text class="row-label red">退出登录</text></view>
      <view class="row" @click="deleteAccount"><text class="row-icon">🗑️</text><text class="row-label red">注销账号（删除个人数据）</text></view>
    </view>

    <view class="version">安心药助手 v1.0 · 智慧养老安全用药辅助平台</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/request'
import { useUser } from '../../store/user'
import { feedback } from '../../utils/tts'

const user = useUser()
const consented = ref(false)

const ROLE_CN: Record<string, string> = { ELDER: '老年人', FAMILY: '家属', ADMIN: '管理员' }
const roleCn = computed(() => ROLE_CN[user.user?.role || ''] || '')

function viewRecords() { uni.navigateTo({ url: '/pages/today/today' }) }
function goPlans() { uni.navigateTo({ url: '/pages/plans/plans' }) }
function goFamily() { uni.navigateTo({ url: '/pages/family/family' }) }

async function load() {
  try {
    const me: any = await request('/api/auth/me')
    consented.value = !!me.healthConsentAt
  } catch (e) { /* ignore */ }
}

async function toggleConsent(e: any) {
  const v = e.detail.value
  try {
    await request('/api/auth/consent/health', { method: 'POST', body: { agree: v } })
    consented.value = v
    feedback(v ? '已同意健康信息处理' : '已撤回同意（相关功能将受限）')
  } catch (err: any) {
    feedback(err.message, 'err')
    load()
  }
}

function logout() {
  uni.showModal({
    title: '退出登录', content: '确定退出吗？',
    success: r => { if (r.confirm) user.logout() }
  })
}

function deleteAccount() {
  uni.showModal({
    title: '⚠️ 注销账号', content: '注销后个人数据将按规定删除（保留至注销后30天以满足追溯要求），确定继续吗？',
    confirmColor: '#dc2626',
    success: async r => {
      if (!r.confirm) return
      try {
        await request('/api/auth/account', { method: 'DELETE' })
        feedback('账号已注销')
        setTimeout(() => user.logout(), 800)
      } catch (e: any) { feedback(e.message, 'err') }
    }
  })
}

onShow(load)
</script>

<style scoped>
.page { padding-bottom: 60rpx; }
.hero { background: linear-gradient(135deg, #0f766e 0%, #0d9488 48%, #2dd4bf 100%); padding: 52rpx 32rpx; display: flex; align-items: center; gap: 24rpx; color: #fff; border-radius: 0 0 48rpx 48rpx; }
.avatar { width: 110rpx; height: 110rpx; border-radius: 36rpx; background: rgba(255,255,255,0.2); border: 2rpx solid rgba(255,255,255,0.35); display: flex; align-items: center; justify-content: center; font-size: 56rpx; box-shadow: inset 0 4rpx 0 rgba(255,255,255,0.3); }
.name { font-size: 40rpx; font-weight: 900; letter-spacing: 2rpx; }
.phone { font-size: 26rpx; opacity: 0.88; margin-top: 6rpx; }
.row { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid rgba(15,23,42,0.05); }
.row:last-child { border-bottom: none; }
.row-icon { width: 72rpx; height: 72rpx; line-height: 72rpx; text-align: center; font-size: 40rpx; margin-right: 20rpx; border-radius: 24rpx; background: linear-gradient(145deg, #f0fdfa, #e0f5f0); box-shadow: inset 0 2rpx 0 #fff; }
.row-label { flex: 1; font-size: 32rpx; font-weight: 600; color: #0f172a; }
.row-label.red { color: #dc2626; font-weight: 700; }
.arrow { color: #cbd5e1; font-size: 40rpx; font-weight: 700; }
.section-title { font-size: 32rpx; font-weight: 800; color: #0f172a; margin-bottom: 12rpx; letter-spacing: 1rpx; }
.consent-row { display: flex; align-items: center; gap: 20rpx; }
.consent-text { flex: 1; font-size: 26rpx; color: #64748b; line-height: 1.6; }
.dim-text { font-size: 26rpx; color: #64748b; line-height: 1.7; }
.danger-zone { background: linear-gradient(135deg, #fff7f7, #fef2f2); border: 1rpx solid #fecaca; }
.danger-zone .row-icon { background: linear-gradient(145deg, #fef2f2, #fee2e2); box-shadow: inset 0 2rpx 0 #fff; }
.version { text-align: center; font-size: 22rpx; color: #94a3b8; margin-top: 40rpx; letter-spacing: 1rpx; }
</style>
