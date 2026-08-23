/**
 * Server-only env (Vercel Environment Variables / local process.env).
 * Never expose these via VITE_*.
 *
 * Temporary lock: SiliconFlow chat + embed credentials/models are baked in
 * and not overridable by process.env or the browser.
 */

declare const process: { env: Record<string, string | undefined> }

/** Locked stack — temporarily fixed; do not swap via UI / env. */
const LOCKED_DEMO = {
  llmApiKey: 'sk-qyrpejglpxmjfqxsbcmyjxbgbcfrknfbbwnquycbnhjufaff',
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  chatModel: 'deepseek-ai/DeepSeek-V4-Flash',
  embedModel: 'Qwen/Qwen3-VL-Embedding-8B',
  zhipuApiKey: 'ee855f9fa6344a728c5fdcd9b0c4d79d.Gu5bzsn8XtTgLzmM',
  ocrModel: 'glm-ocr',
} as const

export function serverEnv(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function zhipuApiKey(): string {
  return serverEnv('ZHIPU_API_KEY') || LOCKED_DEMO.zhipuApiKey
}

export function zhipuOcrModel(): string {
  return serverEnv('OCR_MODEL') || LOCKED_DEMO.ocrModel
}

/** SiliconFlow upstream for chat + embeddings (models + key locked). */
export function llmUpstream(): {
  baseUrl: string
  apiKey: string
  chatModel: string
  embedModel: string
} {
  return {
    baseUrl: LOCKED_DEMO.llmBaseUrl,
    apiKey: LOCKED_DEMO.llmApiKey,
    chatModel: LOCKED_DEMO.chatModel,
    embedModel: LOCKED_DEMO.embedModel,
  }
}

/** Shared gate for public demo. Empty = open (dev only; set on Vercel). */
export function demoAccessToken(): string {
  return serverEnv('DEMO_ACCESS_TOKEN')
}
