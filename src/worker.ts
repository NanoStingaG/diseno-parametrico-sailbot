import { analyze } from './core/solver'
import { toView } from './core/view'
import { setPath } from './core/path'
import type { Design } from './core/types'

export type WorkerRequest =
  | { type: 'analyze'; id: number; design: Design }
  | { type: 'sweep'; id: number; design: Design; path: string; values: number[] }
  | { type: 'compare'; id: number; design: Design }

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'analyze' || msg.type === 'compare') {
      const v = toView(analyze(msg.design))
      ;(self as unknown as Worker).postMessage({ type: msg.type, id: msg.id, view: v })
    } else if (msg.type === 'sweep') {
      const rows: { value: number; metrics: Record<string, number>; warnings: number }[] = []
      msg.values.forEach((val, i) => {
        const d = setPath(msg.design, msg.path, val)
        const v = toView(analyze(d, { fast: true, skipCurves: true }))
        rows.push({ value: val, metrics: v.metrics, warnings: v.warnings.filter((w) => w.level === 'error').length })
        ;(self as unknown as Worker).postMessage({ type: 'sweep-progress', id: msg.id, done: i + 1, total: msg.values.length })
      })
      ;(self as unknown as Worker).postMessage({ type: 'sweep', id: msg.id, rows })
    }
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ type: 'error', id: msg.id, error: String((e as Error)?.stack ?? e) })
  }
}
