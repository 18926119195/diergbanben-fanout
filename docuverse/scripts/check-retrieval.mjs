import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL && !specifier.endsWith('.ts')) {
      const target = new URL(specifier + '.ts', context.parentURL)
      if (target.protocol === 'file:' && existsSync(fileURLToPath(target))) {
        return nextResolve(target.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context)
    if (url.endsWith('/demoAuth.ts') || url.endsWith('/modelRuntimeConfig.ts')) {
      return {
        ...loaded,
        source: Buffer.from(loaded.source).toString().replaceAll('import.meta.env', '({})'),
      }
    }
    return loaded
  },
})
const src = new URL('../src/reasoning/', import.meta.url)
const { executeRetrieve } = await import(new URL('toolGateway.ts', src))
const { rankSections } = await import(new URL('semanticIndex.ts', src))
const question = 'alpha beta gamma'
const make = (ord, key, content, vBook) => ({
  ord, id: key, page: ord, bbox: [0, 0, 100, 100], start: 0, end: content.length,
  source: 'ocr', kind: 'text', key, slotK: 0, faces: { text: { content, start: 0, end: content.length } }, content, vBook,
})
const bookIndex = {
  docId: 'fixture', stream: '', builtAt: 0, chunks: [
    make(0, 'outside', 'alpha beta gamma identical term match', [1, 0]),
    make(1, 'inside', 'alpha archival context', [0.8, 0.6]),
    make(2, 'noise', 'otherwise unrelated paragraphs', [0, 1]),
  ],
}
const sections = [
  { nodeId: 'outside-page', title: 'Outside range', summary: 'unmatched other sections', page: 0 },
  { nodeId: 'inside-page', title: 'alpha beta gamma', summary: '', page: 1 },
]
const semanticIndex = { sections, provenance: [{ key: 'outside', primaryNodeId: 'outside-page' }, { key: 'inside', primaryNodeId: 'inside-page' }] }
globalThis.fetch = async (url) => {
  assert.equal(url, '/api/llm/embeddings')
  return Response.json({ data: [{ embedding: [1, 0] }] })
}
assert.deepEqual(rankSections(semanticIndex, question).map(hit => hit.node.nodeId), ['inside-page'])
for (const [topK, expected] of [[1, ['outside']], [2, ['inside']]]) {
  const { action, poolSize, candidates } = await executeRetrieve({ bookIndex, question, topK, semanticIndex })
  assert.equal(poolSize, 3)
  assert.deepEqual(action.premiseKeys, [])
  assert.deepEqual(action.outputsRef.draftKeys, expected)
  console.log({ scope: 'inside-page', topK, poolSize, draftKeys: candidates.map(candidate => candidate.R.key) })
}
