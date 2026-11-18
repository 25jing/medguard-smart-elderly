<template>
  <view class="page">
    <scroll-view scroll-y class="chat" :scroll-into-view="scrollTo" scroll-with-animation>
      <view class="notice">🛡️ 回答均摘自药品说明书与权威指南，标注来源；没有依据时会如实拒答</view>

      <view v-for="(m, i) in msgs" :key="i" :id="'m' + i" :class="['row', m.role]">
        <view class="bubble" :class="m.role">
          <view class="text">{{ m.text }}</view>
          <view v-if="m.sources && m.sources.length" class="srcs">
            <view class="srcs-title">📚 知识库引用 {{ m.sources.length }} 条</view>
            <view class="src" v-for="s in m.sources" :key="s.index">
              <view class="src-t">[来源{{ s.index }}] {{ s.title }}<text v-if="s.section"> · {{ s.section }}</text><text class="src-score" v-if="s.score != null">{{ s.score }}</text></view>
              <view class="src-x" v-if="s.text">{{ s.text.slice(0, 72) }}{{ s.text.length > 72 ? '…' : '' }}</view>
            </view>
          </view>
          <view v-if="m.badge" class="badge">{{ m.badge }}</view>
        </view>
      </view>
      <view v-if="busy" id="mbusy" class="row ai"><view class="bubble ai typing">正在查阅药品知识库…</view></view>
    </scroll-view>

    <view class="chips">
      <view class="chip" v-for="q in QUICK" :key="q" @click="ask(q)">{{ q }}</view>
    </view>
    <view class="input-bar">
      <input v-model="input" class="input" placeholder="如：阿司匹林饭前还是饭后吃" confirm-type="send" @confirm="send" />
      <button class="send" :disabled="busy" @click="send">发送</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { request } from '../../utils/request'

const QUICK = ['阿司匹林肠溶片怎么吃', '二甲双胍的副作用', '降压药忘吃了怎么办', '华法林和阿司匹林能一起吃吗']
const MODE_CN: Record<string, string> = { llm: 'LLM受控生成', extractive: '知识库摘编', refuse: '无依据拒答', guard: '超范围拒答', booting: '知识库启动中' }

const msgs = ref<any[]>([{ role: 'ai', text: '您好！我是问药助手。药品怎么吃、有什么禁忌，都可以问我；我只回答有依据的内容。' }])
const input = ref('')
const busy = ref(false)
const scrollTo = ref('')

function send() {
  const q = input.value.trim()
  if (!q) return
  input.value = ''
  ask(q)
}

async function ask(q: string) {
  msgs.value.push({ role: 'me', text: q })
  busy.value = true
  scrollToBottom()
  try {
    const d: any = await request('/api/qa', { method: 'POST', body: { question: q } })
    msgs.value.push({
      role: 'ai',
      text: d.answer,
      sources: d.refused ? [] : d.sources,
      badge: MODE_CN[d.mode] || d.mode
    })
  } catch (e: any) {
    msgs.value.push({ role: 'ai', text: '出错了：' + e.message })
  } finally {
    busy.value = false
    scrollToBottom()
  }
}

function scrollToBottom() {
  nextTick(() => { scrollTo.value = busy.value ? 'mbusy' : 'm' + (msgs.value.length - 1) })
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #f4f7f8; }
.chat { flex: 1; padding: 20rpx 24rpx; overflow: hidden; }
.notice { background: linear-gradient(135deg, #f0fdfa, #ccfbf1); border: 1rpx solid rgba(20,184,166,0.3); border-radius: 24rpx; padding: 16rpx 22rpx; font-size: 24rpx; color: #115e59; font-weight: 600; margin-bottom: 20rpx; }
.row { display: flex; margin-bottom: 20rpx; animation: mgRiseQ 0.35s ease-out backwards; }
.row.me { justify-content: flex-end; }
@keyframes mgRiseQ { from { opacity: 0; transform: translateY(16rpx); } to { opacity: 1; transform: none; } }
.bubble { max-width: 82%; border-radius: 28rpx; padding: 22rpx 26rpx; font-size: 32rpx; line-height: 1.65; }
.bubble.ai { background: rgba(255,255,255,0.97); border: 1rpx solid rgba(255,255,255,0.85); border-top-left-radius: 8rpx; box-shadow: 0 2rpx 8rpx rgba(15,23,42,0.04), 0 8rpx 24rpx rgba(15,23,42,0.07); }
.bubble.me { background: linear-gradient(135deg, #0f766e, #14b8a6); color: #fff; border-top-right-radius: 8rpx; font-weight: 600; box-shadow: 0 10rpx 26rpx rgba(13,148,136,0.28); }
.bubble.typing { color: #94a3b8; }
.srcs { margin-top: 14rpx; border-top: 1rpx dashed #e2e8f0; padding-top: 10rpx; }
.srcs-title { font-size: 22rpx; color: #0f766e; font-weight: 800; margin-bottom: 6rpx; }
.src { font-size: 22rpx; color: #0d9488; font-weight: 600; margin-top: 8rpx; }
.src-t { display: flex; align-items: center; flex-wrap: wrap; }
.src-score { margin-left: 10rpx; font-size: 18rpx; font-weight: 800; color: #0f766e; background: rgba(20,184,166,0.12); border: 1rpx solid rgba(13,148,136,0.3); border-radius: 999rpx; padding: 0 12rpx; }
.src-x { font-size: 20rpx; color: #64748b; font-weight: 400; line-height: 1.55; margin-top: 4rpx; background: rgba(240,253,250,0.9); border-left: 4rpx solid rgba(20,184,166,0.5); border-radius: 8rpx; padding: 8rpx 12rpx; }
.badge { font-size: 20rpx; color: #94a3b8; margin-top: 8rpx; }
.chips { display: flex; gap: 12rpx; padding: 12rpx 24rpx; overflow-x: auto; white-space: nowrap; }
.chip { flex: none; background: rgba(255,255,255,0.95); border: 2rpx solid rgba(13,148,136,0.35); color: #115e59; font-weight: 600; border-radius: 999rpx; padding: 12rpx 26rpx; font-size: 26rpx; box-shadow: 0 4rpx 14rpx rgba(15,23,42,0.05); }
.input-bar { display: flex; gap: 12rpx; padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); background: rgba(255,255,255,0.96); border-top: 1rpx solid rgba(15,23,42,0.06); box-shadow: 0 -8rpx 28rpx rgba(15,23,42,0.06); }
.input { flex: 1; background: rgba(255,255,255,0.98); border: 2rpx solid #e2e8f0; border-radius: 44rpx; padding: 18rpx 30rpx; font-size: 32rpx; }
.send { flex: none; background: linear-gradient(135deg, #0f766e, #14b8a6); color: #fff; border: none; font-weight: 800; letter-spacing: 2rpx; border-radius: 44rpx; font-size: 30rpx; padding: 0 44rpx; line-height: 76rpx; margin: 0; box-shadow: 0 10rpx 26rpx rgba(13,148,136,0.32), inset 0 2rpx 0 rgba(255,255,255,0.3); }
.send::after { border: none; }
.send[disabled] { opacity: 0.5; }
</style>
