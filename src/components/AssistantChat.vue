<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { askQuestion, type QaRole, type QaSource } from '@/services/qaApi'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: QaSource[]
}

const props = defineProps<{ role: QaRole }>()

const WELCOME: Record<QaRole, string> = {
  elder: '您好！可以问我药品或养老方面的问题，比如"降压药是干什么的"或"漏服药了怎么办"。',
  guardian: '您好！可以问我用药和照护方面的问题，比如"怎么帮助老人按时服药"或"老人如何防跌倒"。',
}

const QUICK_QUESTIONS: Record<QaRole, string[]> = {
  elder: ['降压药是干什么的？', '漏服药了怎么办？', '老人怎么防跌倒？', '饮食要注意什么？'],
  guardian: ['怎么帮老人按时服药？', '漏服药物怎么处理？', '老人睡不好怎么办？', '感冒药能一起吃吗？'],
}

const messages = ref<ChatMessage[]>([{ role: 'assistant', content: WELCOME[props.role] }])
const question = ref('')
const busy = ref(false)
const listElement = useTemplateRef<HTMLElement>('messageList')

async function scrollToBottom(): Promise<void> {
  await nextTick()
  if (listElement.value) listElement.value.scrollTop = listElement.value.scrollHeight
}

/** 发送问题；失败时在对话里给出可读提示，不打断老人操作。 */
async function send(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || busy.value) return
  messages.value.push({ role: 'user', content: trimmed })
  question.value = ''
  busy.value = true
  await scrollToBottom()
  try {
    const result = await askQuestion(trimmed, props.role)
    messages.value.push({ role: 'assistant', content: result.answer, sources: result.sources })
  } catch {
    messages.value.push({ role: 'assistant', content: '抱歉，问答服务暂时不可用，请稍后再试；情况紧急请直接就医或拨打 120。' })
  } finally {
    busy.value = false
    await scrollToBottom()
  }
}

function submit(): void {
  void send(question.value)
}

onBeforeUnmount(() => {
  messages.value = []
})
</script>

<template>
  <div class="assistant-chat">
    <p class="assistant-disclaimer">
      <strong>智能问答</strong>回答由知识库检索生成，仅供参考，不能替代医生或药师的意见。
    </p>

    <div ref="messageList" class="message-list" role="log" aria-live="polite" aria-label="问答对话记录">
      <article v-for="(message, index) in messages" :key="index" class="message-row" :class="message.role">
        <div class="message-bubble">
          <p class="message-text">{{ message.content }}</p>
          <div v-if="message.sources?.length" class="message-sources">
            <span class="sources-label">📎 参考来源</span>
            <span v-for="source in message.sources" :key="source.title" class="source-chip" :title="source.snippet">{{ source.title }}</span>
          </div>
        </div>
      </article>
      <div v-if="busy" class="message-row assistant">
        <div class="message-bubble message-busy">
          <span class="busy-spinner" aria-hidden="true"></span>
          <span>正在查阅资料，请稍等…</span>
        </div>
      </div>
    </div>

    <div class="quick-row" role="group" aria-label="常见问题">
      <button v-for="item in QUICK_QUESTIONS[props.role]" :key="item" class="quick-chip" type="button" :disabled="busy" @click="send(item)">{{ item }}</button>
    </div>

    <form class="input-row" @submit.prevent="submit">
      <label class="visually-hidden" for="assistant-input">输入您的问题</label>
      <input id="assistant-input" v-model="question" class="assistant-input" type="text" placeholder="请输入您的问题" autocomplete="off" :disabled="busy" />
      <button class="assistant-send" type="submit" :disabled="busy || !question.trim()">{{ busy ? '回答中' : '发送' }}</button>
    </form>
  </div>
</template>

<style scoped>
.assistant-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assistant-disclaimer {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid #eddfbf;
  border-radius: 6px;
  background: #fff4dc;
  color: #624c21;
  font-size: 15px;
}

.message-list {
  height: 380px;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  border: 1px solid var(--line, #d8e2dd);
  border-radius: 8px;
  background: #fff;
}

.message-row {
  display: flex;
}

.message-row.user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 86%;
  padding: 12px 16px;
  border-radius: 12px;
}

.message-row.assistant .message-bubble {
  border: 1px solid var(--line, #d8e2dd);
  background: var(--paper, #f4f7f4);
}

.message-row.user .message-bubble {
  color: #fff;
  background: var(--green, #27786f);
}

.message-text {
  margin: 0;
  color: inherit;
  font-size: 17px;
  line-height: 1.7;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.message-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--line, #d8e2dd);
}

.sources-label {
  color: var(--ink-soft, #526963);
  font-size: 14px;
}

.source-chip {
  padding: 3px 10px;
  border: 1px solid var(--line, #d8e2dd);
  border-radius: 999px;
  background: #fff;
  color: var(--green-dark, #1e5c55);
  font-size: 14px;
}

.message-busy {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-soft, #526963);
  font-size: 16px;
}

.busy-spinner {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border: 3px solid var(--line, #d8e2dd);
  border-top-color: var(--green, #27786f);
  border-radius: 50%;
  animation: assistant-spin 0.8s linear infinite;
}

@keyframes assistant-spin {
  to { transform: rotate(360deg); }
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  min-height: 40px;
  padding: 6px 14px;
  border: 1px solid var(--line, #d8e2dd);
  border-radius: 999px;
  background: var(--green-pale, #e6f0eb);
  color: var(--green-dark, #1e5c55);
  font-size: 15px;
  cursor: pointer;
}

.quick-chip:hover:not(:disabled) {
  background: #d8e9e1;
}

.quick-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.input-row {
  display: flex;
  gap: 10px;
}

.assistant-input {
  flex: 1;
  min-height: 52px;
  padding: 8px 16px;
  border: 2px solid var(--line, #d8e2dd);
  border-radius: 8px;
  font-size: 18px;
}

.assistant-input:focus-visible {
  outline: 3px solid #bd722c;
  outline-offset: 2px;
}

.assistant-send {
  min-width: 108px;
  min-height: 52px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--green, #27786f);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.assistant-send:hover:not(:disabled) {
  background: var(--green-dark, #1e5c55);
}

.assistant-send:disabled,
.assistant-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

@media (max-width: 760px) {
  .message-list {
    height: 320px;
  }

  .message-bubble {
    max-width: 92%;
  }

  .input-row {
    flex-direction: column;
  }

  .assistant-send {
    width: 100%;
  }
}
</style>
