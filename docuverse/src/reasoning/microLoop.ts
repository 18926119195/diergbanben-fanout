/**
 * Micro loop: Validator reject → motion brain next plan → retry infer-ops.
 */

import type { BookIndex } from './pipelineA'
import type { FanoutInferUnit } from './fanoutCompose'
import type {
  HarnessContext,
  MotionBrainInput,
  MotionPlan,
  MotionTrigger,
  WorkingSetState,
} from './harnessTypes'
import { buildMotionPlans } from './motionBrain'
import { executeInferOps } from './toolGateway'
import type { ValidateRejectCode } from './formalValidator'
import {
  augmentQuestionWithMarkers,
  compileHarnessProjection,
  compilerBlocksToAbBlocks,
} from './harnessCompiler'
import { blocksFromInferUnit } from './inferBlocks'
import { unitMemberKeysOf } from './letterDesk'
import { applyFaultIn } from './workingSet'

export const MAX_MICRO_LOOPS = 2

export interface MicroLoopResult {
  result: Awaited<ReturnType<typeof executeInferOps>>
  workingSet: WorkingSetState
  plansTried: MotionPlan[]
  loopCount: number
  lastValidatorCodes: ValidateRejectCode[]
}

function validatorTrigger(codes: ValidateRejectCode[], message: string): MotionTrigger {
  const kind =
    codes.includes('REJECT_THIN_DERIVATION') ||
    codes.includes('REJECT_PREMISE_DROPPED')
      ? 'evidence_gap'
      : 'validator'
  return { kind, signal: message, ref: codes.join(',') }
}

function nextPartialPlan(
  base: MotionPlan,
  memberKeys: ReadonlyArray<string>,
  openedCount: number,
): MotionPlan {
  const remaining = memberKeys.filter((k) => !base.faultInKeys.includes(k))
  const extra = remaining.slice(0, Math.max(1, memberKeys.length - openedCount))
  const faultInKeys = [...new Set([...base.faultInKeys, ...extra])]
  return {
    ...base,
    planId: `${base.planId}_micro_${openedCount}`,
    action: 'faultIn',
    faultInKeys,
    rationale: `微 loop partial fault-in · 开 ${faultInKeys.length}/${memberKeys.length} 槽`,
    trigger: base.trigger,
  }
}

async function inferOnce(input: {
  unit: FanoutInferUnit
  question: string
  bookIndex: BookIndex
  ctx: HarnessContext
  plan: MotionPlan
  workingSet: WorkingSetState
}): Promise<{
  result: Awaited<ReturnType<typeof executeInferOps>>
  workingSet: WorkingSetState
}> {
  const memberKeys = unitMemberKeysOf(input.unit)
  let ws = input.workingSet
  if (input.plan.faultInKeys.length > 0) {
    ws = applyFaultIn(ws, input.plan.faultInKeys)
  }

  const compiled = compileHarnessProjection({
    ctx: input.ctx,
    bookIndex: input.bookIndex,
    plan: input.plan,
    memberKeys,
  })

  let abBlocks = compilerBlocksToAbBlocks(compiled.blocks)
  if (abBlocks.length === 0) {
    abBlocks = blocksFromInferUnit(input.unit, input.bookIndex)
  }

  if (abBlocks.length === 0) {
    const action = {
      actionId: `infer_empty_${Date.now()}`,
      actionKind: 'infer' as const,
      premiseKeys: [...memberKeys],
      inputsRef: { question: input.question, role: 'gateway' as const },
      outputsRef: { error: '编译 blocks 为空' },
      createdAt: Date.now(),
    }
    return {
      result: {
        action,
        direction: null,
        ok: false,
        error: '编译 blocks 为空',
        formalPath: null,
      },
      workingSet: ws,
    }
  }

  const augmentedQuestion = augmentQuestionWithMarkers({
    question: input.question,
    pathMarkers: compiled.pathMarkers,
    refluxPremise: compiled.refluxPremise,
  })

  const result = await executeInferOps({
    question: augmentedQuestion,
    blocks: abBlocks,
    unitLabel: input.unit.label,
    premiseKeys: memberKeys,
  })

  return { result, workingSet: ws }
}

/**
 * Run infer-ops with up to MAX_MICRO_LOOPS retries after Validator reject.
 */
export async function inferWithMicroLoop(input: {
  unit: FanoutInferUnit
  question: string
  bookIndex: BookIndex
  ctx: HarnessContext
  initialPlan: MotionPlan
  brainInput: MotionBrainInput
  workingSet: WorkingSetState
  maxLoops?: number
}): Promise<MicroLoopResult> {
  const maxLoops = input.maxLoops ?? MAX_MICRO_LOOPS
  const memberKeys = unitMemberKeysOf(input.unit)
  const plansTried: MotionPlan[] = []
  let plan = input.initialPlan
  let ws = input.workingSet
  let lastCodes: ValidateRejectCode[] = []
  let loopCount = 0

  for (let i = 0; i <= maxLoops; i++) {
    loopCount = i
    plansTried.push(plan)
    const { result, workingSet: nextWs } = await inferOnce({
      unit: input.unit,
      question: input.question,
      bookIndex: input.bookIndex,
      ctx: input.ctx,
      plan,
      workingSet: ws,
    })
    ws = nextWs

    if (result.ok && result.direction?.formalOps?.length) {
      return {
        result,
        workingSet: ws,
        plansTried,
        loopCount,
        lastValidatorCodes: [],
      }
    }

    if (result.ok && result.direction) {
      return {
        result,
        workingSet: ws,
        plansTried,
        loopCount,
        lastValidatorCodes: [],
      }
    }

    const msg = result.error ?? 'Validator/infer 失败'
    lastCodes = msg.includes('REJECT')
      ? (msg.split(',').filter((c) => c.startsWith('REJECT_')) as ValidateRejectCode[])
      : ['REJECT_THIN_DERIVATION']

    if (i >= maxLoops) break

    const trigger = validatorTrigger(lastCodes, msg)
    const nextPlans = buildMotionPlans({
      ...input.brainInput,
      validatorSignal: trigger,
      expandBudget: Math.max(1, input.brainInput.expandBudget),
    })

    const unitPlan =
      nextPlans.find((p) => p.unitKey === input.unit.candidate.R.key) ??
      nextPlans[0]

    if (unitPlan && memberKeys.length > 1) {
      plan = nextPartialPlan(plan, memberKeys, plan.faultInKeys.length + 1)
    } else if (unitPlan) {
      plan = { ...unitPlan, trigger }
    } else {
      plan = nextPartialPlan(plan, memberKeys, plan.faultInKeys.length + 1)
    }
  }

  const last = await inferOnce({
    unit: input.unit,
    question: input.question,
    bookIndex: input.bookIndex,
    ctx: input.ctx,
    plan,
    workingSet: ws,
  })

  return {
    result: last.result,
    workingSet: last.workingSet,
    plansTried,
    loopCount,
    lastValidatorCodes: lastCodes,
  }
}
