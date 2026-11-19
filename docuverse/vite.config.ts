import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { llmUpstream } from './api/_lib/env.js'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { pdfJsWasmPlugin } from './server/pdfJsWasmPlugin.js'
import { viteProtocolApiPlugin } from './server/viteProtocolApiPlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load parent workspace .env as well as local
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
  const localEnv = loadEnv(mode, import.meta.dirname, '')
  const zhipuKey = (localEnv.ZHIPU_API_KEY || rootEnv.ZHIPU_API_KEY || '').trim()
  const llmKey = (localEnv.LLM_API_KEY || rootEnv.LLM_API_KEY || '').trim()
  const proxy: Record<string, ProxyOptions> = {}

  if (zhipuKey) {
    proxy['/api/zhipu'] = {
      target: 'https://open.bigmodel.cn',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/zhipu/, '/api/paas/v4'),
      configure: (server) => {
        server.on('proxyReq', (request) => {
          request.setHeader('Authorization', `Bearer ${zhipuKey}`)
        })
      },
    }
  }

  if (llmKey) {
    proxy['/api/llm'] = {
      target: llmUpstream().baseUrl,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/llm/, ''),
      configure: (server) => {
        server.on('proxyReq', (request) => {
          request.setHeader('Authorization', `Bearer ${llmKey}`)
        })
      },
    }
  }

  return {
    plugins: [react(), pdfJsWasmPlugin(import.meta.dirname), viteProtocolApiPlugin(import.meta.dirname, mode)],
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
      proxy,
    },
  }
})
