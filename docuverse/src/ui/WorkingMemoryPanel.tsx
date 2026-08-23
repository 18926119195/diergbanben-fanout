/**
 * Working memory panel: render formal ops as step bar; key click → PDF focus.
 */

import type { FormalOp } from '../reasoning/formalPath'
import { extractFormalOps } from '../reasoning/harnessContext'
import type { FanoutPath } from '../reasoning/types'
import { shortHandle } from '../reasoning/ocrSlot'

const OP_LABEL: Record<FormalOp['op'], string> = {
  attend: '读',
  infer: '推',
  combine: '并',
  contrast: '对',
  conclude: '结',
  defer: '缓',
}

export interface WorkingMemoryPanelProps {
  path: FanoutPath | null
  selectedKey: string | null
  onKeyClick: (key: string, page: number) => void
}

function opsOf(path: FanoutPath | null): FormalOp[] {
  if (!path) return []
  return extractFormalOps(path)
}

function pageForKey(path: FanoutPath, key: string): number {
  const slot = path.slots.find((s) => s.key === key)
  if (slot) return slot.page
  const idx = (path.direction.premiseKeys ?? []).indexOf(key)
  if (idx >= 0 && path.premisePages[idx] != null) {
    return path.premisePages[idx]
  }
  return path.premisePages[0] ?? 0
}

export function WorkingMemoryPanel({
  path,
  selectedKey,
  onKeyClick,
}: WorkingMemoryPanelProps) {
  const ops = opsOf(path)

  if (!path) {
    return (
      <div className="working-memory">
        <div className="fanout-k">工作记忆 · ops</div>
        <p className="fanout-hint">选择一条路径后显示推导步骤</p>
      </div>
    )
  }

  if (ops.length === 0) {
    const keys =
      path.direction.premiseKeys?.length
        ? path.direction.premiseKeys
        : path.slots.map((s) => s.key)
    return (
      <div className="working-memory">
        <div className="fanout-k">工作记忆 · 前提 key*</div>
        <div className="fanout-chips">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className={
                selectedKey === key ? 'fanout-chip active' : 'fanout-chip'
              }
              onClick={() => onKeyClick(key, pageForKey(path, key))}
              title={key}
            >
              {shortHandle(key)}
            </button>
          ))}
        </div>
        {path.direction.pathMarker ? (
          <pre className="fanout-path-marker">{path.direction.pathMarker}</pre>
        ) : null}
        <p className="fanout-hint">尚无 formal ops；显示前提句柄与 pathMarker</p>
      </div>
    )
  }

  return (
    <div className="working-memory">
      <div className="fanout-k">工作记忆 · ops 步骤条</div>
      <ol className="working-memory-ops">
        {ops.map((step, i) => (
          <li key={`${step.op}-${i}`} className="working-memory-op">
            <span className="op-badge">{OP_LABEL[step.op]}</span>
            <span className="op-kind">{step.op}</span>
            <div className="fanout-chips op-keys">
              {step.keys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={
                    selectedKey === key ? 'fanout-chip active' : 'fanout-chip'
                  }
                  onClick={() => onKeyClick(key, pageForKey(path, key))}
                  title={key}
                >
                  {shortHandle(key)}
                </button>
              ))}
            </div>
            {step.note ? (
              <div className="op-note">{step.note}</div>
            ) : null}
            <div className="op-claim">{step.claim}</div>
          </li>
        ))}
      </ol>
      {path.direction.pathMarker ? (
        <>
          <div className="fanout-k">pathMarker（机读接力）</div>
          <pre className="fanout-path-marker">{path.direction.pathMarker}</pre>
        </>
      ) : null}
    </div>
  )
}
