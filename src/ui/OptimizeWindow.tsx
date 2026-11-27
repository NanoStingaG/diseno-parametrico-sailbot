import { useMemo, useRef, useState } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot } from './Plot'
import { SWEEP_FIELDS } from './params'
import { SpeedPolar } from './SpeedPolar'
import { ProgressBar, type TaskProgress } from './CurvesWindow'
import { useWorker, type WorkerMessage } from './useWorker'
import { C1, C2, C3, C4, GREY, SERIES } from './colors'
import { METRICS, type AnalysisView } from '../core/view'
import { getPath, setPath } from '../core/path'
import type { Design } from '../core/types'
import type { MapResult, OptProgress, OptSettings, OptVariable, PolarCurve } from '../core/studies'

// ---------- estado y worker de los estudios (vive en App para no perderse al cambiar de ventana) ----------

export interface SweepResult {
  path: string
  rows: { value: number; metrics: Record<string, number>; warnings: number }[]
}

export interface OptState {
  settings: OptSettings
  progress: OptProgress | null
  polars: { base: PolarCurve; best: PolarCurve } | null
  bestDesign: Design | null
  done: boolean
  stopped: boolean
  note?: string
}

export type StudyTask = 'sweep' | 'map' | 'optimize' | 'compare'

export function useStudies() {
  const [sweep, setSweep] = useState<SweepResult | null>(null)
  const [map, setMap] = useState<MapResult | null>(null)
  const [opt, setOpt] = useState<OptState | null>(null)
  const [compare, setCompare] = useState<AnalysisView[]>([])
  const [running, setRunning] = useState<{ task: StudyTask; progress: TaskProgress } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useRef(0)
  const sweepPath = useRef('')
  const w = useWorker((m: WorkerMessage) => {
    if (m.id !== id.current) return
    if (m.type === 'progress') setRunning((r) => (r ? { ...r, progress: { done: m.done, total: m.total, note: m.note } } : r))
    else if (m.type === 'sweep') {
      setSweep({ path: sweepPath.current, rows: m.rows })
      setRunning(null)
    } else if (m.type === 'map') {
      setMap(m.map)
      setRunning(null)
    } else if (m.type === 'compare') {
      setCompare((c) => [...c, m.view].slice(-4))
      setRunning(null)
    } else if (m.type === 'optimize-progress') {
      const p = m.progress as OptProgress
      setOpt((o) => (o ? { ...o, progress: p, note: m.note } : o))
      setRunning((r) => (r ? { ...r, progress: { done: p.evals, total: p.maxEvals, note: m.note } } : r))
    } else if (m.type === 'optimize') {
      setOpt((o) => (o ? { ...o, progress: m.result, polars: m.polars, bestDesign: m.bestDesign, done: true, note: undefined } : o))
      setRunning(null)
    } else if (m.type === 'error') {
      setError(m.error)
      setRunning(null)
    }
  })
  const start = (task: StudyTask, total: number) => {
    id.current += 1
    setError(null)
    setRunning({ task, progress: { done: 0, total } })
    return id.current
  }
  return {
    sweep,
    map,
    opt,
    compare,
    running,
    error,
    runSweep: (design: Design, path: string, values: number[]) => {
      sweepPath.current = path
      w.post({ type: 'sweep', id: start('sweep', values.length), design, path, values })
    },
    runMap: (design: Design, pathX: string, xs: number[], pathY: string, ys: number[]) => {
      w.post({ type: 'map', id: start('map', xs.length * ys.length), design, pathX, xs, pathY, ys })
    },
    runOptimize: (design: Design, settings: OptSettings) => {
      setOpt({ settings, progress: null, polars: null, bestDesign: null, done: false, stopped: false })
      w.post({ type: 'optimize', id: start('optimize', settings.maxEvals), design, settings })
    },
    addCompare: (design: Design) => w.post({ type: 'compare', id: start('compare', 1), design }),
    removeCompare: (i: number) => setCompare((c) => c.filter((_, j) => j !== i)),
    stop: () => {
      w.restart()
      id.current += 1
      setRunning(null)
      setOpt((o) => (o && !o.done ? { ...o, stopped: true, done: true } : o))
    },
  }
}

export type Studies = ReturnType<typeof useStudies>

