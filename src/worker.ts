import { analyze } from './core/solver'
import { toView } from './core/view'
import { setPath } from './core/path'
import { designCurves, map2d, optimize, profilePolars, sensitivity, speedPolar, type OptSettings } from './core/studies'
import { applyFixed } from './core/fixed'
import type { Design } from './core/types'

export type WorkerRequest =
  | { type: 'analyze'; id: number; design: Design }
  | { type: 'compare'; id: number; design: Design }
  | { type: 'curves'; id: number; design: Design; twsList: number[] }
  | { type: 'profile'; id: number; design: Design }
  | { type: 'sweep'; id: number; design: Design; path: string; values: number[] }
  | { type: 'map'; id: number; design: Design; pathX: string; xs: number[]; pathY: string; ys: number[] }
  | { type: 'sensitivity'; id: number; design: Design; fields: { path: string; label: string }[]; step: number }
  | { type: 'optimize'; id: number; design: Design; settings: OptSettings }

const post = (m: unknown) => (self as unknown as Worker).postMessage(m)

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  const progress = (task: string) => (done: number, total: number, note?: string) => post({ type: 'progress', id: msg.id, task, done, total, note })
  try {
    switch (msg.type) {
      case 'analyze':
      case 'compare': {
        post({ type: msg.type, id: msg.id, view: toView(analyze(msg.design)) })
        break
      }
      case 'curves': {
        post({ type: 'curves', id: msg.id, curves: designCurves(msg.design, { twsList: msg.twsList, progress: progress('curves') }) })
        break
      }
      case 'profile': {
        post({ type: 'profile', id: msg.id, profile: profilePolars(msg.design) })
        break
      }
      case 'sweep': {
        const rows: { value: number; metrics: Record<string, number>; warnings: number }[] = []
        const p = progress('sweep')
        msg.values.forEach((val, i) => {
          const d = setPath(msg.design, msg.path, val)
          const v = toView(analyze(d, { fast: true, skipCurves: true }))
          rows.push({ value: val, metrics: v.metrics, warnings: v.warnings.filter((w) => w.level === 'error').length })
          p(i + 1, msg.values.length)
        })
        post({ type: 'sweep', id: msg.id, rows })
        break
      }
      case 'map': {
        post({ type: 'map', id: msg.id, map: map2d(msg.design, msg.pathX, msg.xs, msg.pathY, msg.ys, progress('map')) })
        break
      }
      case 'sensitivity': {
        post({ type: 'sensitivity', id: msg.id, sens: sensitivity(msg.design, msg.fields, msg.step, progress('sensitivity')) })
        break
      }
      case 'optimize': {
        const res = optimize(msg.design, msg.settings, (p) => post({ type: 'optimize-progress', id: msg.id, progress: p }))
        // polares de velocidades del diseño base y del óptimo, con el viento actual
        let bestDesign: Design = msg.design
        if (res.best) {
          for (let i = 0; i < msg.settings.variables.length; i++) bestDesign = setPath(bestDesign, msg.settings.variables[i].path, res.best.values[i])
        }
        const tws = applyFixed(msg.design).env.tws
        post({ type: 'optimize-progress', id: msg.id, progress: res, note: 'Calculando polares de comparación…' })
        const polars = { base: speedPolar(msg.design, tws), best: speedPolar(bestDesign, tws) }
        post({ type: 'optimize', id: msg.id, result: res, polars, bestDesign })
        break
      }
    }
  } catch (e) {
    post({ type: 'error', id: msg.id, task: msg.type, error: String((e as Error)?.stack ?? e) })
  }
}
