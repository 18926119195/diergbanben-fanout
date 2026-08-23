/**
 * Fan-out store: session results are ephemeral;
 * accepted paths + deferred (尚未展开) archives persist to localStorage.
 */

import { create } from 'zustand'
import type { ActionRecord, FanoutPath } from './types'
import { FANOUT_ROLE_NOTE } from './fanoutRoles'
import type { IdentityKind } from './identityFocus'
import type {
  FanoutDraftReport,
  LetterDeskSession,
} from './fanoutRunner'
import type {
  DeferredUnitArchive,
  LetterDeskSnapshot,
  LetterRunStrategy,
  LetterUnitDecision,
} from './letterDesk'
import {
  reproposeLetterDesk,
  setLetterUnitDecision,
} from './fanoutRunner'
import {
  emptyCurrentObject,
  lockSlotsObject,
  type CurrentObject,
} from './currentObject'
import { LOCKED_LLM } from './modelRuntimeConfig'

const STORAGE_PREFIX = 'docuverse.fanout.v1:'
const DEFERRED_PREFIX = 'docuverse.fanout.deferred.v1:'
const INFERRED_PREFIX = 'docuverse.fanout.inferred.v1:'

export type FanoutPhase =
  | 'idle'
  | 'retrieving'
  | 'composing'
  | 'review'
  | 'inferring'
  | 'done'
  | 'error'

/** Disk payload — accepted paths only */
interface FanoutAcceptedPersisted {
  actionLog: ActionRecord[]
  paths: FanoutPath[]
  lastQuestion: string
}

function storageKey(corpus: string): string {
  return `${STORAGE_PREFIX}${corpus || 'default'}`
}

function deferredKey(corpus: string): string {
  return `${DEFERRED_PREFIX}${corpus || 'default'}`
}

function emptyAccepted(): FanoutAcceptedPersisted {
  return { actionLog: [], paths: [], lastQuestion: '' }
}

