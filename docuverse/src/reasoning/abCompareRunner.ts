import { demoAuthHeaders } from './demoAuth'
import type { AbBlock, AbCompareInput, FormalPathV1 } from './formalPath'
import { validateFormalPath, type ValidateRejectCode } from './formalValidator'
import { shortHandle } from './ocrSlot'
import type { BookIndex } from './pipelineA'
import type { FanoutInferUnit } from './fanoutCompose'
import { unitMemberKeysOf } from './letterDesk'

export type AbArmId = 'A' | 'B'

export type AbLogEvent = {
  arm: AbArmId | 'shared'
  at: number
  phase: string
  message: string
}

export type AbArmResult = {
  arm: AbArmId
  label: string
  ok: boolean
  usedMock: boolean
  conclusion: string
  pathText: string
  formal: FormalPathV1 | null
  validateOk: boolean
  validateCodes: ValidateRejectCode[]
  validateMessage: string
  elapsedMs: number
  phases: AbLogEvent[]
  error?: string
  rawGateway?: unknown
  rawFormalize?: unknown
}

export type AbCompareReport = {
  input: AbCompareInput
  startedAt: number
  finishedAt: number
  armA: AbArmResult
  armB: AbArmResult
}

export type AbProgressHandler = (ev: AbLogEvent) => void

function now(): number {
  return Date.now()
}

function push(
  list: AbLogEvent[],
  onProgress: AbProgressHandler | undefined,
  arm: AbLogEvent['arm'],
  phase: string,
  message: string,
): void {
  const ev: AbLogEvent = { arm, at: now(), phase, message }
  list.push(ev)
  onProgress?.(ev)
}

const AB_FETCH_TIMEOUT_MS = 15 * 60 * 1000
const AB_FETCH_RETRIES = 2

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function postJsonOnce<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...demoAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    })
    const data = (await res.json().catch(() => null)) as T | null
    if (!res.ok) {
      const err =
        data &&
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `HTTP ${res.status}`
      return { ok: false, status: res.status, data, error: err }
    }
    return { ok: true, status: res.status, data }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    const msg = e instanceof Error ? e.message : String(e)
    if (name === 'AbortError') {
      return {
        ok: false,
        status: 0,
        data: null,
        error: `超时（>${AB_FETCH_TIMEOUT_MS / 1000}s）`,
      }
    }
    return { ok: false, status: 0, data: null, error: msg }
  }
}

async function postJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  let last: { ok: boolean; status: number; data: T | null; error?: string } = {
    ok: false,
    status: 0,
    data: null,
    error: '未请求',
  }
  for (let attempt = 1; attempt <= AB_FETCH_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), AB_FETCH_TIMEOUT_MS)
    try {
      last = await postJsonOnce<T>(url, body, ctrl.signal)
    } finally {
      clearTimeout(timer)
    }
    if (last.ok) return last
    const retryable =
      last.status === 0 ||
      last.status === 502 ||
      last.status === 503 ||
      last.status === 504 ||
      (last.error ?? '').includes('fetch failed') ||
      (last.error ?? '').includes('超时')
    if (!retryable || attempt === AB_FETCH_RETRIES) return last
    await sleep(1500 * attempt)
  }
  return last
}

/** Build AB blocks from a letter-desk infer unit + book index. */
export function blocksFromInferUnit(
  unit: FanoutInferUnit,
  bookIndex: BookIndex,
): AbBlock[] {
  const keys = unitMemberKeysOf(unit)
  const blocks: AbBlock[] = []
  for (const key of keys) {
    const chunk = bookIndex.chunks.find((c) => c.key === key)
    const text = (
      chunk?.faces.text?.content ??
      chunk?.content ??
      ''
    ).trim()
    if (!text) continue
    blocks.push({
      key,
      text,
      page: chunk?.page ?? unit.candidate.R.page,
      shortHandle: shortHandle(key),
    })
  }
  if (blocks.length === 0) {
    const excerpt = unit.candidate.excerpt.replace(/^【[^\n]*】\n?/, '').trim()
    if (excerpt) {
      blocks.push({
        key: unit.candidate.R.key,
        text: excerpt,
        page: unit.candidate.R.page,
        shortHandle: shortHandle(unit.candidate.R.key),
      })
    }
  }
  return blocks
}

export function buildAbInputFromUnit(input: {
  question: string
  unit: FanoutInferUnit
  bookIndex: BookIndex
}): AbCompareInput | { error: string } {
  const blocks = blocksFromInferUnit(input.unit, input.bookIndex)
  if (blocks.length === 0) return { error: '单元木块无可用 text' }
  return {
    question: input.question.trim(),
    blocks,
    unitLabel: input.unit.label,
    fixtureId: input.unit.candidate.R.key,
  }
}

