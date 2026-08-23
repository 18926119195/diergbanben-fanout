import { defineConfig, loadEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { pdfJsWasmPlugin } from './server/pdfJsWasmPlugin.js'
import { viteProtocolApiPlugin } from './server/viteProtocolApiPlugin.js'

/** Match api/_lib/env.ts locked SiliconFlow stack (temporarily fixed). */
const LOCKED_DEMO = {
  zhipuApiKey: 'ee855f9fa6344a728c5fdcd9b0c4d79d.Gu5bzsn8XtTgLzmM',
  llmApiKey: 'sk-qyrpejglpxmjfqxsbcmyjxbgbcfrknfbbwnquycbnhjufaff',
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  chatModel: 'deepseek-ai/DeepSeek-V4-Flash',
  embedModel: 'Qwen/Qwen3-VL-Embedding-8B',
} as const

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load parent workspace .env as well as local
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, __dirname, '')
  const zhipuKey =
    localEnv.ZHIPU_API_KEY ||
    rootEnv.ZHIPU_API_KEY ||
    process.env.ZHIPU_API_KEY ||
    LOCKED_DEMO.zhipuApiKey
  // Chat / embed: always locked demo key + SiliconFlow (ignore .env overrides)
  const llmKey = LOCKED_DEMO.llmApiKey
  const llmBase = LOCKED_DEMO.llmBaseUrl

  const config: UserConfig = {
    plugins: [react(), pdfJsWasmPlugin(__dirname), viteProtocolApiPlugin(__dirname, mode)],
    // Production: no sourcemaps → Sources 看不到 intrinsicKey.ts 等源文件名
    build: {
      sourcemap: false,
      minify: 'oxc',
      target: 'es2022',
      cssMinify: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/zhipu': {
          target: 'https://open.bigmodel.cn',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/zhipu/, '/api/paas/v4'),
          configure: (proxy) => {
            // Never forward browser demo-token as upstream auth.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${zhipuKey}`)
            })
          },
        },
        '/api/llm': {
          target: llmBase,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/llm/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${llmKey}`)
            })
          },
        },
      },
    },
  }
  return config
})
