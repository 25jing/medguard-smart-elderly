<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/services/demoApi'

const router = useRouter()
const route = useRoute()
const username = ref('user_elder')
const password = ref('123456')
const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const user = await login(username.value.trim(), password.value)
    const fallback = user.role === 'admin' ? '/admin' : user.role === 'guardian' ? '/guardian-dashboard' : '/home'
    router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : fallback)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败，请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <div class="auth-brand"><span class="app-brand-mark">药</span><span>安心用药 · 家庭守护</span></div>
      <p class="eyebrow">家庭老人健康守护平台</p>
      <h1>欢迎回来</h1>
      <p class="auth-copy">请登录以查看家人用药安排、提醒与健康记录。</p>
      <form class="auth-form" @submit.prevent="submit">
        <label>账号<input v-model="username" autocomplete="username" required placeholder="请输入账号" /></label>
        <label>密码<input v-model="password" type="password" autocomplete="current-password" required placeholder="请输入密码" /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary-button auth-submit" :disabled="busy">{{ busy ? '正在登录…' : '登录' }}</button>
      </form>
      <div class="demo-credentials"><strong>演示账号</strong><span>老人 user_elder / 123456</span><span>监护人 user_guard / 123456</span><span>管理员 admin / Admin@123</span></div>
      <RouterLink class="auth-link" to="/register">注册老人或监护人账号</RouterLink>
    </section>
    <aside class="auth-aside"><span class="aside-label">CARE, EVERY DAY</span><div class="care-mark">+</div><h2>每一次按时服药，<br />都值得被好好记住。</h2><p>识别药品 · 温柔提醒 · 家庭协同</p><div class="aside-line" /></aside>
  </main>
</template>