async function runArmA(
  input: AbCompareInput,
  onProgress?: AbProgressHandler,
): Promise<AbArmResult> {
  const phases: AbLogEvent[] = []
  const t0 = now()
  const label = '测试一 · 网关一体（结+配方）'
  push(phases, onProgress, 'A', 'start', '启动：网关一次产出 conclusion + ops')

  push(phases, onProgress, 'A', 'llm', 'POST /api/protocol/infer-ops …')
  const res = await postJson<{
    ok: boolean
    usedMock?: boolean
    conclusion?: string
    path?: string
    usedKeys?: string[]
    ops?: unknown[]
    error?: string
    rawText?: string
  }>('/api/protocol/infer-ops', {
    question: input.question,
    blocks: input.blocks,
    unitLabel: input.unitLabel,
  })

  if (!res.ok || !res.data || res.data.ok === false) {
    const err =
      res.error ??
      (res.data &&
      typeof res.data === 'object' &&
      'error' in res.data &&
      typeof res.data.error === 'string'
        ? res.data.error
        : undefined) ??
      'infer-ops 失败'
    push(phases, onProgress, 'A', 'error', err)
    return {
      arm: 'A',
      label,
      ok: false,
      usedMock: false,
      conclusion: '',
      pathText: '',
      formal: null,
      validateOk: false,
      validateCodes: [],
      validateMessage: err,
      elapsedMs: now() - t0,
      phases,
      error: err,
      rawGateway: res.data ?? undefined,
    }
  }

  const data = res.data
  push(
    phases,
    onProgress,
    'A',
    'llm_done',
    data.usedMock ? 'LLM mock 返回' : 'LLM 返回 JSON',
  )

  const rawForValidate = {
    conclusion: data.conclusion ?? '',
    formalConclusion: data.conclusion ?? '',
    path: data.path ?? '',
    usedKeys: data.usedKeys ?? [],
    ops: data.ops ?? [],
  }

  push(phases, onProgress, 'A', 'validate', 'Validator 检验配方…')
  const v = validateFormalPath({
    blocks: input.blocks,
    raw: rawForValidate,
    premiseKeys: input.blocks.map((b) => b.key),
  })
  push(
    phases,
    onProgress,
    'A',
    v.ok ? 'accept' : 'reject',
    v.ok ? 'Validator ACCEPT' : `Validator ${v.message}`,
  )

  return {
    arm: 'A',
    label,
    ok: Boolean(data.ok) && v.ok,
    usedMock: Boolean(data.usedMock),
    conclusion: data.conclusion ?? '',
    pathText: data.path ?? '',
    formal: v.path,
    validateOk: v.ok,
    validateCodes: v.ok ? [] : v.codes,
    validateMessage: v.ok ? 'ACCEPT' : v.message,
    elapsedMs: now() - t0,
    phases,
    error: data.error,
    rawGateway: data,
  }
}

