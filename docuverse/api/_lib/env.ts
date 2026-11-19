/**
 * Server-only env (Vercel Environment Variables / local process.env).
 * Never expose these via VITE_*.
 *
 * The default upstream and chat/embedding model IDs are fixed. Provider
 * credentials come from server environment variables.
 */

declare const process: { env: Record<string, string | undefined> }

/** Fixed provider endpoint and model IDs. */
const LOCKED_UPSTREAM = {
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  chatModel: 'deepseek-ai/DeepSeek-V4-Flash',
  embedModel: 'Qwen/Qwen3-VL-Embedding-8B',
  ocrModel: 'glm-ocr',
} as const

export function serverEnv(name: string): string {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function zhipuApiKey(): string {
  return serverEnv('ZHIPU_API_KEY')
}

export function zhipuOcrModel(): string {
  return serverEnv('OCR_MODEL') || LOCKED_UPSTREAM.ocrModel
}

/** SiliconFlow upstream for chat and embeddings. */
export function llmUpstream(): {
  baseUrl: string
  apiKey: string
  chatModel: string
  embedModel: string
} {
  return {
    baseUrl: LOCKED_UPSTREAM.llmBaseUrl,
    apiKey: serverEnv('LLM_API_KEY'),
    chatModel: LOCKED_UPSTREAM.chatModel,
    embedModel: LOCKED_UPSTREAM.embedModel,
  }
}

/** Shared gate for public demo. Empty = open (dev only; set on Vercel). */
export function demoAccessToken(): string {
  return serverEnv('DEMO_ACCESS_TOKEN')
}
