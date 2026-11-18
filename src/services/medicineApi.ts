import axios, { type AxiosInstance } from 'axios'
import type {
  MedicineRecord,
  OcrMedicineResponse,
  SaveMedicineRecordResponse,
} from '@/types/medicine'

/** 联调真实 SpringBoot 接口时改为 false，并按需配置 VITE_API_BASE_URL。 */
const USE_MOCK_API = true
const RECORD_STORAGE_KEY = 'elderly-medicine-records'

/** 统一配置 Axios，真实接口路径集中在本文件中管理。 */
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

/** 模拟网络延迟，让页面状态与真实请求保持一致。 */
function waitForMockResponse(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 900))
}

/** 读取浏览器中的演示记录，作为未接后端时的历史数据。 */
function readMockRecords(): MedicineRecord[] {
  try {
    const savedRecords = localStorage.getItem(RECORD_STORAGE_KEY)
    return savedRecords ? (JSON.parse(savedRecords) as MedicineRecord[]) : []
  } catch {
    return []
  }
}

/** 识别药品图片：默认返回演示数据，关闭模拟开关后请求 POST /api/ocr/medicine。 */
export async function recognizeMedicine(image: File): Promise<OcrMedicineResponse> {
  if (USE_MOCK_API) {
    await waitForMockResponse()
    return {
      success: true,
      data: {
        name: '示例药品（请以药盒信息为准）',
        description: `已收到图片“${image.name}”。当前为演示识别结果，正式使用前请由医生或药师核对药品信息。`,
        advice: '请按医生或药师的说明服用。不要自行增加、减少或停用药量；如有不适，请及时联系医生或药师。',
      },
    }
  }

  const formData = new FormData()
  formData.append('file', image)
  const response = await request.post<OcrMedicineResponse>('/api/ocr/medicine', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/** 保存用药记录：默认存入浏览器，接入后端时请求 POST /api/record/save。 */
export async function saveMedicineRecord(
  record: MedicineRecord,
): Promise<SaveMedicineRecordResponse> {
  if (USE_MOCK_API) {
    await waitForMockResponse()
    const records = readMockRecords()
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify([record, ...records]))
    return { success: true, data: record }
  }

  const response = await request.post<SaveMedicineRecordResponse>('/api/record/save', record)
  return response.data
}

/** 获取历史记录：默认从浏览器读取，接入后端时请求 GET /api/record/list。 */
export async function getMedicineRecords(): Promise<MedicineRecord[]> {
  if (USE_MOCK_API) {
    await waitForMockResponse()
    return readMockRecords()
  }

  const response = await request.get<MedicineRecord[]>('/api/record/list')
  return response.data
}