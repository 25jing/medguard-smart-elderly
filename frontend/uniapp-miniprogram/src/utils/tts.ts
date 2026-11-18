/**
 * 适老化反馈：小程序无 Web Speech API，用振动+Toast 大字幕替代语音朗读。
 * 如需真语音，可接入微信同声传译插件（WechatSI），此处留好接口位。
 */
export function feedback(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok') {
  if (kind === 'ok') uni.vibrateShort({ fail: () => {} })
  if (kind === 'warn') { uni.vibrateShort({ fail: () => {} }); setTimeout(() => uni.vibrateShort({ fail: () => {} }), 220) } // 双段提醒
  if (kind === 'err') uni.vibrateLong({ fail: () => {} })
  uni.showToast({ title: msg, icon: kind === 'ok' ? 'success' : kind === 'err' ? 'error' : 'none', duration: 2600 })
}

/** 预留：接入 WechatSI 插件后的语音播报 */
export function speak(text: string) {
  // const plugin = requirePlugin('WechatSI')
  // plugin.textToSpeech({ lang: 'zh_CN', content: text, success(res){ uni.createInnerAudioContext().src = res.filename; ... } })
  console.log('[TTS预留]', text)
}
