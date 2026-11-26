import { useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import { Plot } from './Plot'
import { SWEEP_FIELDS } from './params'
import { METRICS, type AnalysisView } from '../core/view'
import { getPath } from '../core/path'
import type { Design } from '../core/types'

export interface SweepResult {
  path: string
  rows: { value: number; metrics: Record<string, number>; warnings: number }[]
}

const COLORS = ['#2680c2', '#c65d21', '#2f8132', '#7b61b0']

export function SweepPanel(props: {
  design: Design
  result: SweepResult | null
  progress: { done: number; total: number } | null
  onRun: (path: string, values: number[]) => void
}) {
  const { design, result, progress, onRun } = props
  const [path, setPath] = useState('ama.y')
  const field = SWEEP_FIELDS.find((f) => f.path === path) ?? SWEEP_FIELDS[0]
  const current = Number(getPath(design, path))
  const [lo, setLo] = useState<number | null>(null)
  const [hi, setHi] = useState<number | null>(null)
  const [steps, setSteps] = useState(9)
  const [metrics, setMetrics] = useState<string[]>(['speedKn', 'capsizeTrimmed'])
  const from = lo ?? Math.max(field.min, current * 0.6)
  const to = hi ?? Math.min(field.max, current * 1.4 || field.max)
  const run = () => {
    const vals: number[] = []
    for (let i = 0; i < steps; i++) vals.push(from + ((to - from) * i) / Math.max(1, steps - 1))
    onRun(path, vals)
  }
  const data = useMemo<Data[]>(() => {
    if (!result) return []
    return metrics.map((m, i) => {
      const meta = METRICS.find((x) => x.key === m)!
      return {
        x: result.rows.map((r) => r.value),
        y: result.rows.map((r) => r.metrics[m]),
        name: `${meta.label} (${meta.unit})`,
        type: 'scatter',
        mode: 'lines+markers',
        yaxis: i === 0 ? 'y' : 'y2',
        line: { color: COLORS[i % COLORS.length] },
      } as Data
    })
  }, [result, metrics])
  const rf = result ? SWEEP_FIELDS.find((f) => f.path === result.path) : null
  return (
    <div>
      <div className="sweep-form">
        <label>
          Parámetro
          <select
            value={path}
            onChange={(e) => {
              setPath(e.target.value)
              setLo(null)
              setHi(null)
            }}
          >
            {SWEEP_FIELDS.map((f) => (
              <option key={f.path} value={f.path}>
                {f.group}: {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="number" step={field.step} value={Number(from.toFixed(4))} onChange={(e) => setLo(Number(e.target.value))} />
        </label>
        <label>
          Hasta
          <input type="number" step={field.step} value={Number(to.toFixed(4))} onChange={(e) => setHi(Number(e.target.value))} />
        </label>
        <label>
          Puntos
          <input type="number" min={2} max={30} value={steps} onChange={(e) => setSteps(Math.max(2, Math.min(30, Number(e.target.value))))} />
        </label>
        <label>
          Salidas (hasta 2)
          <select
            multiple
            value={metrics}
            onChange={(e) => setMetrics(Array.from(e.target.selectedOptions).map((o) => o.value).slice(0, 2))}
            size={4}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={!!progress}>
          {progress ? `Calculando ${progress.done}/${progress.total}…` : 'Calcular barrido'}
        </button>
      </div>
      <div className="hint">El barrido usa una resolución algo menor para ir más rápido. El valor actual del parámetro es {current}.</div>
      {result && (
        <Plot
          data={data}
          height={360}
          layout={{
            title: { text: `Barrido de ${rf?.label.toLowerCase() ?? result.path}` },
            xaxis: { title: { text: `${rf?.label ?? result.path} (${rf?.unit ?? ''})` } },
            yaxis: { title: { text: METRICS.find((m) => m.key === metrics[0])?.unit ?? '' } },
            yaxis2: metrics[1] ? { overlaying: 'y', side: 'right', title: { text: METRICS.find((m) => m.key === metrics[1])?.unit ?? '' }, showgrid: false } : undefined,
          }}
        />
      )}
    </div>
  )
}

export function ComparePanel({ items, onRemove }: { items: AnalysisView[]; onRemove: (i: number) => void }) {
  if (items.length === 0) return <div className="hint">Añade el diseño actual con «Añadir a comparación» (hasta 3 variantes).</div>
  return (
    <table className="table compare">
      <thead>
        <tr>
          <th>Indicador</th>
          {items.map((it, i) => (
            <th key={i}>
              {it.design.name}{' '}
              <button className="btn tiny" onClick={() => onRemove(i)} title="Quitar">
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
              <td key={i}>{Number.isFinite(it.metrics[m.key]) ? it.metrics[m.key].toFixed(3) : '—'}</td>
            ))}
          </tr>
        ))}
        <tr>
          <td>Avisos</td>
          {items.map((it, i) => (
            <td key={i}>{it.warnings.filter((w) => w.level !== 'info').length}</td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
