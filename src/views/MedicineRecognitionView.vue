<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getMedicineRecords,
  recognizeMedicine,
  saveMedicineRecord,
} from '@/services/medicineApi'
import type { MedicineInfo, MedicineRecord } from '@/types/medicine'

const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024
const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024
const MAX_IMAGE_EDGE = 1800
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png']

type SpeechStatus = 'idle' | 'speaking' | 'paused'

const selectedImage = ref<File | null>(null)
const imagePreviewUrl = ref('')
const medicineInfo = ref<MedicineInfo | null>(null)
const isRecognizing = ref(false)
const isSaving = ref(false)
const isHistoryOpen = ref(false)
const isLoadingHistory = ref(false)
const records = ref<MedicineRecord[]>([])
const speechStatus = ref<SpeechStatus>('idle')
const speechRate = ref(0.85)
const notice = ref('')
const noticeType = ref<'info' | 'error' | 'success'>('info')
let noticeTimer = 0

const speechButtonText = computed(() => {
  if (speechStatus.value === 'speaking') return '暂停朗读'
  if (speechStatus.value === 'paused') return '继续朗读'
  return '开始朗读'
})

const speechIsSupported = computed(() => typeof window !== 'undefined' && 'speechSynthesis' in window)

/** 用统一提示代替浏览器默认弹窗，方便老人看清提示内容。 */
function showNotice(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
  notice.value = message
  noticeType.value = type
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 5000)
}

/** 检查网络状态，离线时不发起识别或记录请求。 */
function checkNetwork(): boolean {
  if (navigator.onLine) return true
  showNotice('现在没有网络，请检查网络连接后再试。', 'error')
  return false
}

/** 读取图片并检查是否损坏；解码失败会在上传前给出清楚提示。 */
async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    throw new Error('这张图片打不开，请重新拍照或选择一张清楚的图片。')
  }
}

