# 安心药助手 · 微信小程序端（uni-app / Vue3 / TypeScript）

本工程是《智慧养老安全用药辅助平台》申报书承诺的**微信小程序端**源码，与 H5/App 端（`frontend/h5-app`）共用同一套 SpringBoot 后端 + FastAPI AI 服务，功能对齐：登录注册、首页、拍照识药、问药助手、今日用药打卡、用药计划、家庭协同、我的。

## 如何编译运行（需要 HBuilderX）

uni-app 小程序端需要 **HBuilderX**（DCloud 官方 IDE）或 `uni-app CLI + 微信开发者工具` 编译，本仓库交付的是可直接打开的源码工程：

1. 安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（正式版即可）与 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. HBuilderX → 文件 → 打开目录 → 选择本目录（`frontend/uniapp-miniprogram`）。
3. 修改 `src/utils/config.ts` 中的 `BASE_URL` 为你的后端地址（本机联调可用 `http://127.0.0.1:8080`，需在微信开发者工具中勾选"不校验合法域名"）。
4. 如需正式发布：在 `src/manifest.json` 的 `mp-weixin.appid` 填入你自己的小程序 AppID。
5. HBuilderX → 发行 → 小程序-微信，编译产物会自动唤起微信开发者工具预览。

## 目录结构

```
src/
├── main.ts              # Vue3 createSSRApp 入口
├── App.vue              # 全局生命周期与样式
├── pages.json           # 页面路由 + tabBar（适老化大字配置）
├── manifest.json        # 小程序配置（appid 占位）
├── utils/
│   ├── config.ts        # 后端地址等配置
│   ├── request.ts       # uni.request 封装（JWT、统一错误、401跳登录）
│   └── tts.ts           # 提示音/振动反馈（小程序无 Web Speech API，用振动+大字幕替代朗读）
├── store/user.ts        # 登录态（uni.storage 持久化）
└── pages/               # 8个页面：login/index/recognize/qa/today/plans/family/profile
```

## 与 H5 端的差异（如实说明）

- 小程序环境**没有** `speechSynthesis` 语音朗读 API：本端以「超大字号 + 高对比 + 振动反馈」落实适老化；如需语音，可在小程序中接入微信同声传译插件（`wx.getRealtimeLogManager` 生态），代码中已留好接口位。
- 拍照识药使用 `uni.chooseImage`（可拍照/相册），压缩参数与 H5 端一致（长边1280、<1MB）。
- 演示账号与 H5 端相同（老人 13900001111 / 家属 13900002222，密码 123456；管理员请用管理后台）。
