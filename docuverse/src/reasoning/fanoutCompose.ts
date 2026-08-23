/**
 * Letter writer: build inference units (member_keys) from draft hits + ComposePolicy.
 */

import type { BookIndex, CircleCandidate, AChunk } from './pipelineA'
import { atomToCandidate } from './pipelineA'
import {
  defaultComposePolicy,
  type ComposePolicy,
} from './composePolicy'

export type FanoutUnitKind = 'fine' | 'window' | 'cluster' | 'cross'

export interface FanoutInferUnit {
  kind: FanoutUnitKind
  label: string
  candidate: CircleCandidate
}

function chunkByKey(index: BookIndex, key: string): AChunk | undefined {
  return index.chunks.find((c) => c.key === key)
}

function scored(
  chunk: AChunk,
  score: number,
): AChunk & { score: number } {
  return { ...chunk, score }
}

function contiguousByOrd(
  hits: Array<AChunk & { score: number }>,
): Array<Array<AChunk & { score: number }>> {
  if (hits.length === 0) return []
  const sorted = [...hits].sort((a, b) => a.ord - b.ord)
  const runs: Array<Array<AChunk & { score: number }>> = []
  let cur: Array<AChunk & { score: number }> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = cur[cur.length - 1]
    if (sorted[i].ord === prev.ord + 1 && sorted[i].kind === prev.kind) {
      cur.push(sorted[i])
    } else {
      runs.push(cur)
      cur = [sorted[i]]
    }
  }
  runs.push(cur)
  return runs
}

function expandWindow(
  index: BookIndex,
  center: AChunk,
  score: number,
  radius: number,
): Array<AChunk & { score: number }> {
  const pageChunks = index.chunks
    .filter((c) => c.page === center.page && c.kind === center.kind)
    .sort((a, b) => a.ord - b.ord)
  const at = pageChunks.findIndex((c) => c.key === center.key)
  if (at < 0) return [scored(center, score)]
  const from = Math.max(0, at - radius)
  const to = Math.min(pageChunks.length - 1, at + radius)
  const run: Array<AChunk & { score: number }> = []
  for (let i = from; i <= to; i++) {
    const c = pageChunks[i]
    run.push(scored(c, c.key === center.key ? score : score * 0.85))
  }
  return run
}

function unitKey(c: CircleCandidate): string {
  const members = c.R.memberKeys?.length
    ? [...c.R.memberKeys].sort()
    : [c.R.key]
  return members.join('\0')
}

function runKey(run: Array<AChunk & { score: number }>): string {
  return [...run.map((c) => c.key)].sort().join('\0')
}

function pagesOf(run: Array<AChunk & { score: number }>): number[] {
  return [...new Set(run.map((c) => c.page))].sort((a, b) => a - b)
}

function crossAllowed(
  pages: number[],
  policy: ComposePolicy,
): boolean {
  if (pages.length < 2) return false
  if (policy.crossMode === 'pages') {
    const allow = new Set(policy.crossPages)
    if (allow.size < 2) return false
    return pages.every((p) => allow.has(p))
  }
  if (policy.crossMode === 'span') {
    const lo = pages[0]
    const hi = pages[pages.length - 1]
    return hi - lo <= policy.crossSpan
  }
  return true
}

/**
 * Build inference units from draft hits according to letter-writing policy.
 */
