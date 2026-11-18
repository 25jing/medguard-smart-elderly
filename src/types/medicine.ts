/** OCR识别得到的药品信息，真实后端返回字段可在此统一调整。 */
export interface MedicineInfo {
  /** 药品名称 */
  name: string
  /** 识别到的药品文字 */
  description: string
  /** 面向用户展示的用药建议 */
  advice: string
}

/** 一条已保存的用药记录。 */
export interface MedicineRecord {
  /** 本地记录唯一编号 */
  id: string
  /** 药品名称 */
  medicineName: string
  /** 用药建议 */
  advice: string
  /** 识别时间，使用可读格式 */
  recognizedAt: string
}

/** OCR接口统一响应结构。 */
export interface OcrMedicineResponse {
  success: boolean
  data: MedicineInfo
  message?: string
}

/** 保存记录接口统一响应结构。 */
export interface SaveMedicineRecordResponse {
  success: boolean
  data: MedicineRecord
  message?: string
}