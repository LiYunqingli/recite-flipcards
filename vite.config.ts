import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 相对路径：Capacitor Android 的 WebView 以 capacitor://localhost 提供资源，
  // 使用相对 base 可避免绝对路径 '/assets/...' 加载失败。
  base: './',
  // 手机 WebView（如 Huawei Chromium 83）不支持 ES2021+ 语法（??=、||= 等），
  // 降级到 es2020 确保兼容性。
  build: {
    target: 'es2020',
  },
})