function newActionId(kind: string): string {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function loadAccepted(corpus: string): FanoutAcceptedPersisted {
  try {
    const raw = localStorage.getItem(storageKey(corpus))
    if (!raw) return emptyAccepted()
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return emptyAccepted()
    const o = data as Record<string, unknown>
    const paths = Array.isArray(o.paths) ? (o.paths as FanoutPath[]) : []
    const acceptedPaths = paths.filter((p) => p.direction?.accepted === true)
    const idSet = new Set(acceptedPaths.flatMap((p) => p.actionIds))
    const actionLog = (
      Array.isArray(o.actionLog) ? (o.actionLog as ActionRecord[]) : []
    ).filter((a) => idSet.has(a.actionId))
    return {
      paths: acceptedPaths,
      actionLog,
      lastQuestion:
        typeof o.lastQuestion === 'string' ? o.lastQuestion : '',
    }
  } catch {
    return emptyAccepted()
  }
}

function saveAccepted(corpus: string, state: FanoutAcceptedPersisted): void {
  try {
    const paths = state.paths.filter((p) => p.direction.accepted === true)
    const idSet = new Set(paths.flatMap((p) => p.actionIds))
    const payload: FanoutAcceptedPersisted = {
      paths,
      actionLog: state.actionLog.filter((a) => idSet.has(a.actionId)),
      lastQuestion: state.lastQuestion,
    }
    localStorage.setItem(storageKey(corpus), JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

function loadDeferred(corpus: string): DeferredUnitArchive[] {
  try {
    const raw = localStorage.getItem(deferredKey(corpus))
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? (data as DeferredUnitArchive[]) : []
  } catch {
    return []
  }
}

function saveDeferred(corpus: string, list: DeferredUnitArchive[]): void {
  try {
    localStorage.setItem(deferredKey(corpus), JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function inferredKey(corpus: string): string {
  return `${INFERRED_PREFIX}${corpus || 'default'}`
}

function loadInferred(corpus: string): FanoutPath[] {
  try {
    const raw = localStorage.getItem(inferredKey(corpus))
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? (data as FanoutPath[]) : []
  } catch {
    return []
  }
}

function saveInferred(corpus: string, paths: FanoutPath[]): void {
  try {
    // Cap cache size
    const trimmed = paths
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80)
    localStorage.setItem(inferredKey(corpus), JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
}

function actionsForPaths(
  paths: FanoutPath[],
  pool: ActionRecord[],
): ActionRecord[] {
  const idSet = new Set(paths.flatMap((p) => p.actionIds))
  const byId = new Map(pool.map((a) => [a.actionId, a]))
  const out: ActionRecord[] = []
  for (const id of idSet) {
    const a = byId.get(id)
    if (a) out.push(a)
  }
  return out
}

interface FanoutState {
  corpus: string
  phase: FanoutPhase
  progress: string
  error: string | null
  actionLog: ActionRecord[]
  paths: FanoutPath[]
  lastQuestion: string
  draftReport: FanoutDraftReport | null
  letterDesk: LetterDeskSnapshot | null
  letterSession: LetterDeskSession | null
  deferredArchive: DeferredUnitArchive[]
  inferredPaths: FanoutPath[]
  currentObject: CurrentObject
  reasonModelId: string
  letterStrategy: LetterRunStrategy
  expandBudget: number
  activePathId: string | null
  selectedSlotKey: string | null
  focusedActionId: string | null
  focusedIdentityId: string | null
  acceptedPaths: FanoutPath[]
  acceptedActionLog: ActionRecord[]
  acceptedQuestion: string
  setCorpus: (corpus: string) => void
  setPhase: (phase: FanoutPhase, progress?: string) => void
  setError: (msg: string | null) => void
  appendActions: (actions: ActionRecord[]) => void
  setLetterStrategy: (s: LetterRunStrategy) => void
  setExpandBudget: (n: number) => void
  setCurrentObject: (obj: CurrentObject) => void
  lockObjectFromDraft: (keys: string[], pages: number[], lockedBy: 'auto' | 'user') => void
  setLetterPrepare: (input: {
    session: LetterDeskSession
    actions: ActionRecord[]
  }) => void
  replaceLetterSession: (session: LetterDeskSession, extraAction?: ActionRecord) => void
  updateLetterDecision: (index: number, decision: LetterUnitDecision) => void
  reproposeLetter: () => void
  clearLetterDesk: () => void
  returnToLetterDesk: (error: string) => void
  setRunResult: (input: {
    question: string
    paths: FanoutPath[]
    actions: ActionRecord[]
    draftReport?: FanoutDraftReport | null
    letterDesk?: LetterDeskSnapshot | null
    deferredArchive?: DeferredUnitArchive[]
  }) => void
  setActivePathId: (id: string | null) => void
  setSelectedSlotKey: (key: string | null) => void
  focusIdentity: (input: {
    identityId: string
    kind: IdentityKind
    slotKey?: string | null
    actionId?: string | null
    pathId?: string | null
  }) => void
  setPathAccepted: (pathId: string, accepted: boolean) => void
  removeDeferred: (id: string) => void
  clearRun: () => void
}

export const useFanout = create<FanoutState>((set, get) => ({
  corpus: 'default',
  phase: 'idle',
  progress: '',
  error: null,
  actionLog: [],
  paths: [],
  lastQuestion: '',
  draftReport: null,
  letterDesk: null,
  letterSession: null,
  deferredArchive: [],
  inferredPaths: [],
  currentObject: emptyCurrentObject(),
  reasonModelId: LOCKED_LLM.chatModel,
  letterStrategy: 'reuse_prefer',
  expandBudget: 3,
  activePathId: null,
  selectedSlotKey: null,
  focusedActionId: null,
  focusedIdentityId: null,
  acceptedPaths: [],
  acceptedActionLog: [],
  acceptedQuestion: '',

  setCorpus: (corpus) => {
    const accepted = loadAccepted(corpus)
    set({
      corpus,
      acceptedPaths: accepted.paths,
      acceptedActionLog: accepted.actionLog,
      acceptedQuestion: accepted.lastQuestion,
      deferredArchive: loadDeferred(corpus),
      inferredPaths: loadInferred(corpus),
      currentObject: emptyCurrentObject(corpus),
      reasonModelId: LOCKED_LLM.chatModel,
      paths: [],
      actionLog: [],
      lastQuestion: '',
      draftReport: null,
      letterDesk: null,
      letterSession: null,
      activePathId: accepted.paths[0]?.pathId ?? null,
      selectedSlotKey: null,
      focusedActionId: null,
      focusedIdentityId: null,
      phase: 'idle',
      progress: '',
      error: null,
    })
  },

  setPhase: (phase, progress = '') => set({ phase, progress }),

  setError: (msg) =>
    set({ error: msg, phase: msg ? 'error' : get().phase }),

  appendActions: (actions) => {
    set({ actionLog: [...get().actionLog, ...actions] })
  },

  setLetterStrategy: (s) => set({ letterStrategy: s }),

  setExpandBudget: (n) => set({ expandBudget: Math.max(0, n) }),

  setCurrentObject: (obj) => set({ currentObject: obj }),

  lockObjectFromDraft: (keys, pages, lockedBy) => {
    set({
      currentObject: lockSlotsObject({
        docId: get().corpus,
        slotKeys: keys,
        pages,
        lockedBy,
      }),
    })
  },

  setLetterPrepare: ({ session, actions }) => {
    const draft = session.draftReport
    if (draft.autoLockOk && draft.candidates[0] && get().currentObject.lockedBy === 'none') {
      const top = draft.candidates[0]
      set({
        currentObject: lockSlotsObject({
          docId: get().corpus,
          slotKeys: [top.key],
          pages: [top.page],
          lockedBy: 'auto',
        }),
      })
    }
    set({
      letterSession: {
        ...session,
        inferredPaths: get().inferredPaths,
        modelId: get().reasonModelId,
        acceptedPaths: get().acceptedPaths,
      },
      letterDesk: session.snapshot,
      draftReport: session.draftReport,
      lastQuestion: session.question,
      actionLog: [...get().actionLog, ...actions],
      phase: 'review',
      progress: `写信台审查 · ${session.snapshot.comboCount} 种组合`,
      error: null,
      paths: [],
    })
  },

  replaceLetterSession: (session, extraAction) => {
    set({
      letterSession: session,
      letterDesk: session.snapshot,
      actionLog: extraAction
        ? [...get().actionLog, extraAction]
        : get().actionLog,
      phase: 'review',
      progress: `写信台 · 已按对象重组合 · ${session.snapshot.comboCount} 种`,
      error: null,
    })
  },

  updateLetterDecision: (index, decision) => {
    const session = get().letterSession
    if (!session) return
    const next = setLetterUnitDecision(session, index, decision)
    set({
      letterSession: next,
      letterDesk: next.snapshot,
    })
  },

  reproposeLetter: () => {
    const session = get().letterSession
    if (!session) return
    const next = reproposeLetterDesk(session, {
      strategy: get().letterStrategy,
      expandBudget: get().expandBudget,
      allowReuse: true,
    })
    set({
      letterSession: next,
      letterDesk: next.snapshot,
    })
  },

  clearLetterDesk: () =>
    set({
      letterDesk: null,
      letterSession: null,
      phase: get().paths.length > 0 ? 'done' : 'idle',
      progress: '',
    }),

  returnToLetterDesk: (error) => {
    const session = get().letterSession
    set({
      error,
      phase: session ? 'review' : 'error',
      progress: session ? '已回写信台，请改决策后重试' : '',
      letterDesk: session
        ? { ...session.snapshot, status: 'review' }
        : get().letterDesk,
    })
  },

  setRunResult: ({
    question,
    paths,
    actions,
    draftReport,
    letterDesk,
    deferredArchive,
  }) => {
    const firstSlot = paths[0]?.slots?.[0]?.key ?? null
    const mergedDeferred = [
      ...(deferredArchive ?? []),
      ...get().deferredArchive,
    ]
    const seenDef = new Set<string>()
    const deferredUnique = mergedDeferred.filter((d) => {
      const k = `${d.question}\0${d.memberKeys.slice().sort().join('\0')}`
      if (seenDef.has(k)) return false
      seenDef.add(k)
      return true
    })
    saveDeferred(get().corpus, deferredUnique)

    // Merge inferred cache (session paths become reusable without accept)
    const byId = new Map(get().inferredPaths.map((p) => [p.pathId, p]))
    for (const p of paths) {
      byId.set(p.pathId, {
        ...p,
        direction: {
          ...p.direction,
          cacheTier: p.direction.accepted ? 'accepted' : 'inferred',
        },
      })
    }
    const inferredPaths = [...byId.values()]
    saveInferred(get().corpus, inferredPaths)

    set({
      lastQuestion: question,
      paths,
      actionLog: [...get().actionLog, ...actions],
      activePathId: paths[0]?.pathId ?? null,
      selectedSlotKey: firstSlot,
      focusedActionId: null,
      focusedIdentityId: firstSlot ? `slot:${firstSlot}` : null,
      draftReport: draftReport ?? null,
      letterDesk: letterDesk ?? null,
      letterSession: null,
      deferredArchive: deferredUnique,
      inferredPaths,
      phase: 'done',
      progress: '',
      error: null,
    })
  },

  setActivePathId: (id) => {
    const path =
      get().paths.find((p) => p.pathId === id) ??
      get().acceptedPaths.find((p) => p.pathId === id)
    const slot = path?.slots?.[0]?.key ?? null
    set({
      activePathId: id,
      selectedSlotKey: slot,
      focusedIdentityId: slot ? `slot:${slot}` : null,
    })
  },

  setSelectedSlotKey: (key) =>
    set({
      selectedSlotKey: key,
      focusedIdentityId: key ? `slot:${key}` : null,
    }),

  focusIdentity: ({ identityId, slotKey, actionId, pathId }) => {
    set({
      focusedIdentityId: identityId,
      focusedActionId: actionId ?? null,
      ...(pathId ? { activePathId: pathId } : {}),
      ...(slotKey !== undefined ? { selectedSlotKey: slotKey } : {}),
    })
  },

  setPathAccepted: (pathId, accepted) => {
    const sessionPaths = get().paths.map((p) =>
      p.pathId === pathId
        ? { ...p, direction: { ...p.direction, accepted } }
        : p,
    )
    set({ paths: sessionPaths })

    const hit =
      sessionPaths.find((p) => p.pathId === pathId) ??
      get().acceptedPaths.find((p) => p.pathId === pathId)
    if (!hit) return

    let stamped: FanoutPath = {
      ...hit,
      direction: { ...hit.direction, accepted },
    }

    const premiseKeys =
      stamped.direction.premiseKeys?.length
        ? stamped.direction.premiseKeys
        : (stamped.slots?.map((s) => s.key) ?? [])

    let acceptAction: ActionRecord | null = null
    if (accepted === true) {
      acceptAction = {
        actionId: newActionId('accept'),
        actionKind: 'accept',
        premiseKeys,
        inputsRef: {
          question: stamped.question,
          role: 'accept',
          pathId: stamped.pathId,
        },
        outputsRef: {
          assetId: stamped.direction.directionId,
          conclusion: stamped.direction.conclusion,
          path: stamped.direction.path,
          pathMarker: stamped.direction.pathMarker,
          roleNote: FANOUT_ROLE_NOTE.accept,
        },
        createdAt: Date.now(),
      }
      const nextIds = [
        ...(stamped.direction.actionIds ?? stamped.actionIds ?? []),
        acceptAction.actionId,
      ]
      stamped = {
        ...stamped,
        actionIds: nextIds,
        direction: {
          ...stamped.direction,
          actionIds: nextIds,
          accepted: true,
          cacheTier: 'accepted',
        },
      }
    }

    let acceptedPaths = get().acceptedPaths.filter((p) => p.pathId !== pathId)
    let pool = [
      ...get().acceptedActionLog,
      ...get().actionLog,
      ...(acceptAction ? [acceptAction] : []),
    ]
    const seen = new Set<string>()
    pool = pool.filter((a) => {
      if (seen.has(a.actionId)) return false
      seen.add(a.actionId)
      return true
    })

    if (accepted === true) {
      acceptedPaths = [...acceptedPaths, stamped]
    }

    const sessionLog = acceptAction
      ? [...get().actionLog, acceptAction]
      : get().actionLog

    const acceptedActionLog = actionsForPaths(acceptedPaths, pool)
    const acceptedQuestion =
      acceptedPaths[0]?.question || get().acceptedQuestion || get().lastQuestion

    set({
      paths: get().paths.map((p) => (p.pathId === pathId ? stamped : p)),
      actionLog: sessionLog,
      acceptedPaths,
      acceptedActionLog,
      acceptedQuestion,
      focusedIdentityId: accepted
        ? `asset:${stamped.direction.directionId}`
        : get().focusedIdentityId,
      focusedActionId: acceptAction?.actionId ?? get().focusedActionId,
    })
    saveAccepted(get().corpus, {
      paths: acceptedPaths,
      actionLog: acceptedActionLog,
      lastQuestion: acceptedQuestion,
    })
  },

  removeDeferred: (id) => {
    const deferredArchive = get().deferredArchive.filter((d) => d.id !== id)
    saveDeferred(get().corpus, deferredArchive)
    set({ deferredArchive })
  },

  clearRun: () => {
    const { acceptedPaths } = get()
    const slot = acceptedPaths[0]?.slots?.[0]?.key ?? null
    set({
      paths: [],
      actionLog: [],
      lastQuestion: '',
      draftReport: null,
      letterDesk: null,
      letterSession: null,
      activePathId: acceptedPaths[0]?.pathId ?? null,
      selectedSlotKey: slot,
      focusedActionId: null,
      focusedIdentityId: slot ? `slot:${slot}` : null,
      phase: 'idle',
      progress: '',
      error: null,
    })
  },
}))
