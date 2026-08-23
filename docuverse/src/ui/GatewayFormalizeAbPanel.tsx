import { useEffect, useMemo, useState } from 'react'
import { useDocuverse } from '../canvas/store'
import { useFanout } from '../reasoning/fanoutStore'
import { useIndexGate } from '../reasoning/indexGate'
import {
  blocksFromInferUnit,
  buildAbInputFromUnit,
  runAbCompare,
  type AbArmResult,
  type AbCompareReport,
  type AbLogEvent,
  type AbRunMode,
} from '../reasoning/abCompareRunner'
import type { AbBlock, AbCompareInput } from '../reasoning/formalPath'
import { shortHandle } from '../reasoning/ocrSlot'

function keyTag(key: string): string {
  const s = shortHandle(key)
  return s.length > 0 ? s : key.slice(0, 12)
}

function ArmColumn({
  title,
  result,
  live,
  bag,
}: {
  title: string
  result: AbArmResult | null
  live: AbLogEvent[]
  bag: AbBlock[]
}) {
  const bagIndex = useMemo(() => {
    const m = new Map<string, number>()
    bag.forEach((b, i) => m.set(b.key, i))
    return m
  }, [bag])

  return (
    <div className="ab-arm">
      <header className="ab-arm-head">
        <h3>{title}</h3>
        {result && (
          <span className={`ab-badge${result.validateOk ? ' ok' : ' bad'}`}>
            {result.validateOk ? 'Validator ✓' : 'Validator ✗'}
            {' · '}
            {result.elapsedMs}ms
          </span>
        )}
      </header>

      <div className="ab-log" aria-live="polite">
        {(result?.phases ?? live).map((ev, i) => (
          <div key={`${ev.at}-${i}`} className="ab-log-line">
            <span className="ab-log-phase">{ev.phase}</span>
            <span>{ev.message}</span>
          </div>
        ))}
        {!result && live.length === 0 && <p className="meta">等待启动…</p>}
      </div>

      {result && (
        <div className="ab-result">
          {result.error && <p className="ab-error">{result.error}</p>}
          <h4>结论</h4>
          <pre className="ab-pre">{result.conclusion || '（空）'}</pre>
          <h4>人话路径</h4>
          <pre className="ab-pre">{result.pathText || '（无）'}</pre>
          <h4>配方 ops（身份坐标匹配）</h4>
          {result.formal ? (
            <div className="ab-ops">
              <p className="meta">
                usedKeys → 袋内序号：{' '}
                {result.formal.usedKeys
                  .map((k) => {
                    const i = bagIndex.get(k)
                    return i === undefined
                      ? `${keyTag(k)}(?偷键)`
                      : `#${i + 1}:${keyTag(k)}`
                  })
                  .join(' · ')}
              </p>
              <ol className="ab-ops-list">
                {result.formal.ops.map((o, idx) => (
                  <li key={idx}>
                    <code>{o.op}</code>
                    {' · '}
                    {o.keys
                      .map((k) => {
                        const i = bagIndex.get(k)
                        return i === undefined
                          ? `${keyTag(k)}✗`
                          : `#${i + 1}:${keyTag(k)}`
                      })
                      .join(' + ')}
                    <div className="ab-ops-claim">
                      <strong>claim</strong> {o.claim}
                    </div>
                    <div className="ab-ops-note">{o.note}</div>
                  </li>
                ))}
              </ol>
              <h4>formalConclusion</h4>
              <pre className="ab-pre">{result.formal.formalConclusion}</pre>
            </div>
          ) : (
            <pre className="ab-pre">（未通过或无配方）</pre>
          )}
          <p className="meta">
            校验：{result.validateMessage}
            {result.usedMock ? ' · mock' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 同输入并行：测试一（网关一体出配方）vs 测试二（网关 + 形式化）。
 * 可从写信台点选跨页/多槽单元，或手贴 JSON。
 */
export function GatewayFormalizeAbPanel() {
  const bookIndex = useIndexGate((s) => s.bookIndex)
  const letterSession = useFanout((s) => s.letterSession)
  const letterDesk = useFanout((s) => s.letterDesk)
  const lastQuestion = useFanout((s) => s.lastQuestion)
  const corpus = useDocuverse((s) => s.corpus)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [liveA, setLiveA] = useState<AbLogEvent[]>([])
  const [liveB, setLiveB] = useState<AbLogEvent[]>([])
  const [sharedLog, setSharedLog] = useState<AbLogEvent[]>([])
  const [report, setReport] = useState<AbCompareReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualJson, setManualJson] = useState('')
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [lastBag, setLastBag] = useState<AbBlock[]>([])
  const [runMode, setRunMode] = useState<AbRunMode>('serial')

  const deskRows = useMemo(() => {
    if (!letterSession || !letterDesk || !bookIndex) return []
    return letterDesk.rows.map((row) => {
      const unit = letterSession.units[row.index]
      const blocks = unit ? blocksFromInferUnit(unit, bookIndex) : []
      const pages = [
        ...new Set(
          blocks
            .map((b) => b.page)
            .filter((p): p is number => typeof p === 'number'),
        ),
      ].sort((a, b) => a - b)
      const multi = row.memberKeys.length >= 2
      const cross = pages.length >= 2
      return { row, unit, blocks, pages, multi, cross }
    })
  }, [letterSession, letterDesk, bookIndex])

  useEffect(() => {
    if (deskRows.length === 0) {
      setSelectedRowIndex(null)
      return
    }
    setSelectedRowIndex((prev) => {
      if (prev !== null && deskRows.some((d) => d.row.index === prev)) {
        return prev
      }
      const prefer =
        deskRows.find(
          (d) => d.row.decision === 'expand' && d.multi && d.cross,
        ) ??
        deskRows.find((d) => d.row.decision === 'expand' && d.multi) ??
        deskRows.find((d) => d.row.decision === 'expand') ??
        deskRows[0]
      return prefer.row.index
    })
  }, [deskRows])

  const deskPick = useMemo(() => {
    if (selectedRowIndex === null) return null
    return deskRows.find((d) => d.row.index === selectedRowIndex) ?? null
  }, [deskRows, selectedRowIndex])

  const onRun = async () => {
    if (!bookIndex && !manualJson.trim()) {
      setError('需要书索引或手动 JSON 输入')
      return
    }
    setBusy(true)
    setError(null)
    setReport(null)
    setLiveA([])
    setLiveB([])
    setSharedLog([])

    let input: AbCompareInput | null = null

    if (manualJson.trim()) {
      try {
        const parsed = JSON.parse(manualJson) as unknown
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          typeof (parsed as { question?: unknown }).question !== 'string' ||
          !Array.isArray((parsed as { blocks?: unknown }).blocks)
        ) {
          throw new Error('需 { question, blocks:[{key,text,page?}] }')
        }
        const p = parsed as AbCompareInput
        input = {
          question: p.question.trim(),
          blocks: p.blocks,
          unitLabel: p.unitLabel,
          fixtureId: p.fixtureId,
        }
      } catch (e) {
        setBusy(false)
        setError(e instanceof Error ? e.message : String(e))
        return
      }
    } else if (deskPick?.unit && bookIndex) {
      const built = buildAbInputFromUnit({
        question: letterSession?.question || lastQuestion || '',
        unit: deskPick.unit,
        bookIndex,
      })
      if ('error' in built) {
        setBusy(false)
        setError(built.error)
        return
      }
      input = built
    } else {
      setBusy(false)
      setError('请先打开写信台并勾选跨页/同页多槽，选中多槽单元，或粘贴 JSON')
      return
    }

    if (!input.question.trim()) {
      setBusy(false)
      setError('问题为空')
      return
    }
    if (input.blocks.length < 2 && !manualJson.trim()) {
      // allow run but warn
      setSharedLog([
        {
          arm: 'shared',
          at: Date.now(),
          phase: 'warn',
          message: `当前袋只有 ${input.blocks.length} 块 — 跨页多槽请选 member≥2 的单元`,
        },
      ])
    }

    setLastBag(input.blocks)

    try {
      const rep = await runAbCompare(
        input,
        (ev) => {
          if (ev.arm === 'A') setLiveA((prev) => [...prev, ev])
          else if (ev.arm === 'B') setLiveB((prev) => [...prev, ev])
          else setSharedLog((prev) => [...prev, ev])
        },
        runMode,
      )
      setReport(rep)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fanout-btn ab-launch"
        onClick={() => setOpen(true)}
        title="同输入并行跑测试一/测试二"
      >
        对照台 · 网关配方 vs 形式化
      </button>
    )
  }

  const bagForView = report?.input.blocks ?? lastBag

  return (
    <section className="ab-panel" aria-label="网关与形式化对照台">
      <header className="ab-panel-head">
        <div>
          <div className="ab-panel-title">对照台 · 测试一 ∥ 测试二</div>
          <p className="meta">
            先写信台勾选「同页多槽 / 跨页」再打开本台，点选多槽行；看 ops 里 #序号
            是否对齐袋内身份 · corpus={corpus || '—'}
          </p>
        </div>
        <button
          type="button"
          className="fanout-btn"
          onClick={() => setOpen(false)}
        >
          收起
        </button>
      </header>

      <div className="ab-input">
        {deskRows.length > 0 ? (
          <label className="fanout-field">
            <span>写信台单元（选跨页多槽）</span>
            <select
              className="fanout-input"
              disabled={busy || Boolean(manualJson.trim())}
              value={selectedRowIndex ?? ''}
              onChange={(e) =>
                setSelectedRowIndex(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            >
              {deskRows.map((d) => {
                const tags = [
                  d.cross ? '跨页' : d.pages.length === 1 ? `p${d.pages[0]}` : '',
                  d.multi ? `${d.row.memberKeys.length}槽` : '单槽',
                  d.row.decision,
                ]
                  .filter(Boolean)
                  .join('·')
                return (
                  <option key={d.row.index} value={d.row.index}>
                    #{d.row.index} {d.row.label} [{tags}]{' '}
                    {d.row.memberKeys.map(keyTag).join('+')}
                  </option>
                )
              })}
            </select>
          </label>
        ) : (
          <p className="meta">
            尚无写信台 — 勾选「跨页」后点「① 打开写信台」，或粘贴多块 JSON
          </p>
        )}

        {deskPick && !manualJson.trim() && (
          <div className="ab-bag">
            <div className="fanout-paths-label">
              当前木块袋（{deskPick.blocks.length}）· 页{' '}
              {deskPick.pages.map((p) => p + 1).join(',') || '?'}
              {deskPick.cross ? ' · 跨页' : ''}
              {deskPick.multi ? ' · 多槽' : ' · 单槽'}
            </div>
            <ul className="ab-bag-list">
              {deskPick.blocks.map((b, i) => (
                <li key={b.key}>
                  <strong>
                    #{i + 1} {keyTag(b.key)}
                  </strong>
                  {typeof b.page === 'number' ? ` · p${b.page + 1}` : ''}
                  <span className="meta"> · {b.key.slice(0, 28)}…</span>
                  <div className="ab-bag-text">{b.text.slice(0, 120)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="fanout-field">
          <span>手动夹具 JSON（可选，优先；跨页示例见下）</span>
          <textarea
            rows={3}
            value={manualJson}
            onChange={(e) => setManualJson(e.target.value)}
            placeholder='{"question":"…","blocks":[{"key":"…","text":"…","page":0},{"key":"…","text":"…","page":5}]}'
            disabled={busy}
          />
        </label>
        <div className="fanout-actions">
          <label className="fanout-check">
            <input
              type="radio"
              name="abRunMode"
              checked={runMode === 'serial'}
              disabled={busy}
              onChange={() => setRunMode('serial')}
            />
            串行（先一后二，默认）
          </label>
          <label className="fanout-check">
            <input
              type="radio"
              name="abRunMode"
              checked={runMode === 'parallel'}
              disabled={busy}
              onChange={() => setRunMode('parallel')}
            />
            并行（易抢上游）
          </label>
          <button
            type="button"
            className="fanout-btn primary"
            disabled={busy}
            onClick={() => void onRun()}
          >
            {busy
              ? runMode === 'serial'
                ? '串行对照中…'
                : '并行对照中…'
              : '启动对照'}
          </button>
        </div>
        {error && <p className="ab-error">{error}</p>}
        {sharedLog.length > 0 && (
          <div className="ab-shared">
            {sharedLog.map((ev, i) => (
              <span key={`${ev.at}-${i}`} className="meta">
                {ev.message}
                {i < sharedLog.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ab-columns">
        <ArmColumn
          title="测试一 · 网关一体"
          result={report?.armA ?? null}
          live={liveA}
          bag={bagForView}
        />
        <ArmColumn
          title="测试二 · 网关+形式化"
          result={report?.armB ?? null}
          live={liveB}
          bag={bagForView}
        />
      </div>
    </section>
  )
}
