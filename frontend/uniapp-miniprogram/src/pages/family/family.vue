<template>
  <view class="page">
    <!-- 老人视角：管理家属授权 -->
    <block v-if="user.isElder">
      <view class="card tip">授权后，家属只能看到您勾选的内容。随时可以取消。</view>

      <view class="card">
        <view class="section-title">邀请家属</view>
        <input v-model.trim="invPhone" class="input" type="number" maxlength="11" placeholder="输入家属手机号" />
        <view class="scopes">
          <view class="scope" v-for="s in SCOPES" :key="s.key" :class="{ on: invScopes.includes(s.key) }" @click="toggleScope(s.key)">
            {{ s.cn }}
          </view>
        </view>
        <button class="btn-primary" style="margin:20rpx 0 0" @click="invite">发送邀请</button>
      </view>

      <view class="card">
        <view class="section-title">待我处理的申请</view>
        <view class="empty-line" v-if="!invites.length">暂无</view>
        <view class="inv" v-for="iv in invites" :key="iv.id">
          <view class="inv-body">
            <view class="inv-name">{{ iv.familyName }}（{{ iv.familyPhone }}）</view>
            <view class="inv-scopes">申请：{{ scopesText(iv.scopes) }}</view>
          </view>
          <view class="inv-btns">
            <view class="btn-ok" @click="respond(iv, true)">同意</view>
            <view class="btn-no" @click="respond(iv, false)">拒绝</view>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="section-title">已授权家属</view>
        <view class="empty-line" v-if="!members.length">暂无</view>
        <view class="inv" v-for="m in members" :key="m.id">
          <view class="inv-body">
            <view class="inv-name">{{ m.familyName }}（{{ m.familyPhone }}）</view>
            <view class="inv-scopes">{{ scopesText(m.scopes) }}</view>
          </view>
          <view class="btn-no" @click="revoke(m)">取消授权</view>
        </view>
      </view>
    </block>

    <!-- 家属视角：绑定老人 -->
    <block v-else>
      <view class="card">
        <view class="section-title">绑定老人</view>
        <input v-model.trim="bindPhone" class="input" type="number" maxlength="11" placeholder="输入老人注册手机号" />
        <view class="scopes">
          <view class="scope" v-for="s in SCOPES" :key="s.key" :class="{ on: bindScopes.includes(s.key) }" @click="toggleBindScope(s.key)">
            {{ s.cn }}
          </view>
        </view>
        <button class="btn-primary" style="margin:20rpx 0 0" @click="bind">发送绑定申请（需老人同意）</button>
      </view>

      <view class="card">
        <view class="section-title">我照护的老人</view>
        <view class="empty-line" v-if="!elders.length">暂无，请先绑定</view>
        <view class="inv" v-for="e in elders" :key="e.bindId">
          <view class="inv-body">
            <view class="inv-name">👴 {{ e.name }}</view>
            <view class="inv-scopes">{{ scopesText(e.scopes) }}</view>
          </view>
          <view class="btn-no" @click="unbind(e)">解除</view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/request'
import { useUser } from '../../store/user'
import { feedback } from '../../utils/tts'

const SCOPES = [
  { key: 'VIEW_SUMMARY', cn: '看用药摘要' },
  { key: 'VIEW_ADHERENCE', cn: '看依从率' },
  { key: 'RECEIVE_ALERTS', cn: '收漏服/冲突提醒' }
]
const SCOPE_CN: Record<string, string> = { VIEW_SUMMARY: '看摘要', VIEW_ADHERENCE: '看依从', RECEIVE_ALERTS: '收提醒' }

const user = useUser()
const invPhone = ref('')
const invScopes = ref<string[]>(['VIEW_SUMMARY', 'RECEIVE_ALERTS'])
const invites = ref<any[]>([])
const members = ref<any[]>([])
const bindPhone = ref('')
const bindScopes = ref<string[]>(['VIEW_SUMMARY', 'RECEIVE_ALERTS'])
const elders = ref<any[]>([])

