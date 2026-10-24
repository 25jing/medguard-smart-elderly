import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // Element Plus 按需引入：模板组件与 ElMessage 等 API 只打包实际用到的部分及其样式。
    // 类型声明输出到 src/ 下，tsconfig 的 include（src/**/*）可以直接覆盖到。
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // 大型依赖拆成独立 chunk：业务代码更新时这些库命中浏览器缓存，不用重新下载。
        // vue 优先级必须最高：分组默认会连带捕获依赖，若 element-plus 先匹配，
        // 会把 Vue 运行时一起吞进去，导致登录页也要加载 element-plus。
        codeSplitting: {
          groups: [
            { name: 'vue-vendor', test: /node_modules[\\/](vue|vue-router|@vue)[\\/]/, priority: 10 },
            { name: 'echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 9 },
            { name: 'element-plus', test: /node_modules[\\/](element-plus|@element-plus)[\\/]/, priority: 8 },
          ],
        },
      },
    },
  },
})
