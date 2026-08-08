import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.recite.flipcards',
  appName: '翻牌背题',
  webDir: 'dist',
  // 必须显式设为 'http'。Capacitor 5+ 默认是 'https'，而 Vite 构建出的入口
  // script 带 crossorigin 属性，在 https://localhost 本地服务器方案下会触发
  // CORS 校验导致模块脚本被拦截、白屏。用 http 方案时 crossorigin 为 no-op。
  server: {
    androidScheme: 'http',
  },
}

export default config