// ---------- ventana ----------

type Sub = 'sweep' | 'map' | 'opt' | 'compare'
const SUBS: { id: Sub; label: string }[] = [
  { id: 'opt', label: 'Optimizador' },
  { id: 'sweep', label: 'Barrido de un parámetro' },
  { id: 'map', label: 'Mapa de dos parámetros' },
  { id: 'compare', label: 'Comparar variantes' },
]

export function OptimizeWindow({ design, onApply, st }: { design: Design; onApply: (d: Design) => void; st: Studies }) {
  const [sub, setSub] = useState<Sub>('opt')
  return (
    <div className="window">
      <nav className="subtabs">
        {SUBS.map((s) => (
          <button key={s.id} className={sub === s.id ? 'active' : ''} onClick={() => setSub(s.id)}>
            {s.label}
          </button>
        ))}
        {st.running && (
          <>
            <ProgressBar p={st.running.progress} label={SUBS.find((s) => s.id === (st.running!.task === 'optimize' ? 'opt' : st.running!.task))?.label ?? ''} />
            <button className="btn" onClick={st.stop}>
              Detener
            </button>
          </>
        )}
      </nav>
      {st.error && <pre className="error">{st.error}</pre>}
      {sub === 'sweep' && <SweepPanel design={design} st={st} />}
      {sub === 'map' && <MapPanel design={design} st={st} />}
      {sub === 'opt' && <OptimizerPanel design={design} st={st} onApply={onApply} />}
      {sub === 'compare' && <ComparePanel design={design} st={st} />}
    </div>
  )
}

const FIELDS = SWEEP_FIELDS.filter((f) => f.path !== 'env.tws' && f.path !== 'env.twa' && f.path !== 'control.alpha')
const ALL_FIELDS = SWEEP_FIELDS
const metricMeta = (k: string) => METRICS.find((m) => m.key === k) ?? { key: k, label: k, unit: '' }

function defaultRange(design: Design, path: string): [number, number] {
  const f = ALL_FIELDS.find((x) => x.path === path)!
  const cur = Number(getPath(design, path))
  const span = Math.abs(cur) > 1e-9 ? Math.abs(cur) * 0.25 : (f.max - f.min) * 0.1
  return [Math.max(f.min, cur - span), Math.min(f.max, cur + span)]
}

const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1))

