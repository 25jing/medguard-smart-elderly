import { reactive } from 'vue'

export interface UserInfo {
  id: number
  phone: string
  name: string
  role: 'ELDER' | 'FAMILY' | 'ADMIN'
  birthYear?: number | null
}

const state = reactive<{ token: string; user: UserInfo | null }>({ token: '', user: null })

export function useUser() {
  return {
    state,
    get token() { return state.token },
    get user() { return state.user },
    get isElder() { return state.user?.role === 'ELDER' },
    get isFamily() { return state.user?.role === 'FAMILY' },
    restore() {
      state.token = uni.getStorageSync('mg_token') || ''
      const u = uni.getStorageSync('mg_user')
      state.user = u ? JSON.parse(u) : null
    },
    setSession(token: string, user: UserInfo) {
      state.token = token
      state.user = user
      uni.setStorageSync('mg_token', token)
      uni.setStorageSync('mg_user', JSON.stringify(user))
    },
    logout() {
      state.token = ''
      state.user = null
      uni.removeStorageSync('mg_token')
      uni.removeStorageSync('mg_user')
      uni.reLaunch({ url: '/pages/login/login' })
    }
  }
}
