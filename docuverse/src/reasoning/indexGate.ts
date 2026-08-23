/**
 * Post-upload gate: OCR → A1 build → V_book embed → ready for V_q questions.
 * Also supports page-level sync after per-page OCR / T edits.
 */

import { create } from 'zustand'
import { saveBookIndex } from './bookIndexStore'
import {
  buildBookIndex,
  patchAtomTextInBookIndex,
  rebuildPagesInBookIndex,
  reembedBookIndex,
  type BookIndex,
} from './pipelineA'
import type { OcrPageResult } from '../data/ocrService'
import type { PageDocument } from '../zigzag/types'

export type IndexPhase =
  | 'idle'
  | 'importing'
  | 'ocr'
  | 'embedding'
  | 'ready'
  | 'error'

interface IndexGateState {
  phase: IndexPhase
  message: string
  ready: boolean
  bookIndex: BookIndex | null
  lastError: string | null

  reset: () => void
  setImporting: (msg?: string) => void
  /**
   * After pages (+ OCR) are in the doc store: build A1 and embed.
   * Caller should run OCR first if needed.
   */
  finalizeIndex: (input: {
    docId: string
    pages: PageDocument[]
    ocrByStrand: Record<number, OcrPageResult>
  }) => Promise<BookIndex>
  /** Replace A1+V_book for selected pages only (manual OCR / retry). */
  syncPages: (input: {
    docId: string
    pages: PageDocument[]
    ocrByStrand: Record<number, OcrPageResult>
    pageIndices: number[]
  }) => Promise<BookIndex>
  /** Refresh one atom's T + V_book after confirm edit (handle unchanged). */
  syncAtomText: (input: {
    atomKey: string
    content: string
  }) => Promise<BookIndex | null>
  setError: (msg: string) => void
  setBookIndex: (index: BookIndex, ready?: boolean) => void
}

export const useIndexGate = create<IndexGateState>((set, get) => ({
  phase: 'idle',
  message: '尚未导入文献',
  ready: false,
  bookIndex: null,
  lastError: null,

  reset: () =>
    set({
      phase: 'idle',
      message: '尚未导入文献',
      ready: false,
      bookIndex: null,
      lastError: null,
    }),

  setImporting: (msg) =>
    set({
      phase: 'importing',
      message: msg ?? '正在导入…',
      ready: false,
      lastError: null,
    }),

  setError: (msg) =>
    set({
      phase: 'error',
      message: msg,
      ready: false,
      lastError: msg,
    }),

  setBookIndex: (index, ready = true) => {
    saveBookIndex(index)
    set({
      bookIndex: index,
      ready,
      phase: ready ? 'ready' : 'embedding',
      message: ready
        ? `文献就绪 · ${index.chunks.length} 段可检索`
        : '文献整理中…',
      lastError: null,
    })
  },

  finalizeIndex: async (input) => {
    set({
      phase: 'embedding',
      message: '正在整理文献…',
      ready: false,
      lastError: null,
    })
    try {
      const raw = await buildBookIndex(input)
      const { index } = await reembedBookIndex(raw)
      saveBookIndex(index)
      set({
        bookIndex: index,
        ready: true,
        phase: 'ready',
        message: `文献就绪 · ${index.chunks.length} 段可检索`,
        lastError: null,
      })
      return index
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({
        phase: 'error',
        message: msg,
        ready: false,
        lastError: msg,
      })
      throw e
    }
  },

  syncPages: async (input) => {
    const pagesLabel = [...input.pageIndices]
      .sort((a, b) => a - b)
      .map((p) => `s${p}`)
      .join(',')
    const prevReady = get().ready
    set({
      phase: 'embedding',
      message: `正在同步索引（${pagesLabel || '页'}）…`,
      lastError: null,
    })
    try {
      const existing =
        get().bookIndex && get().bookIndex!.docId === input.docId
          ? get().bookIndex
          : null
      const { index } = await rebuildPagesInBookIndex({
        existing,
        docId: input.docId,
        pages: input.pages,
        ocrByStrand: input.ocrByStrand,
        pageIndices: input.pageIndices,
      })
      saveBookIndex(index)
      set({
        bookIndex: index,
        ready: true,
        phase: 'ready',
        message: `文献就绪 · ${index.chunks.length} 段可检索（已同步 ${pagesLabel}）`,
        lastError: null,
      })
      return index
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({
        phase: prevReady ? 'ready' : 'error',
        ready: prevReady,
        message: prevReady
          ? `${get().bookIndex ? `文献就绪 · ${get().bookIndex!.chunks.length} 段可检索` : get().message} · 同步失败: ${msg}`
          : msg,
        lastError: msg,
      })
      throw e
    }
  },

  syncAtomText: async (input) => {
    const existing = get().bookIndex
    if (!existing) return null
    try {
      const { index, patched } = await patchAtomTextInBookIndex(
        existing,
        input.atomKey,
        input.content,
      )
      if (!patched) return existing
      saveBookIndex(index)
      set({
        bookIndex: index,
        ready: true,
        phase: 'ready',
        message: `文献就绪 · ${index.chunks.length} 段可检索（已更新 T）`,
        lastError: null,
      })
      return index
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ lastError: msg })
      throw e
    }
  },
}))