function FieldSelect({ value, onChange, label, fields = ALL_FIELDS }: { value: string; onChange: (p: string) => void; label: string; fields?: typeof ALL_FIELDS }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {fields.map((f) => (
          <option key={f.path} value={f.path}>
            {f.group}: {f.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function RangeInputs({ design, path, range, setRange }: { design: Design; path: string; range: [number, number] | null; setRange: (r: [number, number]) => void }) {
  const f = ALL_FIELDS.find((x) => x.path === path)!
  const r = range ?? defaultRange(design, path)
  return (
    <>
      <label>
        Desde
        <input type="number" step={f.step} value={Number(r[0].toFixed(4))} onChange={(e) => setRange([Number(e.target.value), r[1]])} />
      </label>
      <label>
        Hasta
        <input type="number" step={f.step} value={Number(r[1].toFixed(4))} onChange={(e) => setRange([r[0], Number(e.target.value)])} />
      </label>
    </>
  )
}

// ---------- barrido ----------

function SweepPanel({ design, st }: { design: Design; st: Studies }) {
  const [path, setFieldPath] = useState('ama.y')
  const [range, setRange] = useState<[number, number] | null>(null)
  const [steps, setSteps] = useState(9)
  const [metrics, setMetrics] = useState<string[]>(['speedKn', 'capsizeTrimmed'])
  const res = st.sweep
  const rf = res ? ALL_FIELDS.find((f) => f.path === res.path) : null
  const plots = useMemo(() => {
    if (!res) return []
    return metrics.map((m, i) => {
      const meta = metricMeta(m)
      const data: Data[] = [
        {
          x: res.rows.map((r) => r.value),
          y: res.rows.map((r) => r.metrics[m]),
          name: meta.label,
          type: 'scatter',
          mode: 'lines+markers',
          line: { color: SERIES[i], width: 2 },
          marker: { size: 8, color: res.rows.map((r) => (r.warnings > 0 ? '#dc3c3d' : SERIES[i])) },
          hovertemplate: `%{x:.4g}: %{y:.4g} ${meta.unit}<extra></extra>`,
        },
      ]
      return { m, meta, data }
    })
  }, [res, metrics])
  const cur = Number(getPath(design, res?.path ?? path))
  return (
    <section className="card wide">
      <div className="form-row">
        <FieldSelect
          label="Parámetro"
          value={path}
          onChange={(p) => {
            setFieldPath(p)
            setRange(null)
          }}
        />
        <RangeInputs design={design} path={path} range={range} setRange={setRange} />
        <label>
          Puntos
          <input type="number" min={2} max={40} value={steps} onChange={(e) => setSteps(Math.max(2, Math.min(40, Number(e.target.value))))} />
        </label>
        <label>
          Salidas (Ctrl para varias)
          <select multiple value={metrics} onChange={(e) => setMetrics(Array.from(e.target.selectedOptions).map((o) => o.value).slice(0, 4))} size={5}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn primary"
          disabled={!!st.running}
          onClick={() => {
            const r = range ?? defaultRange(design, path)
            st.runSweep(design, path, linspace(r[0], r[1], steps))
          }}
        >
          Calcular barrido
        </button>
      </div>
      <p className="hint">Cada punto resuelve el equilibrio completo con el resto del diseño fijo. Los puntos en rojo tienen avisos graves (vuelco, inestabilidad vela-cola…).</p>
      {res && (
        <div className="grid2">
          {plots.map((p) => (
            <Plot
              key={p.m}
              data={p.data}
              height={300}
              layout={{
                title: { text: `${p.meta.label} (${p.meta.unit})` },
                xaxis: { title: { text: `${rf?.label ?? res.path} (${rf?.unit ?? ''})` } },
                yaxis: { title: { text: p.meta.unit } },
                showlegend: false,
                shapes: [{ type: 'line', x0: cur, x1: cur, yref: 'paper', y0: 0, y1: 1, line: { color: GREY, dash: 'dot', width: 1 } }],
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ---------- mapa 2D ----------

function MapPanel({ design, st }: { design: Design; st: Studies }) {
  const [px, setPx] = useState('ama.y')
  const [py, setPy] = useState('sail.height')
  const [rx, setRx] = useState<[number, number] | null>(null)
  const [ry, setRy] = useState<[number, number] | null>(null)
  const [n, setN] = useState(6)
  const [metric, setMetric] = useState('speedKn')
  const m = st.map
  const fx = m ? ALL_FIELDS.find((f) => f.path === m.pathX) : null
  const fy = m ? ALL_FIELDS.find((f) => f.path === m.pathY) : null
  const meta = metricMeta(metric)
  const data = useMemo<Data[]>(() => {
    if (!m) return []
    const z = m.metrics.map((row) => row.map((r) => (Number.isFinite(r[metric]) ? r[metric] : null)))
    return [
      {
        type: 'contour',
        x: m.xs,
        y: m.ys,
        z,
        colorscale: [
          [0, '#e6f0fc'],
          [1, '#0e3d7e'],
        ],
        contours: { coloring: 'heatmap', showlabels: true, labelfont: { size: 10, color: '#fff' } },
        line: { width: 0.5, color: 'rgba(255,255,255,0.6)' },
        colorbar: { title: { text: meta.unit } },
        hovertemplate: `x %{x:.3g}, y %{y:.3g}: %{z:.3g} ${meta.unit}<extra></extra>`,
      } as Data,
      {
        type: 'scatter',
        x: [Number(getPath(design, m.pathX))],
        y: [Number(getPath(design, m.pathY))],
        mode: 'markers',
        marker: { size: 12, color: '#fff', line: { color: C2, width: 3 } },
        name: 'Diseño actual',
        hovertemplate: 'Diseño actual<extra></extra>',
      },
    ]
  }, [m, metric, design, meta.unit])
  return (
    <section className="card wide">
      <div className="form-row">
        <FieldSelect
          label="Eje x"
          value={px}
          onChange={(p) => {
            setPx(p)
            setRx(null)
          }}
        />
        <RangeInputs design={design} path={px} range={rx} setRange={setRx} />
        <FieldSelect
          label="Eje y"
          value={py}
          onChange={(p) => {
            setPy(p)
            setRy(null)
          }}
        />
        <RangeInputs design={design} path={py} range={ry} setRange={setRy} />
        <label>
          Puntos por eje
          <input type="number" min={3} max={15} value={n} onChange={(e) => setN(Math.max(3, Math.min(15, Number(e.target.value))))} />
        </label>
        <button
          className="btn primary"
          disabled={!!st.running || px === py}
          onClick={() => {
            const a = rx ?? defaultRange(design, px)
            const b = ry ?? defaultRange(design, py)
            st.runMap(design, px, linspace(a[0], a[1], n), py, linspace(b[0], b[1], n))
          }}
        >
          Calcular mapa ({n * n} diseños)
        </button>
      </div>
      {m && (
        <>
          <div className="form-row">
            <label>
              Salida
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRICS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label} ({x.unit})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Plot
            data={data}
            height={480}
            layout={{
              title: { text: `${meta.label} (${meta.unit})` },
              xaxis: { title: { text: `${fx?.label ?? m.pathX} (${fx?.unit ?? ''})` } },
              yaxis: { title: { text: `${fy?.label ?? m.pathY} (${fy?.unit ?? ''})` } },
              showlegend: false,
              margin: { b: 60 },
            }}
          />
        </>
      )}
    </section>
  )
}

// ---------- optimizador ----------

interface VarRow {
  path: string
  on: boolean
  range: [number, number] | null
}

const DEFAULT_VARS = ['sail.height', 'sail.rootChord', 'ama.y']

function parseConditions(s: string) {
  return s
    .split(/[,;]+/)
    .map((p) => p.trim().match(/^([\d.]+)\s*@\s*([\d.]+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ tws: Number(m[1]), twa: Number(m[2]) }))
}

function OptimizerPanel({ design, st, onApply }: { design: Design; st: Studies; onApply: (d: Design) => void }) {
  const [vars, setVars] = useState<VarRow[]>(() => FIELDS.map((f) => ({ path: f.path, on: DEFAULT_VARS.includes(f.path), range: null })))
  const [objective, setObjective] = useState<'speed' | 'mean'>('speed')
  const [conds, setConds] = useState(`${design.env.tws}@60, ${design.env.tws}@90, ${design.env.tws}@120`)
  const [k, setK] = useState({ maxHeel: 20, minCapsize: 10, minAmaReserve: 100, minTailMargin: 5 })
  const [maxEvals, setMaxEvals] = useState(60)
  const opt = st.opt
  const selected = vars.filter((v) => v.on)
  const run = () => {
    const variables: OptVariable[] = selected.map((v) => {
      const f = FIELDS.find((x) => x.path === v.path)!
      const r = v.range ?? defaultRange(design, v.path)
      return { path: v.path, label: f.label, min: Math.min(r[0], r[1]), max: Math.max(r[0], r[1]) }
    })
    st.runOptimize(design, { variables, objective, conditions: parseConditions(conds), constraints: k, maxEvals })
  }
  const p = opt?.progress
  const conv = useMemo<Data[]>(() => {
    if (!p) return []
    const h = p.history
    return [
      { x: h.map((q) => q.evals), y: h.map((q) => q.current), name: 'Evaluación (velocidad penalizada)', type: 'scatter', mode: 'markers', marker: { color: GREY, size: 6 } },
      { x: h.map((q) => q.evals), y: h.map((q) => q.best), name: 'Mejor hasta ahora', type: 'scatter', mode: 'lines', line: { color: C1, width: 2.5, shape: 'hv' } },
      { x: [0, Math.max(1, h.length)], y: [p.base.eval.score, p.base.eval.score], name: 'Diseño base', type: 'scatter', mode: 'lines', line: { color: C2, width: 1.5, dash: 'dash' } },
    ]
  }, [p])
  return (
    <>
      <div className="grid2">
        <section className="card">
          <h2>Variables de diseño</h2>
          <p className="hint">Marca las variables y su rango. El optimizador (Nelder-Mead) trabaja con cada variable normalizada a [0, 1] dentro de su rango.</p>
          <div className="var-list">
            <table className="table compact">
              <thead>
                <tr>
                  <th />
                  <th>Variable</th>
                  <th>Actual</th>
                  <th>Mín.</th>
                  <th>Máx.</th>
                </tr>
              </thead>
              <tbody>
                {vars.map((v, i) => {
                  const f = FIELDS.find((x) => x.path === v.path)!
                  const r = v.range ?? defaultRange(design, v.path)
                  const setR = (rr: [number, number]) => setVars(vars.map((x, j) => (j === i ? { ...x, range: rr } : x)))
                  return (
                    <tr key={v.path} className={v.on ? '' : 'off'}>
                      <td>
                        <input type="checkbox" aria-label={f.label} checked={v.on} onChange={(e) => setVars(vars.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                      </td>
                      <td>
                        {f.group}: {f.label} {f.unit ? `(${f.unit})` : ''}
                      </td>
                      <td className="num">{Number(getPath(design, v.path)).toPrecision(4)}</td>
                      <td>
                        <input type="number" step={f.step} disabled={!v.on} value={Number(r[0].toFixed(4))} onChange={(e) => setR([Number(e.target.value), r[1]])} />
                      </td>
                      <td>
                        <input type="number" step={f.step} disabled={!v.on} value={Number(r[1].toFixed(4))} onChange={(e) => setR([r[0], Number(e.target.value)])} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>Objetivo y restricciones</h2>
          <label className="field">
            <span className="field-label">Objetivo: maximizar</span>
            <select value={objective} onChange={(e) => setObjective(e.target.value as 'speed' | 'mean')}>
              <option value="speed">Velocidad en la condición actual ({design.env.tws} m/s, TWA {design.env.twa}°)</option>
              <option value="mean">Velocidad media en varias condiciones</option>
            </select>
          </label>
          {objective === 'mean' && (
            <label className="field">
              <span className="field-label">Condiciones (TWS@TWA, separadas por comas)</span>
              <input className="text" value={conds} onChange={(e) => setConds(e.target.value)} />
              <span className="hint">{parseConditions(conds).length} condiciones válidas</span>
            </label>
          )}
          <div className="form-grid">
            <label>
              Escora máxima (°)
              <input type="number" value={k.maxHeel} onChange={(e) => setK({ ...k, maxHeel: Number(e.target.value) })} />
            </label>
            <label>
              Viento de vuelco mínimo (m/s)
              <input type="number" value={k.minCapsize} onChange={(e) => setK({ ...k, minCapsize: Number(e.target.value) })} />
            </label>
            <label>
              Reserva mínima del patín (%)
              <input type="number" value={k.minAmaReserve} onChange={(e) => setK({ ...k, minAmaReserve: Number(e.target.value) })} />
            </label>
            <label>
              Margen vela-cola mínimo (% c)
              <input type="number" value={k.minTailMargin} onChange={(e) => setK({ ...k, minTailMargin: Number(e.target.value) })} />
            </label>
            <label>
              Evaluaciones máximas
              <input type="number" min={5} max={500} value={maxEvals} onChange={(e) => setMaxEvals(Math.max(5, Math.min(500, Number(e.target.value))))} />
            </label>
          </div>
          <p className="hint">
            Las restricciones se imponen con penalizaciones: puntuación = velocidad (nudos) − Σ exceso/escala (escora/5°, vuelco/2 m/s, reserva/20 %, margen/5 %; −5 si vuelca). Un
            diseño es factible si no tiene penalización. Además se penaliza (−1) que la vela trabaje en pérdida: el equilibrio vela-cola puede saltar a una raíz en pérdida que da más empuje en el modelo pero no es un punto de trabajo fiable. Cada evaluación tarda ~0,5–1 s por condición.
          </p>
          <div className="form-row">
            <button className="btn primary" onClick={run} disabled={!!st.running || selected.length === 0}>
              Optimizar ({selected.length} variables)
            </button>
            {st.running?.task === 'optimize' && (
              <button className="btn" onClick={st.stop}>
                Detener
              </button>
            )}
          </div>
        </section>
      </div>
      {opt && p && <OptResults opt={opt} p={p} conv={conv} onApply={onApply} design={design} />}
    </>
  )
}

/** Escala de la convergencia centrada en la zona útil (de la base al mejor). */
function convRange(p: OptProgress): [number, number] {
  const best = p.best?.eval.score ?? p.base.eval.score
  const lo = Math.min(p.base.eval.score, best)
  const span = Math.max(0.2, Math.abs(best - lo))
  return [lo - 1.5 * span, best + 0.3 * span]
}

function pctDiff(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) < 1e-12) return '—'
  const x = ((b - a) / Math.abs(a)) * 100
  return `${x >= 0 ? '+' : ''}${x.toFixed(1)} %`
}

function OptResults({ opt, p, conv, onApply, design }: { opt: OptState; p: OptProgress; conv: Data[]; onApply: (d: Design) => void; design: Design }) {
  const best = p.best
  const vars = opt.settings.variables
  const rows: [string, string, number, number, number][] = best
    ? [
        ['Velocidad', 'nudos', p.base.eval.speed, best.eval.speed, 3],
        ['Escora máxima', '°', p.base.eval.heel, best.eval.heel, 1],
        ['Viento de vuelco (trimada)', 'm/s', p.base.eval.capsize, best.eval.capsize, 1],
        ['Reserva del patín', '%', p.base.eval.amaReserve, best.eval.amaReserve, 0],
        ['Margen vela-cola', '% c', p.base.eval.tailMargin, best.eval.tailMargin, 1],
        ['Penalización', '', p.base.eval.penalty, best.eval.penalty, 3],
        ['Puntuación', '', p.base.eval.score, best.eval.score, 3],
      ]
    : []
  const bars = useMemo<Data[]>(() => {
    if (!best) return []
    const labels = vars.map((v) => v.label)
    const vals = vars.map((_, i) => (Math.abs(p.base.values[i]) > 1e-12 ? ((best.values[i] - p.base.values[i]) / Math.abs(p.base.values[i])) * 100 : 0))
    return [{ type: 'bar', orientation: 'h', y: labels, x: vals, marker: { color: vals.map((x) => (x >= 0 ? C1 : C2)) }, hovertemplate: '%{y}: %{x:.1f} %<extra></extra>' }]
  }, [best, vars, p.base.values])
  const applyBest = () => {
    if (opt.bestDesign) return onApply(opt.bestDesign)
    if (!best) return
    let d = design
    vars.forEach((v, i) => (d = setPath(d, v.path, best.values[i])))
    onApply(d)
  }
  return (
    <>
      <div className="grid2">
        <section className="card">
          <h2>Convergencia</h2>
          <p className="hint">
            {opt.done ? (opt.stopped ? 'Detenido por el usuario. ' : 'Terminado. ') : opt.note ?? 'Optimizando… '}
            {p.evals} evaluaciones. {best ? (best.eval.feasible ? 'El mejor diseño cumple todas las restricciones.' : 'El mejor diseño todavía incumple alguna restricción.') : ''}
          </p>
          <Plot
            data={conv}
            height={300}
            layout={{
              title: { text: 'Puntuación por evaluación' },
              xaxis: { title: { text: 'Evaluación' } },
              yaxis: { title: { text: 'nudos (penalizados)' }, range: convRange(p) },
            }}
          />
          <p className="hint">Los puntos muy penalizados (vuelco, restricciones muy incumplidas) quedan fuera de la escala para que se vea la mejora.</p>
          {best && (
            <button className="btn primary" onClick={applyBest} disabled={!opt.done}>
              Aplicar el diseño óptimo
            </button>
          )}
        </section>
        <section className="card">
          <h2>Base frente a óptimo</h2>
          {best && (
            <>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th className="num">Base</th>
                    <th className="num">Óptimo</th>
                    <th className="num">Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {vars.map((v, i) => (
                    <tr key={v.path}>
                      <td>{v.label}</td>
                      <td className="num">{p.base.values[i].toPrecision(4)}</td>
                      <td className="num">{best.values[i].toPrecision(4)}</td>
                      <td className="num">{pctDiff(p.base.values[i], best.values[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Resultado</th>
                    <th className="num">Base</th>
                    <th className="num">Óptimo</th>
                    <th className="num">Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, unit, a, b, dec]) => (
                    <tr key={label}>
                      <td>
                        {label} {unit && `(${unit})`}
                      </td>
                      <td className="num">{Number.isFinite(a) ? a.toFixed(dec) : '—'}</td>
                      <td className="num">{Number.isFinite(b) ? b.toFixed(dec) : '—'}</td>
                      <td className="num">{pctDiff(a, b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Plot data={bars} height={Math.max(180, 40 * vars.length + 80)} layout={{ title: { text: 'Cambio de cada variable (%)' }, margin: { l: 200, r: 20, t: 36, b: 40 }, showlegend: false }} />
            </>
          )}
        </section>
      </div>
      {opt.polars && (
        <section className="card wide">
          <h2>Polar de velocidades: base frente a óptimo (TWS {opt.polars.base.tws} m/s)</h2>
          <div className="grid2">
            <SpeedPolar curves={[opt.polars.base, opt.polars.best]} names={['Diseño base', 'Diseño óptimo']} colors={[C2, C1]} title="Velocidad (nudos) frente a TWA" />
            <PolarDiff base={opt.polars.base} best={opt.polars.best} />
          </div>
        </section>
      )}
    </>
  )
}

function PolarDiff({ base, best }: { base: PolarCurve; best: PolarCurve }) {
  const data = useMemo<Data[]>(() => {
    const x = base.points.map((p) => p.twa)
    const y = base.points.map((p, i) => (p.kn > 1e-6 ? ((best.points[i].kn - p.kn) / p.kn) * 100 : 0))
    return [{ type: 'bar', x, y, marker: { color: y.map((v) => (v >= 0 ? C1 : C2)) }, hovertemplate: 'TWA %{x}°: %{y:.1f} %<extra></extra>' }]
  }, [base, best])
  return <Plot data={data} height={360} layout={{ title: { text: 'Mejora de velocidad por TWA (%)' }, xaxis: { title: { text: 'TWA (°)' }, dtick: 15 }, yaxis: { title: { text: '%' } }, showlegend: false }} />
}

// ---------- comparar ----------

function ComparePanel({ design, st }: { design: Design; st: Studies }) {
  const items = st.compare
  const keys = ['speedKn', 'heel', 'alpha', 'drive', 'resistance', 'gm', 'rmMax', 'capsizeTrimmed', 'amaReserve', 'mass']
  const bars = useMemo<Data[]>(() => {
    if (items.length < 2) return []
    const ref = items[0]
    return items.slice(1).map((it, i) => ({
      type: 'bar',
      orientation: 'h',
      name: it.design.name,
      y: keys.map((k) => metricMeta(k).label),
      x: keys.map((k) => (Math.abs(ref.metrics[k]) > 1e-12 ? ((it.metrics[k] - ref.metrics[k]) / Math.abs(ref.metrics[k])) * 100 : 0)),
      marker: { color: [C1, C3, C4][i % 3] },
      hovertemplate: '%{y}: %{x:.1f} %<extra>' + it.design.name + '</extra>',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])
  const lay: Partial<Layout> = { title: { text: `Diferencia respecto a «${items[0]?.design.name ?? ''}» (%)` }, barmode: 'group', margin: { l: 220, r: 20, t: 36, b: 60 }, yaxis: { autorange: 'reversed' } }
  return (
    <section className="card wide">
      <div className="form-row">
        <button className="btn primary" disabled={!!st.running} onClick={() => st.addCompare(design)}>
          Añadir el diseño actual («{design.name}»)
        </button>
        <span className="hint">Hasta 4 variantes. Cambia el nombre del diseño en la cabecera para distinguirlas. La primera es la referencia.</span>
      </div>
      {items.length === 0 ? (
        <div className="hint">Sin variantes todavía.</div>
      ) : (
        <>
          <table className="table compact">
            <thead>
              <tr>
                <th>Indicador</th>
                {items.map((it, i) => (
                  <th key={i} className="num">
                    {it.design.name}{' '}
                    <button className="btn tiny" onClick={() => st.removeCompare(i)} title="Quitar">
                      ×
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <td>
                    {m.label} ({m.unit})
                  </td>
                  {items.map((it, i) => (
                    <td key={i} className="num">
                      {Number.isFinite(it.metrics[m.key]) ? it.metrics[m.key].toFixed(3) : '—'}
                      {i > 0 && <span className="diff"> {pctDiff(items[0].metrics[m.key], it.metrics[m.key])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 1 && <Plot data={bars} height={420} layout={lay} />}
        </>
      )}
    </section>
  )
}

