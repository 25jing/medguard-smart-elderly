<script setup lang="ts">
import { getStoredSession } from '@/services/demoApi'
const session = getStoredSession()
const destination = session?.role === 'guardian' ? '/guardian-dashboard' : session?.role === 'admin' ? '/admin' : '/home'
</script>

<template>
  <main class="forbidden-page"><span class="forbidden-code">403</span><h1>当前账号无权访问此页面</h1><p>你的账号角色无法打开这个管理区域。</p><RouterLink class="primary-button" :to="destination">返回可访问页面</RouterLink></main>
</template>