export async function composeFanoutUnits(
  bookIndex: BookIndex,
  fineCandidates: CircleCandidate[],
  options?: Partial<ComposePolicy>,
): Promise<FanoutInferUnit[]> {
  const policy: ComposePolicy = {
    ...defaultComposePolicy(),
    ...options,
    crossPages: options?.crossPages
      ? [...options.crossPages]
      : defaultComposePolicy().crossPages,
  }
  const out: FanoutInferUnit[] = []
  const seen = new Set<string>()

  const push = async (
    kind: FanoutUnitKind,
    label: string,
    run: Array<AChunk & { score: number }>,
  ) => {
    if (run.length === 0) return
    const uk = runKey(run)
    if (seen.has(uk)) return
    const candidate = await atomToCandidate(
      bookIndex.docId,
      run,
      `fanout_${kind}`,
    )
    if (run.length === 1) {
      candidate.excerpt =
        candidate.R.faces.text?.content?.trim() || candidate.excerpt
    }
    // Also dedupe by minted member set
    const mk = unitKey(candidate)
    if (seen.has(mk)) return
    seen.add(uk)
    seen.add(mk)
    out.push({ kind, label, candidate })
  }

  const hitChunks: Array<AChunk & { score: number }> = []
  for (const fine of fineCandidates) {
    const chunk = chunkByKey(bookIndex, fine.R.key)
    if (chunk) hitChunks.push(scored(chunk, fine.score))
  }

  // 1) Fine
  if (policy.includeFine) {
    for (const fine of fineCandidates) {
      const chunk = chunkByKey(bookIndex, fine.R.key)
      if (!chunk) {
        const uk = unitKey(fine)
        if (!seen.has(uk)) {
          seen.add(uk)
          out.push({ kind: 'fine', label: '细槽', candidate: fine })
        }
        continue
      }
      await push('fine', '细槽', [scored(chunk, fine.score)])
    }
  }

  // 2) Window
  if (policy.includeWindow) {
    for (const fine of fineCandidates) {
      const chunk = chunkByKey(bookIndex, fine.R.key)
      if (!chunk) continue
      const run = expandWindow(
        bookIndex,
        chunk,
        fine.score,
        policy.windowRadius,
      )
      if (run.length <= 1) continue
      await push('window', `邻接窗×${run.length}`, run)
    }
  }

  // Same-page bags (also used as cross-page parts when cluster on)
  const pageBags: Array<Array<AChunk & { score: number }>> = []
  const byPage = new Map<number, Array<AChunk & { score: number }>>()
  for (const h of hitChunks) {
    const list = byPage.get(h.page) ?? []
    list.push(h)
    byPage.set(h.page, list)
  }

  // 3) Same-page clusters
  if (policy.includeSamePageCluster) {
    for (const [, pageHits] of byPage) {
      for (const run of contiguousByOrd(pageHits)) {
        if (run.length <= 1) continue
        await push('cluster', `同页连续×${run.length}`, run)
      }
      if (pageHits.length >= 2) {
        const sorted = [...pageHits].sort((a, b) => a.ord - b.ord)
        const contig = contiguousByOrd(pageHits)
        const alreadyContiguous =
          contig.length === 1 && contig[0].length === pageHits.length
        if (!alreadyContiguous) {
          await push('cluster', `同页组合×${sorted.length}`, sorted)
        }
        pageBags.push(sorted)
      } else if (pageHits.length === 1) {
        pageBags.push(pageHits)
      }
    }
  } else {
    for (const [, pageHits] of byPage) {
      pageBags.push([...pageHits].sort((a, b) => a.ord - b.ord))
    }
  }

  // 4) Cross-page
  if (policy.includeCrossPage) {
    const maxUnits = Math.max(1, policy.crossMaxUnits)
    let crossCount = 0

    // Pair page-bags across pages (stable, fewer combos than all slot pairs)
    const bags = pageBags.length > 0 ? pageBags : hitChunks.map((h) => [h])
    for (let i = 0; i < bags.length && crossCount < maxUnits; i++) {
      for (let j = i + 1; j < bags.length && crossCount < maxUnits; j++) {
        const pagesI = pagesOf(bags[i])
        const pagesJ = pagesOf(bags[j])
        if (pagesI.length !== 1 || pagesJ.length !== 1) continue
        if (pagesI[0] === pagesJ[0]) continue
        const merged = [...bags[i], ...bags[j]].sort((a, b) =>
          a.page === b.page ? a.ord - b.ord : a.page - b.page,
        )
        const pages = pagesOf(merged)
        if (!crossAllowed(pages, policy)) continue
        const label = `跨页 p${pages.map((p) => p + 1).join('+')}×${merged.length}`
        const before = out.length
        await push('cross', label, merged)
        if (out.length > before) crossCount += 1
      }
    }

    // Also pair individual fine hits across pages (when bags were multi-slot,
    // this adds finer cross pairs; still deduped by member set)
    if (crossCount < maxUnits && hitChunks.length >= 2) {
      for (let i = 0; i < hitChunks.length && crossCount < maxUnits; i++) {
        for (
          let j = i + 1;
          j < hitChunks.length && crossCount < maxUnits;
          j++
        ) {
          if (hitChunks[i].page === hitChunks[j].page) continue
          const merged = [hitChunks[i], hitChunks[j]]
          const pages = pagesOf(merged)
          if (!crossAllowed(pages, policy)) continue
          const label = `跨页槽 p${pages.map((p) => p + 1).join('+')}`
          const before = out.length
          await push('cross', label, merged)
          if (out.length > before) crossCount += 1
        }
      }
    }
  }

  return out
}
