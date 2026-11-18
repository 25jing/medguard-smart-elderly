<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { register } from '@/services/demoApi'

const router = useRouter()
const username = ref('')
const name = ref('')
const password = ref('')
const role = ref<'elder' | 'guardian'>('elder')
const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  if (password.value.length < 6) { error.value = '密码至少需要 6 位。'; return }
  busy.value = true
  try {
    const user = await register(username.value.trim(), password.value, name.value.trim(), role.value)
    router.replace(user.role === 'guardian' ? '/guardian-dashboard' : '/home')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '注册失败，请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-page auth-page-compact">
    <section class="auth-panel">
      <RouterLink class="auth-back" to="/login">← 返回登录</RouterLink>
      <p class="eyebrow">加入家庭照护</p><h1>创建账号</h1><p class="auth-copy">平台管理员账号由系统创建，不开放前端注册。</p>
      <form class="auth-form" @submit.prevent="submit">
        <div class="role-switch" role="group" aria-label="选择注册身份"><button type="button" :class="{ selected: role === 'elder' }" @click="role = 'elder'">老人</button><button type="button" :class="{ selected: role === 'guardian' }" @click="role = 'guardian'">监护人</button></div>
        <label>称呼<input v-model="name" required placeholder="请输入称呼" /></label>
        <label>账号<input v-model="username" required minlength="3" placeholder="设置登录账号" /></label>
        <label>密码<input v-model="password" type="password" required minlength="6" placeholder="至少 6 位" /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary-button auth-submit" :disabled="busy">{{ busy ? '正在创建…' : '创建账号' }}</button>
      </form>
    </section>
  </main>
</template>
