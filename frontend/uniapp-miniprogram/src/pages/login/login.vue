<template>
  <view class="login-page" :style="{ paddingTop: (statusBar + 30) + 'px' }">
    <view class="logo">💊</view>
    <view class="title">安心药助手</view>
    <view class="subtitle">智慧养老安全用药辅助平台</view>

    <view class="card">
      <view class="tabs">
        <view class="tab" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</view>
        <view class="tab" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</view>
      </view>

      <view v-if="mode === 'register'" class="field">
        <text class="label">姓名</text>
        <input v-model="name" placeholder="请输入真实姓名" class="input" />
      </view>
      <view class="field">
        <text class="label">手机号</text>
        <input v-model="phone" type="number" maxlength="11" placeholder="11位手机号" class="input" />
      </view>
      <view class="field">
        <text class="label">密码</text>
        <input v-model="password" password placeholder="至少6位" class="input" />
      </view>
      <view v-if="mode === 'register'" class="field">
        <text class="label">我是</text>
        <view class="roles">
          <view class="role" :class="{ on: role === 'ELDER' }" @click="role = 'ELDER'">👴 老年人</view>
          <view class="role" :class="{ on: role === 'FAMILY' }" @click="role = 'FAMILY'">👨‍👩‍👧 家属</view>
        </view>
      </view>
      <view v-if="mode === 'register'" class="agree" @click="agree = !agree">
        <text class="checkbox">{{ agree ? '☑' : '☐' }}</text>
        <text>我已阅读并同意《知情同意书》：平台保存用药记录至注销后30天，识别原图即传即删</text>
      </view>

      <button class="btn-primary submit" :loading="busy" @click="submit">
        {{ mode === 'login' ? '登 录' : '注册并登录' }}
      </button>
      <view class="demo-row">
        <view class="demo-chip elder" @click="fillDemo('ELDER')">👴 老人演示<br /><text class="demo-sub">张桂芳 · 点此填入</text></view>
        <view class="demo-chip family" @click="fillDemo('FAMILY')">👨‍👩‍👧 家属演示<br /><text class="demo-sub">张小芳 · 点此填入</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { request } from '../../utils/request'
import { useUser } from '../../store/user'
import { feedback } from '../../utils/tts'

const mode = ref<'login' | 'register'>('login')
const name = ref('')
const phone = ref('')
const password = ref('')
const role = ref<'ELDER' | 'FAMILY'>('ELDER')
const agree = ref(false)
const busy = ref(false)
const user = useUser()
// 真实状态栏高度，用于刘海屏/挖孔屏顶部避让（自定义导航栏无系统占位）
const statusBar = ((uni as any).getWindowInfo ? (uni as any).getWindowInfo().statusBarHeight : null)
  ?? (uni.getSystemInfoSync().statusBarHeight || 20)

function fillDemo(kind: 'ELDER' | 'FAMILY' = 'ELDER') {
  mode.value = 'login'
  phone.value = kind === 'FAMILY' ? '13900002222' : '13900001111'
  password.value = '1234' + '56'
}

async function submit() {
  if (busy.value) return
  busy.value = true
  try {
    if (mode.value === 'register') {
      if (!name.value || !phone.value || password.value.length < 6) return feedback('请完整填写，密码至少6位', 'warn')
      if (!agree.value) return feedback('请先阅读并勾选知情同意', 'warn')
      await request('/api/auth/register', { method: 'POST', auth: false, body: { name: name.value, phone: phone.value, password: password.value, role: role.value, consent: true } })
      feedback('注册成功')
    }
    const d = await request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', auth: false, body: { phone: phone.value, password: password.value } })
    if (d.user.role === 'ADMIN') return feedback('管理员请使用网页管理后台', 'warn')
    user.setSession(d.token, d.user)
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (e: any) {
    feedback(e.message, 'err')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login-page { min-height: 100vh; padding: 0 24rpx 40rpx; background: linear-gradient(180deg, #c7f2e9 0%, #e6f7f3 26%, #f4f7f8 52%); }
.logo { width: 210rpx; height: 210rpx; margin: 0 auto; border-radius: 68rpx; font-size: 110rpx; line-height: 210rpx; text-align: center;
  background: linear-gradient(145deg, #ffffff, #d9f7f0);
  box-shadow: 0 28rpx 70rpx rgba(13, 148, 136, 0.28), inset 0 4rpx 0 rgba(255, 255, 255, 0.9), 0 2rpx 8rpx rgba(15, 23, 42, 0.05); }
.title { font-size: 56rpx; font-weight: 900; text-align: center; color: #0f172a; letter-spacing: 8rpx; margin-top: 30rpx; }
.subtitle { font-size: 28rpx; text-align: center; color: #64748b; letter-spacing: 2rpx; margin: 10rpx 0 46rpx; }
.tabs { display: flex; background: #e8eef4; border-radius: 24rpx; padding: 8rpx; margin-bottom: 30rpx; }
.tab { flex: 1; text-align: center; padding: 20rpx 0; font-size: 34rpx; color: #64748b; border-radius: 18rpx; font-weight: 600; }
.tab.on { color: #0d9488; font-weight: 800; background: #ffffff; border-radius: 18rpx; box-shadow: 0 6rpx 18rpx rgba(15, 23, 42, 0.1); }
.field { margin-bottom: 24rpx; }
.label { display: block; font-size: 30rpx; color: #0f172a; margin-bottom: 10rpx; font-weight: 800; letter-spacing: 1rpx; }
.input { background: rgba(255,255,255,0.95); border: 2rpx solid #e2e8f0; border-radius: 28rpx; padding: 24rpx; font-size: 34rpx; }
.roles { display: flex; gap: 20rpx; }
.role { flex: 1; text-align: center; padding: 24rpx 0; background: rgba(255,255,255,0.95); border-radius: 24rpx; font-size: 32rpx; border: 3rpx solid #e2e8f0; color: #64748b; }
.role.on { border-color: #14b8a6; background: linear-gradient(135deg, #f0fdfa, #ccfbf1); color: #115e59; font-weight: 800; box-shadow: 0 8rpx 22rpx rgba(13,148,136,0.14); }
.agree { display: flex; gap: 12rpx; font-size: 26rpx; color: #64748b; margin: 20rpx 0; line-height: 1.5; }
.checkbox { color: #0d9488; font-size: 32rpx; }
.submit { margin-top: 16rpx; }
.demo-row { display: flex; gap: 20rpx; margin-top: 26rpx; }
.demo-chip { flex: 1; text-align: center; padding: 20rpx 10rpx; border-radius: 24rpx; font-size: 28rpx; font-weight: 800; line-height: 1.5; }
.demo-chip.elder { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); color: #115e59; border: 2rpx solid #99f6e4; }
.demo-chip.family { background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #1e40af; border: 2rpx solid #bfdbfe; }
.demo-sub { font-size: 22rpx; font-weight: 500; opacity: 0.75; }
.demo { text-align: center; font-size: 26rpx; color: #0d9488; font-weight: 700; margin-top: 24rpx; text-decoration: underline; }
</style>
