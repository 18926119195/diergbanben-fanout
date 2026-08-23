import {
  allowedKeysOf,
  isFormalOpKind,
  type AbBlock,
  type FormalOp,
  type FormalPathV1,
} from './formalPath'

export type ValidateRejectCode =
  | 'REJECT_INPUT'
  | 'REJECT_PARSE'
  | 'REJECT_SCHEMA'
  | 'REJECT_KEY_NOT_ALLOWED'
  | 'REJECT_PREMISE_DROPPED'
  | 'REJECT_KEY_IN_PROSE'
  | 'REJECT_EMPTY_PATH'
  | 'REJECT_THIN_DERIVATION'

export type ValidateResult =
  | { ok: true; path: FormalPathV1; codes: [] }
  | {
      ok: false
      path: FormalPathV1 | null
      codes: ValidateRejectCode[]
      message: string
    }

const KEY_LIKE = /h1\.[A-Za-z0-9_-]{8,}/g

function stripFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return m ? m[1].trim() : t
}

function collectProseKeys(...parts: Array<string | undefined>): string[] {
  const out: string[] = []
  for (const p of parts) {
    if (!p) continue
    const hits = p.match(KEY_LIKE)
    if (hits) out.push(...hits)
  }
  return out
}

function normalizeOps(raw: unknown): FormalOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const ops: FormalOp[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null
    const rec = item as Record<string, unknown>
    if (!isFormalOpKind(rec.op)) return null
    if (!Array.isArray(rec.keys) || rec.keys.length === 0) return null
    if (!rec.keys.every((k) => typeof k === 'string' && k.length > 0)) {
      return null
    }
    if (typeof rec.note !== 'string') return null
    const claim =
      typeof rec.claim === 'string'
        ? rec.claim.trim()
        : typeof rec.yields === 'string'
          ? rec.yields.trim()
          : ''
    if (!claim) return null
    ops.push({
      op: rec.op,
      keys: rec.keys,
      note: rec.note.trim(),
      claim,
    })
  }
  return ops
}

/** Parse model JSON (or already-parsed object) into FormalPathV1 shape. */
export function parseFormalPathJson(raw: unknown): {
  path: FormalPathV1 | null
  code?: ValidateRejectCode
  message?: string
} {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(stripFence(raw))
    } catch {
      return {
        path: null,
        code: 'REJECT_PARSE',
        message: 'JSON 解析失败',
      }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { path: null, code: 'REJECT_PARSE', message: '根对象无效' }
  }
  const rec = obj as Record<string, unknown>
  const ops = normalizeOps(rec.ops)
  const usedKeys = Array.isArray(rec.usedKeys)
    ? rec.usedKeys.filter((k): k is string => typeof k === 'string')
    : null
  const formalConclusion =
    typeof rec.formalConclusion === 'string'
      ? rec.formalConclusion.trim()
      : typeof rec.conclusion === 'string'
        ? rec.conclusion.trim()
        : ''
  if (!ops || !usedKeys || usedKeys.length === 0 || !formalConclusion) {
    return {
      path: null,
      code: 'REJECT_SCHEMA',
      message: '缺少 ops（含 claim）/ usedKeys / conclusion',
    }
  }
  const path: FormalPathV1 = {
    schemaVersion: 'formalPath.v1',
    usedKeys,
    ops,
    formalConclusion,
    path: typeof rec.path === 'string' ? rec.path : undefined,
    skipOriginalNextTime:
      typeof rec.skipOriginalNextTime === 'boolean'
        ? rec.skipOriginalNextTime
        : true,
    rationale: typeof rec.rationale === 'string' ? rec.rationale : undefined,
  }
  return { path }
}

function isThinDerivation(ops: FormalOp[], blockCount: number): boolean {
  const hasDerive = ops.some(
    (o) =>
      o.op === 'infer' ||
      o.op === 'combine' ||
      o.op === 'contrast' ||
      o.op === 'conclude',
  )
  if (!hasDerive) return true
  const onlyAttendThenConclude =
    ops.filter((o) => o.op === 'attend').length >= Math.max(2, blockCount) &&
    !ops.some((o) => o.op === 'infer' || o.op === 'combine' || o.op === 'contrast')
  if (onlyAttendThenConclude) return true
  const minSteps = Math.max(3, blockCount)
  if (ops.length < minSteps) return true
  const shortClaims = ops.filter((o) => o.claim.length < 12).length
  if (shortClaims > ops.length / 2) return true
  return false
}

export function validateFormalPath(input: {
  blocks: AbBlock[]
  raw: unknown
  /** Keys that must appear in usedKeys (e.g. premise bag) */
  premiseKeys?: string[]
  requirePremiseCover?: boolean
}): ValidateResult {
  const allowed = allowedKeysOf(input.blocks)
  if (allowed.size === 0) {
    return {
      ok: false,
      path: null,
      codes: ['REJECT_INPUT'],
      message: 'blocks 为空',
    }
  }
  for (const b of input.blocks) {
    if (!b.text.trim()) {
      return {
        ok: false,
        path: null,
        codes: ['REJECT_INPUT'],
        message: `木块 text 为空：${b.key}`,
      }
    }
  }

  const parsed = parseFormalPathJson(input.raw)
  if (!parsed.path) {
    return {
      ok: false,
      path: null,
      codes: [parsed.code ?? 'REJECT_PARSE'],
      message: parsed.message ?? '解析失败',
    }
  }

  const path = parsed.path
  const codes: ValidateRejectCode[] = []
  const allKeys = new Set<string>([
    ...path.usedKeys,
    ...path.ops.flatMap((o) => o.keys),
  ])
  for (const k of allKeys) {
    if (!allowed.has(k)) codes.push('REJECT_KEY_NOT_ALLOWED')
  }

  const premise = input.premiseKeys ?? input.blocks.map((b) => b.key)
  const requireCover = input.requirePremiseCover !== false
  if (requireCover) {
    for (const k of premise) {
      if (
        !path.usedKeys.includes(k) &&
        !path.ops.some((o) => o.keys.includes(k))
      ) {
        codes.push('REJECT_PREMISE_DROPPED')
        break
      }
    }
  }

  const proseKeys = collectProseKeys(
    path.formalConclusion,
    path.path,
    path.rationale,
    ...path.ops.map((o) => o.note),
    ...path.ops.map((o) => o.claim),
  )
  for (const k of proseKeys) {
    if (!allowed.has(k)) {
      codes.push('REJECT_KEY_IN_PROSE')
      break
    }
  }

  const onlyDefer = path.ops.every((o) => o.op === 'defer')
  if (path.ops.length === 0 || (onlyDefer && path.formalConclusion.length > 40)) {
    codes.push('REJECT_EMPTY_PATH')
  }

  if (isThinDerivation(path.ops, input.blocks.length)) {
    codes.push('REJECT_THIN_DERIVATION')
  }

  const uniq = [...new Set(codes)]
  if (uniq.length > 0) {
    return {
      ok: false,
      path,
      codes: uniq,
      message: uniq.join(', '),
    }
  }
  return { ok: true, path, codes: [] }
}
