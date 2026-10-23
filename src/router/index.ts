import { createRouter, createWebHistory } from 'vue-router'
import { getStoredSession } from '@/services/demoApi'

const routes = [
  {
    path: '/', redirect: '/home',
  },
  {
    path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true },
  },
  {
    path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { public: true },
  },
  {
    path: '/home', name: 'home', component: () => import('../views/HomeView.vue'), meta: { roles: ['elder', 'guardian', 'admin'] },
  },
  {
    path: '/guardian-dashboard', name: 'guardian-dashboard', component: () => import('../views/GuardianDashboardView.vue'), meta: { roles: ['guardian', 'admin'] },
  },
  {
    path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { roles: ['admin'] },
  },
  {
    path: '/403', name: 'forbidden', component: () => import('../views/ForbiddenView.vue'), meta: { public: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 此守卫仅用于前端页面展示拦截；所有真实接口必须由后端再次校验 token 与角色权限。
router.beforeEach((to) => {
  const session = getStoredSession()
  const token = localStorage.getItem('token')
  const rawRole = localStorage.getItem('role')
  if (token && rawRole && !['elder', 'guardian', 'admin'].includes(rawRole)) return { name: 'forbidden' }
  if (!to.meta.public && !session) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && session) return { name: session.role === 'admin' ? 'admin' : session.role === 'guardian' ? 'guardian-dashboard' : 'home' }
  const allowedRoles = to.meta.roles as string[] | undefined
  if (allowedRoles && session && !allowedRoles.includes(session.role)) return { name: 'forbidden' }
  if (session && !['elder', 'guardian', 'admin'].includes(session.role)) return { name: 'forbidden' }
  return true
})

export default router