/** 将图片最长边缩小到指定范围，并输出不超过目标大小的 JPEG 文件。 */
async function compressImage(file: File): Promise<File> {
  const bitmap = await decodeImage(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('图片处理失败，请重新选择图片。')
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let quality = 0.86
  let compressedBlob = await canvasToBlob(canvas, quality)
  while (compressedBlob.size > MAX_COMPRESSED_SIZE && quality > 0.4) {
    quality -= 0.12
    compressedBlob = await canvasToBlob(canvas, quality)
  }

  if (compressedBlob.size > MAX_COMPRESSED_SIZE) {
    throw new Error('图片还是太大，请重新拍一张近一些、清楚一些的照片。')
  }

  const safeName = file.name.replace(/\.[^.]+$/, '') || 'medicine-photo'
  return new File([compressedBlob], `${safeName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

/** 将 Canvas 转为图片文件数据，并把浏览器编码失败转换为可读错误。 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片处理失败，请重新选择图片。'))
    }, 'image/jpeg', quality)
  })
}

/** 图片选择失败、格式不符、原图过大或内容损坏时均在此处处理。 */
async function handleImageSelection(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    showNotice('没有选中图片，请再试一次。', 'error')
    return
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    showNotice('请选择 JPG 或 PNG 图片。', 'error')
    return
  }
  if (file.size > MAX_ORIGINAL_SIZE) {
    showNotice('图片超过 10MB，请压缩后再选择。', 'error')
    return
  }

  try {
    const compressedImage = await compressImage(file)
    if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value)
    selectedImage.value = compressedImage
    imagePreviewUrl.value = URL.createObjectURL(compressedImage)
    medicineInfo.value = null
    showNotice('图片已准备好，可以开始识别。', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片读取失败，请重新选择图片。'
    showNotice(message, 'error')
  }
}

/** 发起 OCR 识别并在请求过程中阻止重复点击。 */
async function startRecognition(): Promise<void> {
  if (isRecognizing.value || !selectedImage.value || !checkNetwork()) return

  isRecognizing.value = true
  medicineInfo.value = null
  stopSpeech()
  try {
    const response = await recognizeMedicine(selectedImage.value)
    if (!response.success) {
      showNotice(response.message || '没有识别成功，请换一张清楚的照片再试。', 'error')
      return
    }
    medicineInfo.value = response.data
    showNotice('识别完成，请仔细核对药品信息。', 'success')
  } catch {
    showNotice('识别服务暂时不可用，请检查网络后再试，或请家人协助。', 'error')
  } finally {
    isRecognizing.value = false
  }
}

/** 保存本次识别结果；每次记录包含名称、建议和识别时间。 */
async function saveCurrentRecord(): Promise<void> {
  if (!medicineInfo.value || isSaving.value || !checkNetwork()) return

  const record: MedicineRecord = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    medicineName: medicineInfo.value.name,
    advice: medicineInfo.value.advice,
    recognizedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }

  isSaving.value = true
  try {
    const response = await saveMedicineRecord(record)
    if (!response.success) {
      showNotice(response.message || '保存没有成功，请稍后再试。', 'error')
      return
    }
    showNotice('用药记录已保存。', 'success')
  } catch {
    showNotice('记录保存失败，请检查网络后再试。', 'error')
  } finally {
    isSaving.value = false
  }
}

/** 打开历史记录时再读取数据，避免页面加载时增加等待。 */
async function openHistory(): Promise<void> {
  isHistoryOpen.value = true
  if (!checkNetwork()) return

  isLoadingHistory.value = true
  try {
    records.value = await getMedicineRecords()
  } catch {
    showNotice('历史记录暂时无法读取，请检查网络后再试。', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

/** 语音播报识别结果和提醒，不替代医生或药师的指导。 */
function toggleSpeech(): void {
  if (!speechIsSupported.value) {
    showNotice('这台设备暂时不支持语音朗读。', 'error')
    return
  }
  if (!medicineInfo.value) {
    showNotice('请先识别药品，再开始朗读。')
    return
  }

  const speaker = window.speechSynthesis
  if (speechStatus.value === 'speaking') {
    speaker.pause()
    speechStatus.value = 'paused'
    return
  }
  if (speechStatus.value === 'paused') {
    speaker.resume()
    speechStatus.value = 'speaking'
    return
  }

  const speech = new SpeechSynthesisUtterance(
    `药品名称：${medicineInfo.value.name}。用药建议：${medicineInfo.value.advice}`,
  )
  speech.lang = 'zh-CN'
  speech.rate = speechRate.value
  speech.onend = resetSpeechStatus
  speech.onerror = resetSpeechStatus
  speechStatus.value = 'speaking'
  speaker.speak(speech)
}

/** 朗读结束或页面关闭时重置播报状态。 */
function resetSpeechStatus(): void {
  speechStatus.value = 'idle'
}

function stopSpeech(): void {
  if (speechIsSupported.value) window.speechSynthesis.cancel()
  resetSpeechStatus()
}

function handleOffline(): void {
  showNotice('网络已断开，请检查网络连接。', 'error')
}

function handleOnline(): void {
  showNotice('网络已恢复，可以继续使用。', 'success')
}

onMounted(() => {
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
})

onBeforeUnmount(() => {
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('online', handleOnline)
  window.clearTimeout(noticeTimer)
  stopSpeech()
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value)
})
</script>

<template>
  <div class="medicine-page">
    <header class="page-header">
      <div class="header-inner">
        <div class="brand" aria-label="安心用药">
          <span class="brand-mark" aria-hidden="true">药</span>
          <span>安心用药</span>
        </div>
        <button class="button button-outline history-button" type="button" @click="openHistory">
          查看历史用药记录
        </button>
      </div>
    </header>

    <main class="main-content">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">拍下药盒，查看药品信息</p>
        <h1 id="page-title">药品识别与用药提醒</h1>
        <p class="intro-copy">请把药盒正面拍清楚。识别结果仅供参考，用药请听医生或药师的安排。</p>
      </section>

      <div class="work-area">
        <section class="panel upload-panel" aria-labelledby="upload-title">
          <div class="section-heading">
            <span class="step-number" aria-hidden="true">1</span>
            <h2 id="upload-title">选择药盒照片</h2>
          </div>

          <div class="upload-zone" :class="{ 'has-image': imagePreviewUrl }">
            <img v-if="imagePreviewUrl" class="medicine-preview" :src="imagePreviewUrl" alt="已选择的药盒照片预览" />
            <div v-else class="upload-placeholder" aria-hidden="true">
              <span class="camera-icon">+</span>
              <span>在这里预览照片</span>
            </div>
          </div>

          <p class="helper-text">只支持 JPG、PNG 图片，原图不能超过 10MB。图片会自动压缩。</p>

          <label class="button button-secondary file-button">
            <span aria-hidden="true">＋</span> 拍照或选择照片
            <input
              class="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              capture="environment"
              aria-label="拍照或选择药盒照片"
              @change="handleImageSelection"
            />
          </label>

          <button
            class="button button-primary recognize-button"
            type="button"
            :disabled="!selectedImage || isRecognizing"
            @click="startRecognition"
          >
            <span v-if="isRecognizing" class="spinner" aria-hidden="true"></span>
            {{ isRecognizing ? '正在识别，请稍等' : '开始识别药品' }}
          </button>
        </section>

        <section class="panel result-panel" aria-labelledby="result-title" aria-live="polite">
          <div class="section-heading">
            <span class="step-number" aria-hidden="true">2</span>
            <h2 id="result-title">药品信息</h2>
          </div>

          <div v-if="medicineInfo" class="result-content">
            <div class="medicine-name-block">
              <span class="field-label">药品名称</span>
              <p class="medicine-name">{{ medicineInfo.name }}</p>
            </div>
            <div class="result-field">
              <h3>识别到的信息</h3>
              <p>{{ medicineInfo.description }}</p>
            </div>
            <div class="advice-box">
              <h3>用药提醒</h3>
              <p>{{ medicineInfo.advice }}</p>
            </div>

            <div class="result-actions">
              <button
                class="button button-secondary"
                type="button"
                :disabled="!speechIsSupported"
                @click="toggleSpeech"
              >
                {{ speechButtonText }}
              </button>
              <div class="rate-control" role="group" aria-label="语音播放速度">
                <span>语速</span>
                <button
                  class="rate-button"
                  :class="{ active: speechRate === 0.7 }"
                  type="button"
                  :aria-pressed="speechRate === 0.7"
                  @click="speechRate = 0.7"
                >慢速</button>
                <button
                  class="rate-button"
                  :class="{ active: speechRate === 0.85 }"
                  type="button"
                  :aria-pressed="speechRate === 0.85"
                  @click="speechRate = 0.85"
                >正常</button>
              </div>
              <button
                class="button button-outline save-button"
                type="button"
                :disabled="isSaving"
                @click="saveCurrentRecord"
              >
                {{ isSaving ? '正在保存' : '保存本次用药记录' }}
              </button>
            </div>
          </div>

          <div v-else class="empty-result">
            <div v-if="isRecognizing" class="recognition-loading" role="status">
              <span class="large-spinner" aria-hidden="true"></span>
              <p>正在读取药盒上的文字，请稍等。</p>
            </div>
            <template v-else>
              <span class="empty-mark" aria-hidden="true">?</span>
              <p>识别结果会显示在这里。</p>
              <p class="empty-subtext">请先选择药盒照片，再点“开始识别药品”。</p>
            </template>
          </div>
        </section>
      </div>

      <p class="safety-note">
        <strong>温馨提醒：</strong>机器识别可能有误。请核对药盒说明，并按医生或药师的指导用药。
      </p>
    </main>

    <Transition name="notice">
      <div v-if="notice" class="notice" :class="`notice-${noticeType}`" role="status" aria-live="assertive">
        <span>{{ notice }}</span>
        <button type="button" aria-label="关闭提示" @click="notice = ''">关闭</button>
      </div>
    </Transition>

    <div v-if="isHistoryOpen" class="modal-backdrop" @click.self="isHistoryOpen = false">
      <section
        class="history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div class="dialog-heading">
          <h2 id="history-title">历史用药记录</h2>
          <button class="close-button" type="button" aria-label="关闭历史记录" @click="isHistoryOpen = false">
            ×
          </button>
        </div>

        <div v-if="isLoadingHistory" class="history-empty" role="status">
          <span class="large-spinner" aria-hidden="true"></span>
          <p>正在读取记录，请稍等。</p>
        </div>
        <div v-else-if="records.length" class="record-list">
          <article v-for="record in records" :key="record.id" class="record-item">
            <div class="record-heading">
              <h3>{{ record.medicineName }}</h3>
              <time>{{ record.recognizedAt }}</time>
            </div>
            <p>{{ record.advice }}</p>
          </article>
        </div>
        <div v-else class="history-empty">
          <span class="empty-mark" aria-hidden="true">—</span>
          <p>还没有保存过用药记录。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.medicine-page {
  --ink: #203b37;
  --ink-soft: #526964;
  --green: #28675b;
  --green-dark: #1f5148;
  --green-pale: #e9f1ed;
  --paper: #f6f8f4;
  --line: #d2dfd8;
  --warning-bg: #fff4dc;
  --warning-ink: #684a16;
  min-height: 100vh;
  color: var(--ink);
  background: var(--paper);
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 18px;
  line-height: 1.65;
}

button,
input {
  font: inherit;
}

button {
  color: inherit;
}

.page-header {
  min-height: 78px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}

.header-inner,
.main-content {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
}

.header-inner {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--green-dark);
  font-size: 24px;
  font-weight: 700;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  background: var(--green);
  font-size: 22px;
  font-weight: 700;
}

.main-content {
  padding: 44px 0 56px;
}

.intro {
  max-width: 780px;
  margin-bottom: 30px;
}

.eyebrow {
  margin-bottom: 6px;
  color: var(--green);
  font-size: 18px;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: var(--ink);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.35;
}

.intro-copy {
  max-width: 720px;
  margin-top: 12px;
  color: var(--ink-soft);
  font-size: 19px;
}

.work-area {
  display: grid;
  grid-template-columns: minmax(310px, 0.88fr) minmax(420px, 1.12fr);
  align-items: stretch;
  gap: 24px;
}

.panel {
  min-width: 0;
  padding: 26px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.section-heading h2,
.dialog-heading h2 {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 700;
}

.step-number {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--green);
  font-size: 18px;
  font-weight: 700;
}

.upload-zone {
  min-height: 260px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 2px dashed #a9c1b6;
  border-radius: 8px;
  background: #f8fbf9;
}

.upload-zone.has-image {
  border-style: solid;
  background: #f1f5f2;
}

.medicine-preview {
  display: block;
  width: 100%;
  max-height: 360px;
  object-fit: contain;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
  font-size: 18px;
}

.camera-icon {
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--green);
  background: var(--green-pale);
  font-size: 40px;
  line-height: 1;
}

.helper-text {
  margin: 14px 0 16px;
  color: var(--ink-soft);
  font-size: 16px;
}

.button {
  min-height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.button:focus-visible,
.rate-button:focus-visible,
.close-button:focus-visible,
.notice button:focus-visible {
  outline: 3px solid #bd722c;
  outline-offset: 3px;
}

.button:disabled {
  color: #697772;
  background: #e4e9e6;
  border-color: #e4e9e6;
  cursor: not-allowed;
}

.button-primary {
  color: #fff;
  background: var(--green);
}

.button-primary:hover:not(:disabled) {
  background: var(--green-dark);
}

.button-secondary {
  color: var(--green-dark);
  background: var(--green-pale);
  border-color: #c6d9d0;
}

.button-secondary:hover:not(:disabled) {
  background: #dbeae3;
}

.button-outline {
  color: var(--green-dark);
  background: #fff;
  border-color: var(--green);
}

.button-outline:hover:not(:disabled) {
  background: #f0f6f2;
}

.file-button,
.recognize-button {
  width: 100%;
}

.file-button {
  cursor: pointer;
}

.file-button span {
  font-size: 26px;
  line-height: 1;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

.file-button:focus-within {
  outline: 3px solid #bd722c;
  outline-offset: 3px;
}

.recognize-button {
  min-height: 64px;
  margin-top: 14px;
  font-size: 20px;
}

.spinner,
.large-spinner {
  display: inline-block;
  border: 4px solid rgba(255, 255, 255, 0.45);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner {
  width: 22px;
  height: 22px;
}

.large-spinner {
  width: 42px;
  height: 42px;
  color: var(--green);
  border-color: #dbe8e1;
  border-top-color: var(--green);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-result,
.history-empty {
  min-height: 330px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-soft);
  text-align: center;
}

.recognition-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  font-size: 19px;
}

.empty-mark {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--green);
  background: var(--green-pale);
  font-size: 30px;
  font-weight: 700;
}

.empty-subtext {
  font-size: 16px;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-label {
  display: block;
  margin-bottom: 4px;
  color: var(--ink-soft);
  font-size: 16px;
}

.medicine-name {
  color: var(--green-dark);
  font-size: 27px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.result-field h3,
.advice-box h3 {
  margin: 0 0 6px;
  color: var(--ink);
  font-size: 19px;
  font-weight: 700;
}

.result-field p,
.advice-box p {
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.advice-box {
  padding: 16px 18px;
  border-left: 5px solid #b27c2b;
  border-radius: 4px;
  background: var(--warning-bg);
}

.advice-box h3,
.advice-box p {
  color: var(--warning-ink);
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}

.rate-control {
  min-height: 50px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  font-size: 16px;
}

.rate-button {
  min-width: 66px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.rate-button.active {
  color: #fff;
  background: var(--green);
  border-color: var(--green);
}

.save-button {
  flex: 1 1 210px;
}

.safety-note {
  margin-top: 24px;
  padding: 16px 20px;
  color: #624c21;
  background: #fff4dc;
  border: 1px solid #eddfbf;
  border-radius: 6px;
  font-size: 17px;
}

.safety-note strong {
  font-weight: 700;
}

.notice {
  position: fixed;
  z-index: 20;
  right: 24px;
  bottom: 24px;
  max-width: min(560px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: #fff;
  box-shadow: 0 8px 28px rgba(25, 55, 46, 0.14);
  font-size: 17px;
}

.notice-error {
  border-color: #dba89c;
  background: #fff5f2;
}

.notice-success {
  border-color: #a9cbbb;
  background: #f0f8f3;
}

.notice button {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 0;
  color: var(--green-dark);
  background: transparent;
  text-decoration: underline;
  cursor: pointer;
}

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.15s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}

.modal-backdrop {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(24, 43, 38, 0.52);
}

.history-dialog {
  width: min(720px, 100%);
  max-height: min(80vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.2);
}

.dialog-heading {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 22px;
  border-bottom: 1px solid var(--line);
}

.close-button {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 6px;
  color: var(--ink);
  background: var(--green-pale);
  font-size: 32px;
  line-height: 1;
  cursor: pointer;
}

.record-list {
  overflow-y: auto;
  padding: 4px 22px 22px;
}

.record-item {
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}

.record-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.record-heading h3 {
  color: var(--green-dark);
  font-size: 20px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.record-heading time {
  flex: 0 0 auto;
  color: var(--ink-soft);
  font-size: 15px;
}

.record-item p {
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .header-inner,
  .main-content {
    width: min(100% - 32px, 560px);
  }

  .header-inner {
    min-height: 72px;
  }

  .brand {
    font-size: 21px;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
  }

  .history-button {
    min-height: 48px;
    padding: 8px 12px;
    font-size: 15px;
  }

  .main-content {
    padding: 30px 0 40px;
  }

  h1 {
    font-size: 30px;
  }

  .intro-copy {
    font-size: 18px;
  }

  .work-area {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .panel {
    padding: 20px;
  }

  .upload-zone {
    min-height: 220px;
  }

  .empty-result {
    min-height: 240px;
  }

  .result-actions {
    align-items: stretch;
  }

  .result-actions > .button {
    flex: 1 1 100%;
  }

  .rate-control {
    justify-content: center;
    flex: 1 1 100%;
  }

  .record-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>