async function runArmB(
  input: AbCompareInput,
  onProgress?: AbProgressHandler,
): Promise<AbArmResult> {
  const phases: AbLogEvent[] = []
  const t0 = now()
  const label = '测试二 · 网关 + 形式化'
  push(phases, onProgress, 'B', 'start', '启动：经典网关 → 后置形式化')

  // Classic gateway via existing infer: need lock + excerpt
  const primary = input.blocks[0]
  const excerpt = input.blocks
    .map((b) => `【${b.shortHandle ?? shortHandle(b.key)}】\n${b.text}`)
    .join('\n\n')

  push(phases, onProgress, 'B', 'gateway', 'POST /api/protocol/infer（结+人话路径）…')
  const gw = await postJson<{
    ok: boolean
    usedMock?: boolean
    conclusion?: string
    path?: string
    error?: string
  }>('/api/protocol/infer', {
    question: input.question,
    sourceExcerpt: excerpt,
    lock: {
      lockId: primary.key,
      kind: 'text',
      page: primary.page ?? 0,
      faces: { text: true, fig: false },
    },
    forbidDirections: [],
  })

  if (!gw.ok || !gw.data?.ok) {
    const err = gw.error ?? gw.data?.error ?? '网关失败'
    push(phases, onProgress, 'B', 'error', err)
    return {
      arm: 'B',
      label,
      ok: false,
      usedMock: false,
      conclusion: '',
      pathText: '',
      formal: null,
      validateOk: false,
      validateCodes: [],
      validateMessage: err,
      elapsedMs: now() - t0,
      phases,
      error: err,
      rawGateway: gw.data,
    }
  }

  const conclusion = gw.data.conclusion ?? ''
  const pathText = gw.data.path ?? ''
  push(
    phases,
    onProgress,
    'B',
    'gateway_done',
    gw.data.usedMock ? '网关 mock 完成' : '网关完成（无 ops）',
  )

  push(phases, onProgress, 'B', 'formalize', 'POST /api/protocol/formalize …')
  const fz = await postJson<{
    ok: boolean
    usedMock?: boolean
    formalConclusion?: string
    usedKeys?: string[]
    ops?: unknown[]
    path?: string
    error?: string
  }>('/api/protocol/formalize', {
    question: input.question,
    blocks: input.blocks,
    gatewayConclusion: conclusion,
    gatewayPath: pathText,
    unitLabel: input.unitLabel,
  })

  if (!fz.ok || !fz.data) {
    const err = fz.error ?? '形式化失败'
    push(phases, onProgress, 'B', 'error', err)
    return {
      arm: 'B',
      label,
      ok: false,
      usedMock: Boolean(gw.data.usedMock),
      conclusion,
      pathText,
      formal: null,
      validateOk: false,
      validateCodes: [],
      validateMessage: err,
      elapsedMs: now() - t0,
      phases,
      error: err,
      rawGateway: gw.data,
      rawFormalize: fz.data,
    }
  }

  push(
    phases,
    onProgress,
    'B',
    'formalize_done',
    fz.data.usedMock ? '形式化 mock 返回' : '形式化返回 JSON',
  )

  const rawForValidate = {
    formalConclusion: fz.data.formalConclusion ?? '',
    conclusion: fz.data.formalConclusion ?? '',
    path: fz.data.path ?? pathText,
    usedKeys: fz.data.usedKeys ?? [],
    ops: fz.data.ops ?? [],
  }

  push(phases, onProgress, 'B', 'validate', 'Validator 检验形式化配方…')
  const v = validateFormalPath({
    blocks: input.blocks,
    raw: rawForValidate,
    premiseKeys: input.blocks.map((b) => b.key),
  })
  push(
    phases,
    onProgress,
    'B',
    v.ok ? 'accept' : 'reject',
    v.ok ? 'Validator ACCEPT' : `Validator ${v.message}`,
  )

  return {
    arm: 'B',
    label,
    ok: Boolean(fz.data.ok) && v.ok,
    usedMock: Boolean(gw.data.usedMock) || Boolean(fz.data.usedMock),
    conclusion,
    pathText,
    formal: v.path,
    validateOk: v.ok,
    validateCodes: v.ok ? [] : v.codes,
    validateMessage: v.ok ? 'ACCEPT' : v.message,
    elapsedMs: now() - t0,
    phases,
    error: fz.data.error,
    rawGateway: gw.data,
    rawFormalize: fz.data,
  }
}

export type AbRunMode = 'serial' | 'parallel'

/** Run both arms on the same AbCompareInput. Default serial to ease upstream LLM load. */
export async function runAbCompare(
  input: AbCompareInput,
  onProgress?: AbProgressHandler,
  mode: AbRunMode = 'serial',
): Promise<AbCompareReport> {
  const startedAt = now()
  if (mode === 'parallel') {
    push([], onProgress, 'shared', 'start', '同输入并行启动测试一 / 测试二')
    const [armA, armB] = await Promise.all([
      runArmA(input, onProgress),
      runArmB(input, onProgress),
    ])
    const finishedAt = now()
    push(
      [],
      onProgress,
      'shared',
      'done',
      `完成（并行）· A ${armA.elapsedMs}ms · B ${armB.elapsedMs}ms`,
    )
    return { input, startedAt, finishedAt, armA, armB }
  }

  push(
    [],
    onProgress,
    'shared',
    'start',
    '同输入串行：先测试一，再测试二（减轻上游并发）',
  )
  const armA = await runArmA(input, onProgress)
  push(
    [],
    onProgress,
    'shared',
    'mid',
    `测试一结束（${armA.elapsedMs}ms）→ 开始测试二`,
  )
  const armB = await runArmB(input, onProgress)
  const finishedAt = now()
  push(
    [],
    onProgress,
    'shared',
    'done',
    `完成（串行）· A ${armA.elapsedMs}ms · B ${armB.elapsedMs}ms`,
  )
  return { input, startedAt, finishedAt, armA, armB }
}
