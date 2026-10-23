<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { getCurrentUser, logout } from '@/services/demoApi'

const router = useRouter()
const user = computed(() => getCurrentUser())

function signOut(): void {
  logout()
  router.replace('/login')
}
</script>

<template>
  <header class="app-topbar">
    <RouterLink class="app-brand" to="/home"><span class="app-brand-mark">药</span> 家庭老人健康守护平台</RouterLink>
    <nav class="app-nav" aria-label="主导航">
      <RouterLink to="/home">老人首页</RouterLink>
      <RouterLink v-if="user?.role === 'guardian' || user?.role === 'admin'" to="/guardian-dashboard">家属工作台</RouterLink>
      <RouterLink v-if="user?.role === 'admin'" to="/admin">平台管理</RouterLink>
    </nav>
    <div class="app-user"><span>{{ user?.name }}</span><button class="quiet-button" type="button" @click="signOut">退出登录</button></div>
  </header>
</template>
