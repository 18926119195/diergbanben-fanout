/**
 * POST /api/llm/embeddings → SiliconFlow (or LLM_BASE_URL)
 */
import { llmUpstream } from '../_lib/env.js'
import { proxyUpstream } from '../_lib/upstreamProxy.js'

export const config = { runtime: 'edge', maxDuration: 60 }

export default async function handler(req: Request): Promise<Response> {
  const { baseUrl, apiKey, embedModel } = llmUpstream()
  return proxyUpstream(req, {
    stripPrefix: '/api/llm',
    baseUrl,
    apiKey,
    forceModel: embedModel,
    missingKeyMessage:
      'LLM_API_KEY missing on server (set in Vercel Environment Variables)',
  })
}
