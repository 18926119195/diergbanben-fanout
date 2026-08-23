import { chatCompletion, tryParseJsonObject } from './llmChat.js'

export type AbBlockBody = {
  key: string
  text: string
  page?: number
  shortHandle?: string
}

export type InferOpsBody = {
  question: string
  blocks: AbBlockBody[]
  unitLabel?: string
}

export type InferOpsResult = {
  ok: boolean
  usedMock: boolean
  conclusion: string
  path: string
  usedKeys: string[]
  ops: unknown[]
  rawText?: string
  error?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function parseInferOpsBody(raw: unknown): InferOpsBody | string {
  if (!isRecord(raw)) return 'body must be object'
  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  if (!question) return 'question required'
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    return 'blocks[] required'
  }
  const blocks: AbBlockBody[] = []
  for (const item of raw.blocks) {
    if (!isRecord(item)) continue
    const key = typeof item.key === 'string' ? item.key.trim() : ''
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!key || !text) continue
    blocks.push({
      key,
      text,
      page: typeof item.page === 'number' ? item.page : undefined,
      shortHandle:
        typeof item.shortHandle === 'string' ? item.shortHandle : undefined,
    })
  }
  if (blocks.length === 0) return 'blocks need key+text'
  return {
    question,
    blocks,
    unitLabel:
      typeof raw.unitLabel === 'string' ? raw.unitLabel.trim() : undefined,
  }
}

const MAX_BLOCK_CHARS = 6000

function clipBlockText(text: string): string {
  if (text.length <= MAX_BLOCK_CHARS) return text
  return `${text.slice(0, MAX_BLOCK_CHARS)}\n…[袋内 text 已截断至 ${MAX_BLOCK_CHARS} 字，identity 仍完整]`
}

function buildBlocksPrompt(blocks: AbBlockBody[]): string {
  return blocks
    .map((b, i) => {
      const handle = b.shortHandle || `块${i + 1}`
      const page = typeof b.page === 'number' ? ` p${b.page}` : ''
      return `### ${handle}${page}\nkey: ${b.key}\ntext:\n${clipBlockText(b.text)}`
    })
    .join('\n\n')
}

export function buildInferOpsPrompt(input: InferOpsBody): string {
  const keys = input.blocks.map((b) => b.key)
  const n = input.blocks.length
  return [
    '你是教材分析助手。封闭木块袋（AllowedKeys）如下；只依据袋内 text。',
    '任务：详细写出你如何处理这些木块、逐步推出结论；并把每一步翻译成身份坐标互动。',
    '越细越好：每步都要有中间主张 claim，说明「由这些木块（相对上一步）多推出了什么」。',
    input.unitLabel ? `单元标签：${input.unitLabel}` : '',
    '',
    '【AllowedKeys】',
    keys.join('\n'),
    '',
    '【木块】',
    buildBlocksPrompt(input.blocks),
    '',
    `【用户问题】${input.question}`,
    '',
    '只输出一个 JSON（不要围栏外文字）：',
    '- conclusion: string 最终结论',
    '- path: string 人话版逐步推导（须详细：先处理哪块、得出什么、如何接到下一步）',
    '- usedKeys: string[] AllowedKeys 完整串',
    '- ops: 有序步骤；建议至少 ' +
      String(Math.max(4, n + 2)) +
      ' 步；每项：',
    '  { "op":"attend|infer|combine|contrast|conclude|defer",',
    '    "keys":string[], "note":string（如何处理木块）,',
    '    "claim":string（本步中间主张，必填且具体）}',
    '',
    'op 含义：attend=读出事实；infer=由 keys 推出新主张（写清为何）；combine=并置支撑；contrast=对照张力；conclude=接到结；defer=推不动。',
    '禁止：只 attend 完全部块就 conclude；禁止空 claim；禁止发明/截断 key；勿编造袋外事实。',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function runInferWithOps(
  input: InferOpsBody,
): Promise<InferOpsResult> {
  const llm = await chatCompletion({
    system:
      '你只输出合法 JSON。详细逐步推导：每步 claim 写清由哪些木块推出什么。只用 AllowedKeys 完整串。',
    user: buildInferOpsPrompt(input),
    temperature: 0.25,
    maxTokens: 8192,
    timeoutMs: 12 * 60 * 1000,
  })
  if (!llm.ok) {
    return {
      ok: false,
      usedMock: false,
      conclusion: '',
      path: '',
      usedKeys: [],
      ops: [],
      error: llm.error,
    }
  }
  if (llm.usedMock) {
    const keys = input.blocks.map((b) => b.key)
    return {
      ok: true,
      usedMock: true,
      conclusion: `【Mock 测试一】针对「${input.question}」`,
      path: '1. 锁定木块\n2. 组合对照\n3. 给出结论（mock）',
      usedKeys: keys,
      ops: [
        {
          op: 'attend',
          keys: [keys[0]],
          note: '读取首块要点（mock）',
          claim: '首块给出可核对的起始表述（mock）',
        },
        {
          op: 'infer',
          keys: [keys[0]],
          note: '由首块推出中间主张（mock）',
          claim: '由首块可推出与问题相关的中间命题（mock）',
        },
        {
          op: 'combine',
          keys,
          note: '并置全袋支撑（mock）',
          claim: '多块共同支撑同一中间命题（mock）',
        },
        {
          op: 'conclude',
          keys,
          note: '接到最终结论（mock）',
          claim: `【Mock 测试一】针对「${input.question}」`,
        },
      ],
      rawText: llm.content,
    }
  }

  const obj = tryParseJsonObject(llm.content)
  if (!obj) {
    return {
      ok: false,
      usedMock: false,
      conclusion: '',
      path: '',
      usedKeys: [],
      ops: [],
      rawText: llm.content,
      error: '模型未返回可解析 JSON',
    }
  }

  const conclusion =
    typeof obj.conclusion === 'string' ? obj.conclusion.trim() : ''
  const path = typeof obj.path === 'string' ? obj.path.trim() : ''
  const usedKeys = Array.isArray(obj.usedKeys)
    ? obj.usedKeys.filter((k): k is string => typeof k === 'string')
    : []
  const ops = Array.isArray(obj.ops) ? obj.ops : []

  return {
    ok: Boolean(conclusion),
    usedMock: false,
    conclusion,
    path,
    usedKeys,
    ops,
    rawText: llm.content,
    error: conclusion ? undefined : '缺少 conclusion',
  }
}
