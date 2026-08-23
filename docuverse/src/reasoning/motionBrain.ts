/**
 * Motion brain: propose MotionPlan[] without reading full T text.
 */

import { lexicalOverlap } from './hybridRetrieve'
import type { MotionBrainInput, MotionPlan, ScopeProbeInput } from './harnessTypes'
import { keysNeedingOpen } from './workingSet'
import { isForbidden } from './forbidPatterns'
import { memberKeysSignature } from './toolGateway'

const REUSE_MIN_OVERLAP = 0.35

function planId(prefix: string, unitKey: string, idx: number): string {
  return `${prefix}_${unitKey.slice(0, 12)}_${idx}`
}

export function probeScope(input: ScopeProbeInput): MotionPlan['probeResult'] {
  const { scope, archivePaths, currentMemory, bookIndexKeys } = input
  const keySet = new Set(bookIndexKeys)
  const candidateKeys: string[] = []
  const candidatePathIds: string[] = []

  if (scope.target === 'currentMemory') {
    for (const e of currentMemory) {
      candidatePathIds.push(e.pathId)
      const keys =
        e.path.direction.premiseKeys ?? e.path.slots.map((s) => s.key)
      for (const k of keys) {
        if (candidateKeys.length < scope.maxKeys) candidateKeys.push(k)
      }
    }
  } else {
    for (const e of archivePaths) {
      candidatePathIds.push(e.pathId)
      const keys =
        e.path.direction.premiseKeys ?? e.path.slots.map((s) => s.key)
      for (const k of keys) {
        if (keySet.has(k) && candidateKeys.length < scope.maxKeys) {
          candidateKeys.push(k)
        }
      }
    }
    if (scope.target === 'crossDoc' && scope.docId) {
      for (const k of bookIndexKeys) {
        if (k.startsWith(scope.docId) && candidateKeys.length < scope.maxKeys) {
          candidateKeys.push(k)
        }
      }
    }
  }

  const found = candidateKeys.length > 0 || candidatePathIds.length > 0
  return {
    found,
    candidateKeys: [...new Set(candidateKeys)].slice(0, scope.maxKeys),
    candidatePathIds: [...new Set(candidatePathIds)].slice(0, scope.maxKeys),
    note: found
      ? `probe: ${candidateKeys.length} keys, ${candidatePathIds.length} paths in ${scope.target}`
      : `probe: nothing in ${scope.target}`,
  }
}

export function buildMotionPlans(input: MotionBrainInput): MotionPlan[] {
  const plans: MotionPlan[] = []
  let expandQuota = input.expandBudget

  for (let i = 0; i < input.composeCandidates.length; i++) {
    const unit = input.composeCandidates[i]
    const members = [...unit.memberKeys]

    const forbidden = isForbidden([...input.forbidPatterns], members)
    if (forbidden) {
      plans.push({
        rank: 0,
        planId: planId('forbid', unit.unitKey, i),
        action: 'deferred',
        faultInKeys: [],
        collapseKeys: [],
        unitKey: unit.unitKey,
        score: 0,
        rationale: `重复拒绝模式≥3 · ${forbidden.conclusionPrefix.slice(0, 40)}`,
        trigger: input.validatorSignal,
      })
      continue
    }

    const reuseHit = input.reuseHits.find((h) => h.unitKey === unit.unitKey)
    const needOpen = keysNeedingOpen(members, input.workingSet)

    if (reuseHit && needOpen.length === 0) {
      const overlap = lexicalOverlap(input.question, reuseHit.pathId)
      if (overlap >= REUSE_MIN_OVERLAP || reuseHit.score >= 0.8) {
        plans.push({
          rank: 0,
          planId: planId('reuse', unit.unitKey, i),
          action: 'reuse',
          faultInKeys: [],
          collapseKeys: [],
          unitKey: unit.unitKey,
          reuseFromPathId: reuseHit.pathId,
          score: 0.85 + reuseHit.score * 0.1,
          rationale: `reuse 命中 ${reuseHit.pathId}`,
          trigger: input.validatorSignal,
        })
        continue
      }
    }

    if (needOpen.length > 0 && expandQuota > 0) {
      const faultInKeys = needOpen.slice(0, input.maxKeysPerPlan)
      plans.push({
        rank: 0,
        planId: planId('expand', unit.unitKey, i),
        action: 'expand',
        faultInKeys,
        collapseKeys: [],
        unitKey: unit.unitKey,
        score: 0.7 + faultInKeys.length * 0.05,
        rationale: `expand ${unit.label} · 开 ${faultInKeys.length} 槽`,
        trigger: input.validatorSignal,
      })
      expandQuota -= 1
    } else if (needOpen.length > 0 && input.validatorSignal) {
      plans.push({
        rank: 0,
        planId: planId('faultIn', unit.unitKey, i),
        action: 'faultIn',
        faultInKeys: needOpen.slice(0, input.maxKeysPerPlan),
        collapseKeys: [],
        unitKey: unit.unitKey,
        score: 0.55,
        rationale: '证据缺口 · 提议 fault-in',
        trigger: input.validatorSignal,
      })
    } else {
      plans.push({
        rank: 0,
        planId: planId('defer', unit.unitKey, i),
        action: 'deferred',
        faultInKeys: [],
        collapseKeys: [],
        unitKey: unit.unitKey,
        score: 0.2,
        rationale: '本轮 deferred',
        trigger: input.validatorSignal,
      })
    }
  }

  plans.sort((a, b) => b.score - a.score)
  return plans.map((p, idx) => ({ ...p, rank: idx + 1 }))
}

export function motionActionToLetterDecision(
  action: MotionPlan['action'],
): 'reuse' | 'expand' | 'deferred' | null {
  if (action === 'reuse') return 'reuse'
  if (action === 'expand' || action === 'faultIn') return 'expand'
  if (action === 'deferred' || action === 'scopeRequest' || action === 'collapse') {
    return 'deferred'
  }
  return null
}

export function memberKeysSig(keys: ReadonlyArray<string>): string {
  return memberKeysSignature([...keys])
}