function scopesText(ss: string[] | string) {
  const arr = typeof ss === 'string' ? ss.split(',') : ss || []
  return arr.map(s => SCOPE_CN[s] || s).join(' · ') || '未授权'
}
function toggleScope(k: string) {
  const i = invScopes.value.indexOf(k)
  i >= 0 ? invScopes.value.splice(i, 1) : invScopes.value.push(k)
}
function toggleBindScope(k: string) {
  const i = bindScopes.value.indexOf(k)
  i >= 0 ? bindScopes.value.splice(i, 1) : bindScopes.value.push(k)
}

async function load() {
  try {
    if (user.isElder) {
      members.value = await request('/api/family/members')
      invites.value = await request('/api/family/invites')
    } else {
      elders.value = await request('/api/family/elders')
    }
  } catch (e) { /* ignore */ }
}

async function invite() {
  if (!/^1\d{10}$/.test(invPhone.value)) return feedback('请输入正确的11位手机号', 'warn')
  if (!invScopes.value.length) return feedback('请至少选择一项授权', 'warn')
  try {
    await request('/api/family/invites', { method: 'POST', body: { familyPhone: invPhone.value, scopes: invScopes.value } })
    feedback('邀请已发送，等待家属接受')
    invPhone.value = ''
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

async function respond(iv: any, approve: boolean) {
  try {
    await request(`/api/family/invites/${iv.id}/respond`, { method: 'POST', body: { approve } })
    feedback(approve ? '已同意授权' : '已拒绝')
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

async function revoke(m: any) {
  try {
    await request(`/api/family/members/${m.id}/revoke`, { method: 'POST' })
    feedback('已取消授权')
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

async function bind() {
  if (!/^1\d{10}$/.test(bindPhone.value)) return feedback('请输入正确的11位手机号', 'warn')
  if (!bindScopes.value.length) return feedback('请至少选择一项授权', 'warn')
  try {
    await request('/api/family/bind', { method: 'POST', body: { elderPhone: bindPhone.value, scopes: bindScopes.value } })
    feedback('申请已发送，等待老人在小程序中同意')
    bindPhone.value = ''
    load()
  } catch (e: any) { feedback(e.message, 'err') }
}

async function unbind(e: any) {
  try {
    await request(`/api/family/members/${e.bindId}/revoke`, { method: 'POST' })
    feedback('已解除绑定')
    load()
  } catch (err: any) { feedback(err.message, 'err') }
}

onShow(load)
</script>

<style scoped>
.page { padding-bottom: 60rpx; }
.tip { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border: 2rpx solid rgba(20,184,166,0.35); color: #115e59; font-size: 28rpx; font-weight: 600; }
.section-title { font-size: 34rpx; font-weight: 800; color: #0f172a; margin-bottom: 16rpx; letter-spacing: 1rpx; }
.input { background: rgba(255,255,255,0.95); border: 2rpx solid #e2e8f0; border-radius: 28rpx; padding: 22rpx; font-size: 32rpx; }
.scopes { display: flex; gap: 14rpx; flex-wrap: wrap; margin-top: 16rpx; }
.scope { padding: 14rpx 26rpx; background: rgba(255,255,255,0.95); border-radius: 999rpx; font-size: 28rpx; font-weight: 600; color: #64748b; border: 3rpx solid #e2e8f0; }
.scope.on { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border-color: #14b8a6; color: #115e59; font-weight: 800; box-shadow: 0 8rpx 22rpx rgba(13,148,136,0.16); }
.inv { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid rgba(15,23,42,0.05); }
.inv-body { flex: 1; }
.inv-name { font-size: 32rpx; font-weight: 700; color: #0f172a; }
.inv-scopes { font-size: 26rpx; color: #64748b; margin-top: 4rpx; }
.inv-btns { display: flex; gap: 12rpx; }
.btn-ok { background: linear-gradient(135deg, #0f766e, #14b8a6); color: #fff; border-radius: 999rpx; padding: 12rpx 28rpx; font-size: 28rpx; font-weight: 700; box-shadow: 0 8rpx 20rpx rgba(13,148,136,0.3), inset 0 2rpx 0 rgba(255,255,255,0.3); }
.btn-no { background: #fef2f2; color: #b91c1c; font-weight: 700; border: 2rpx solid #fecaca; border-radius: 999rpx; padding: 12rpx 28rpx; font-size: 28rpx; flex: none; }
.empty-line { color: #94a3b8; font-size: 28rpx; padding: 16rpx 0; }
</style>
