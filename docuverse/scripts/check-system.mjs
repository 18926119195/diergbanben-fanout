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
    if (url.endsWith('/demoAuth.ts')) {
      return {
        ...loaded,
        source: Buffer.from(loaded.source).toString().replaceAll('import.meta.env.', '({}).'),
      }
    }
    return loaded
  },
})

const src = new URL('../src/reasoning/', import.meta.url)
const { inferWithMicroLoop } = await import(new URL('microLoop.ts', src))
const { emptyWorkingSet } = await import(new URL('harnessTypes.ts', src))
const key = 'synthetic-slot'
const question = 'Fixture question'
const workingSet = emptyWorkingSet()
const unit = { kind: 'fine', label: 'Fixture', candidate: { R: { key } } }
const initialPlan = { rank: 1, planId: 'fixture', action: 'expand', faultInKeys: [key], collapseKeys: [], unitKey: key, score: 1, rationale: 'Fixture' }
const common = {
  unit, question, workingSet, initialPlan,
  bookIndex: { docId: 'fixture', chunks: [{ key, page: 1, faces: { text: { content: 'Fixture text' } } }] },
  ctx: { working: { question, currentMemory: [] } },
  brainInput: {
    question, docId: 'fixture', workingSet, composeCandidates: [{ unitKey: key, kind: 'fine', label: 'Fixture', memberKeys: [key] }],
    forbidPatterns: [], reuseHits: [], currentMemory: [], archivePaths: [], expandBudget: 1, maxKeysPerPlan: 1,
  },
}

let calls = 0
let succeedsAt = Infinity
globalThis.fetch = async (url, options) => {
  assert.equal(url, '/api/protocol/infer-ops')
  assert.equal(JSON.parse(options.body).blocks[0].key, key)
  calls++
  if (calls < succeedsAt) {
    return Response.json({ ok: false, error: 'Upstream fixture failure ' + calls }, { status: 502 })
  }
  return Response.json({
    ok: true, usedKeys: [key], conclusion: 'Fixture conclusion',
    ops: ['attend', 'infer', 'conclude'].map((op) => ({ op, keys: [key], note: '', claim: 'A substantive fixture claim' })),
  })
}

const cases = [
  { name: 'terminal failure default', expectedCalls: 3, ok: false },
  { name: 'terminal failure zero retry', maxLoops: 0, expectedCalls: 1, ok: false },
  { name: 'success first attempt', succeedsAt: 1, expectedCalls: 1, ok: true },
  { name: 'success on retry', succeedsAt: 2, expectedCalls: 2, ok: true },
]
let failed = 0
for (const spec of cases) {
  calls = 0
  succeedsAt = spec.succeedsAt ?? Infinity
  const observed = await inferWithMicroLoop({ ...common, maxLoops: spec.maxLoops })
  console.log(spec.name, { calls, tracked: observed.plansTried.length, retryCount: observed.loopCount, ok: observed.result.ok, terminalError: observed.result.error })
  try {
    assert.equal(calls, spec.expectedCalls)
    assert.equal(observed.plansTried.length, calls)
    assert.equal(observed.loopCount, calls - 1)
    assert.equal(observed.result.ok, spec.ok)
    if (!spec.ok) assert.equal(observed.result.error, 'Upstream fixture failure ' + spec.expectedCalls)
  } catch (error) {
    failed++
    console.error(error.message)
  }
}
process.exitCode = failed ? 1 : 0
