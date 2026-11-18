import { BASE_URL } from './config'

/** 与 H5 端一致的接口契约：{code:0,msg,data}；JWT 放 Authorization 头 */
export interface ApiResult<T = any> {
  code: number
  msg: string
  data: T
}

function getToken(): string {
  return uni.getStorageSync('mg_token') || ''
}

export function request<T = any>(path: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  auth?: boolean
} = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + path,
      method,
      data: body,
      header: {
        'Content-Type': 'application/json',
        ...(auth && getToken() ? { Authorization: 'Bearer ' + getToken() } : {})
      },
      success: (res) => {
        const r = res.data as ApiResult<T>
        if (r.code === 0) return resolve(r.data)
        if (r.code === 401) {
          uni.removeStorageSync('mg_token')
          uni.removeStorageSync('mg_user')
          uni.reLaunch({ url: '/pages/login/login' })
        }
        reject(new Error(r.msg || '请求失败'))
      },
      fail: () => reject(new Error('网络异常，请确认后端服务已启动'))
    })
  })
}

/** 拍照识药上传（multipart，走后端 /api/recognize 代理） */
export function uploadRecognize(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: BASE_URL + '/api/recognize',
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + getToken() },
      success: (res) => {
        try {
          const r = JSON.parse(res.data) as ApiResult
          if (r.code === 0) resolve(r.data)
          else reject(new Error(r.msg))
        } catch (e) {
          reject(new Error('识别服务响应异常'))
        }
      },
      fail: () => reject(new Error('上传失败，请检查网络'))
    })
  })
}
