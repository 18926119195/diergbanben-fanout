/**
 * Tool gateway — sole execution exit.
 * Draft retrieves candidates; letter writer selects member_keys; gateway injects + stamps.
 */

import { buildInferBundle } from './bundle'
import {
  composeFanoutUnits,
  type FanoutInferUnit,
} from './fanoutCompose'
import {
  defaultComposePolicy,
  type ComposePolicy,
} from './composePolicy'
import { FANOUT_ROLE_NOTE } from './fanoutRoles'
import { callLlmWithBundle } from './llmClient'
import { textToProbe } from './lexicalProbe'
import type { BookIndex, CircleCandidate } from './pipelineA'
import { resolveVqToCandidates } from './pipelineA'
import type {
  ActionRecord,
  DirectionRecord,
  FanoutPath,
  InstructionBundle,
} from './types'

function newActionId(kind: string): string {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface GatewayRetrieveResult {
  action: ActionRecord
  candidates: CircleCandidate[]
  searchQuery: string
  poolSize: number
  autoLockOk: boolean
  expandNote: string
}

export interface GatewayComposeResult {
  action: ActionRecord
  units: FanoutInferUnit[]
  ok: boolean
  error?: string
}

export interface GatewayInferResult {
  action: ActionRecord
  direction: DirectionRecord | null
  bundle: InstructionBundle | null
  ok: boolean
  error?: string
}

/**
 * 草稿检索（Draft）：只产出候选 key* 名单。
 * premiseKeys 故意为空 — 草稿不是注入；注入由写信配方 + 网关 infer 登记。
 */
export async function executeRetrieve(input: {
  bookIndex: BookIndex
  question: string
  topK?: number
}): Promise<GatewayRetrieveResult> {
  const question = input.question.trim()
  const topK = input.topK ?? 5
  const resolved = await resolveVqToCandidates(input.bookIndex, question, topK)
  const draftKeys = resolved.candidates.map((c) => c.R.key)
  const action: ActionRecord = {
    actionId: newActionId('retrieve'),
    actionKind: 'retrieve',
    premiseKeys: [],
    inputsRef: { question, role: 'draft' },
    outputsRef: {
      candidateKeys: draftKeys,
      draftKeys,
      roleNote: FANOUT_ROLE_NOTE.draft,
    },
    createdAt: Date.now(),
  }
  return {
    action,
    candidates: resolved.candidates,
    searchQuery: resolved.searchQuery,
    poolSize: resolved.poolSize,
    autoLockOk: resolved.autoLockOk,
    expandNote: resolved.expandNote,
  }
}

/**
 * 写信组合（Letter）：决定每个单元的 member_keys 配方（集合身份）。
 * 本步 premiseKeys = 配方并集；真正实喂与主模型调用仍在网关 infer。
 */
export async function executeCompose(input: {
  bookIndex: BookIndex
  fineCandidates: CircleCandidate[]
  question?: string
  policy?: ComposePolicy
  /** @deprecated use policy */
  windowRadius?: number
  /** @deprecated use policy */
  includeFine?: boolean
  /** @deprecated use policy */
  includeWindow?: boolean
}): Promise<GatewayComposeResult> {
  const sourceKeys = input.fineCandidates.map((c) => c.R.key)
  const policy: ComposePolicy = {
    ...defaultComposePolicy(),
    ...input.policy,
  }
  if (input.policy == null) {
    if (typeof input.includeFine === 'boolean')
      policy.includeFine = input.includeFine
    if (typeof input.includeWindow === 'boolean')
      policy.includeWindow = input.includeWindow
    if (typeof input.windowRadius === 'number')
      policy.windowRadius = input.windowRadius
  }

  try {
    const units = await composeFanoutUnits(
      input.bookIndex,
      input.fineCandidates,
      policy,
    )

    const allMembers = [
      ...new Set(
        units.flatMap((u) =>
          u.candidate.R.memberKeys?.length
            ? u.candidate.R.memberKeys
            : [u.candidate.R.key],
        ),
      ),
    ]

    const action: ActionRecord = {
      actionId: newActionId('compose'),
      actionKind: 'compose',
      premiseKeys: allMembers,
      inputsRef: {
        question: input.question,
        sourceKeys,
        role: 'letter',
      },
      outputsRef: {
        units: units.map((u) => {
          const memberKeys =
            u.candidate.R.memberKeys?.length
              ? u.candidate.R.memberKeys
              : [u.candidate.R.key]
          return {
            kind: u.kind,
            label: u.label,
            unitKey: u.candidate.R.key,
            memberKeys,
          }
        }),
        candidateKeys: units.map((u) => u.candidate.R.key),
        roleNote: `${FANOUT_ROLE_NOTE.letter}${
          policy.strategyText ? ` · 策略已应用` : ''
        }`,
      },
      createdAt: Date.now(),
    }

    if (units.length === 0) {
      return {
        action: {
          ...action,
          outputsRef: {
            ...action.outputsRef,
            error: '组合后无可用推理单元',
          },
        },
        units: [],
        ok: false,
        error: '组合后无可用推理单元',
      }
    }

    return { action, units, ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const action: ActionRecord = {
      actionId: newActionId('compose'),
      actionKind: 'compose',
      premiseKeys: sourceKeys,
      inputsRef: {
        question: input.question,
        sourceKeys,
        role: 'letter',
      },
      outputsRef: { error: msg, roleNote: FANOUT_ROLE_NOTE.letter },
      createdAt: Date.now(),
    }
    return { action, units: [], ok: false, error: msg }
  }
}

/**
 * 网关推理（Gateway）：按写信配方实喂 Bundle，选定≡注入，调主模型并记账。
 * 真正「记录注入」在这一步的 ActionRecord.premiseKeys。
 */
export async function executeInfer(input: {
  candidate: CircleCandidate
  question: string
  /** Prior path markers / conclusions for compact reflux (少带原文) */
  refluxPremise?: {
    conclusion: string
    pathSummary: string
    fromKey: string
  }
  /** Soft-cap excerpt when reflux is present */
  preferCompactExcerpt?: boolean
}): Promise<GatewayInferResult> {
  const question = input.question.trim()
  const { R } = input.candidate
  let excerpt = input.candidate.excerpt
  if (input.preferCompactExcerpt && input.refluxPremise) {
    // Keep lock identity grounded, but shrink raw dump when markers exist
    excerpt =
      excerpt.length > 480
        ? `${excerpt.slice(0, 480)}…`
        : excerpt
  }
  const premiseKeys =
    input.candidate.R.memberKeys && input.candidate.R.memberKeys.length > 0
      ? input.candidate.R.memberKeys
      : [R.key]

  let bundle: InstructionBundle
  try {
    bundle = buildInferBundle({
      R,
      sourceExcerpt: excerpt,
      question,
      forbid: [],
      premise: input.refluxPremise,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const action: ActionRecord = {
      actionId: newActionId('infer'),
      actionKind: 'infer',
      premiseKeys,
      inputsRef: { question, excerpt, lockKey: R.key, role: 'gateway' },
      outputsRef: { error: msg, roleNote: FANOUT_ROLE_NOTE.gateway },
      createdAt: Date.now(),
    }
    return { action, direction: null, bundle: null, ok: false, error: msg }
  }

  const bundleMembers =
    bundle.R.memberKeys && bundle.R.memberKeys.length > 0
      ? bundle.R.memberKeys
      : [bundle.R.key]
  const sameMembers =
    premiseKeys.length === bundleMembers.length &&
    [...premiseKeys].sort().join('\0') === [...bundleMembers].sort().join('\0')
  if (!sameMembers || bundle.sourceExcerpt !== excerpt) {
    const msg = '选定≡注入校验失败：premise 与 Bundle 实喂不一致'
    const action: ActionRecord = {
      actionId: newActionId('infer'),
      actionKind: 'infer',
      premiseKeys,
      inputsRef: { question, excerpt, lockKey: R.key, role: 'gateway' },
      outputsRef: { error: msg, roleNote: FANOUT_ROLE_NOTE.gateway },
      createdAt: Date.now(),
    }
    return { action, direction: null, bundle, ok: false, error: msg }
  }

  const llm = await callLlmWithBundle(bundle)
  const action: ActionRecord = {
    actionId: newActionId('infer'),
    actionKind: 'infer',
    premiseKeys,
    inputsRef: { question, excerpt, lockKey: R.key, role: 'gateway' },
    outputsRef: llm.ok
      ? {
          path: llm.path,
          conclusion: llm.conclusion,
          roleNote: FANOUT_ROLE_NOTE.gateway,
        }
      : { error: llm.error || '推理失败', roleNote: FANOUT_ROLE_NOTE.gateway },
    createdAt: Date.now(),
  }

  if (!llm.ok) {
    return {
      action,
      direction: null,
      bundle,
      ok: false,
      error: llm.error || '推理失败',
    }
  }

  const direction: DirectionRecord = {
    directionId: `dir_${action.actionId}`,
    questionText: question,
    probe: textToProbe(question),
    path: llm.path,
    conclusion: llm.conclusion,
    createdAt: Date.now(),
    variants: [],
    premiseKeys,
    actionIds: [action.actionId],
    accepted: undefined,
  }

  return { action, direction, bundle, ok: true }
}

/** Sorted member_keys fingerprint — same combo ⇒ same identity for reuse. */
export function memberKeysSignature(keys: string[]): string {
  return [...keys].filter(Boolean).sort().join('\0')
}

/**
 * 网关复用：同一 member_keys 已有采纳资产 → 短路，不调主模型。
 * 仍盖 ActionRecord，保证可追溯。
 */
export function executeReuse(input: {
  candidate: CircleCandidate
  question: string
  fromPath: FanoutPath
}): GatewayInferResult {
  const question = input.question.trim()
  const premiseKeys =
    input.candidate.R.memberKeys && input.candidate.R.memberKeys.length > 0
      ? input.candidate.R.memberKeys
      : [input.candidate.R.key]

  const prev = input.fromPath.direction
  const action: ActionRecord = {
    actionId: newActionId('reuse'),
    actionKind: 'reuse',
    premiseKeys,
    inputsRef: {
      question,
      excerpt: input.candidate.excerpt,
      lockKey: input.candidate.R.key,
      role: 'reuse',
      reusedFromPathId: input.fromPath.pathId,
    },
    outputsRef: {
      path: prev.path,
      conclusion: prev.conclusion,
      assetId: prev.directionId,
      reused: true,
      roleNote: FANOUT_ROLE_NOTE.reuse,
    },
    createdAt: Date.now(),
  }

  const variants = [...(prev.variants ?? [])]
  if (
    question &&
    question !== prev.questionText &&
    !variants.includes(question)
  ) {
    variants.push(question)
  }

  const direction: DirectionRecord = {
    directionId: prev.directionId,
    questionText: prev.questionText,
    probe: prev.probe,
    path: `【复用 · 跳过主模型 · 自 ${input.fromPath.pathId}】\n${prev.path}`,
    conclusion: prev.conclusion,
    createdAt: Date.now(),
    variants,
    premiseKeys,
    actionIds: [action.actionId],
    accepted: undefined,
  }

  return { action, direction, bundle: null, ok: true }
}

