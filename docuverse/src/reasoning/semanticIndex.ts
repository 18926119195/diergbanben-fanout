/**
 * BookSemanticIndex: section tree + slot provenance (semantic map over A1).
 */

import type { BookIndex } from './pipelineA'
import { atomSearchText, tokenizeQuery, lexicalOverlap } from './hybridRetrieve'
import { textToProbe } from './lexicalProbe'

export type SectionSource = 'ocr_title' | 'page_header' | 'heuristic'

export interface SectionNode {
  nodeId: string
  docId: string
  page: number
  title: string
  summary: string
  source: SectionSource
  probe?: number[]
  parentId?: string
  ord: number
}

export type SlotRole = 'body' | 'title' | 'caption' | 'figure'

export interface SlotProvenance {
  key: string
  primaryNodeId: string
  secondaryNodeIds?: string[]
  role: SlotRole
}

export interface BookSemanticIndex {
  docId: string
  sections: SectionNode[]
  provenance: SlotProvenance[]
  builtAt: number
}

const TITLE_MAX_LEN = 96
const TITLE_TOP_Y = 220

function isTitleLike(text: string, bbox: [number, number, number, number]): boolean {
  const t = text.trim()
  if (!t || t.length > TITLE_MAX_LEN) return false
  if (bbox[1] > TITLE_TOP_Y) return false
  if (/^第\s*[0-9一二三四五六七八九十百千]+/.test(t)) return true
  if (/^(chapter|section|part)\s/i.test(t)) return true
  if (/^[0-9]+(\.[0-9]+)*\s+\S/.test(t)) return true
  if (t.length <= 40 && !/[。！？；，,.!?;]$/.test(t)) return true
  return false
}

function roleOfChunk(kind: string, isTitle: boolean): SlotRole {
  if (isTitle) return 'title'
  if (kind === 'fig') return 'figure'
  return 'body'
}

/**
 * Build semantic index from A1: one section per page + title heuristic + slot provenance.
 */
export function buildSemanticIndex(bookIndex: BookIndex): BookSemanticIndex {
  const docId = bookIndex.docId
  const byPage = new Map<number, typeof bookIndex.chunks>()
  for (const c of bookIndex.chunks) {
    const list = byPage.get(c.page) ?? []
    list.push(c)
    byPage.set(c.page, list)
  }

  const sections: SectionNode[] = []
  const provenance: SlotProvenance[] = []
  const pages = [...byPage.keys()].sort((a, b) => a - b)

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    const chunks = [...(byPage.get(page) ?? [])].sort(
      (a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0],
    )

    let title = `第 ${page + 1} 页`
    let source: SectionSource = 'heuristic'
    for (const c of chunks) {
      const text = atomSearchText(c)
      if (isTitleLike(text, c.bbox)) {
        title = text.slice(0, TITLE_MAX_LEN)
        source = c.source === 'ocr' ? 'ocr_title' : 'page_header'
        break
      }
    }

    const summaryParts = chunks
      .slice(0, 4)
      .map((c) => atomSearchText(c).slice(0, 80))
      .filter(Boolean)
    const summary = summaryParts.join(' · ').slice(0, 240)

    const nodeId = `sec_${docId}_p${page}`
    sections.push({
      nodeId,
      docId,
      page,
      title,
      summary,
      source,
      probe: textToProbe(`${title} ${summary}`),
      ord: pi,
    })

    for (const c of chunks) {
      const text = atomSearchText(c)
      const isTitle = isTitleLike(text, c.bbox)
      provenance.push({
        key: c.key,
        primaryNodeId: nodeId,
        role: roleOfChunk(c.kind, isTitle),
      })
    }
  }

  return {
    docId,
    sections,
    provenance,
    builtAt: Date.now(),
  }
}

export function provenanceByKey(
  index: BookSemanticIndex,
): Map<string, SlotProvenance> {
  return new Map(index.provenance.map((p) => [p.key, p]))
}

export function sectionById(
  index: BookSemanticIndex,
  nodeId: string,
): SectionNode | undefined {
  return index.sections.find((s) => s.nodeId === nodeId)
}

/** Section-level hit: lexical overlap on title + summary */
export function rankSections(
  index: BookSemanticIndex,
  question: string,
  topK = 5,
): Array<{ node: SectionNode; score: number }> {
  const q = question.trim()
  if (!q) return []
  const hits = index.sections.map((node) => {
    const text = `${node.title} ${node.summary}`
    const score = lexicalOverlap(q, text)
    return { node, score }
  })
  return hits
    .filter((h) => h.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/** Restrict draft keys to those belonging to hit sections */
export function keysInSections(
  index: BookSemanticIndex,
  sectionIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const p of index.provenance) {
    if (sectionIds.has(p.primaryNodeId)) out.add(p.key)
  }
  return out
}

export function sectionHitNote(
  hits: Array<{ node: SectionNode; score: number }>,
): string {
  if (hits.length === 0) return ''
  return hits
    .slice(0, 3)
    .map((h) => `${h.node.title}(p${h.node.page + 1}:${h.score.toFixed(2)})`)
    .join(' · ')
}

export function tokenOverlapSectionScore(question: string, node: SectionNode): number {
  const qt = new Set(tokenizeQuery(question))
  const st = new Set(tokenizeQuery(`${node.title} ${node.summary}`))
  if (qt.size === 0 || st.size === 0) return 0
  let inter = 0
  for (const t of qt) if (st.has(t)) inter += 1
  return inter / Math.sqrt(qt.size * st.size)
}
