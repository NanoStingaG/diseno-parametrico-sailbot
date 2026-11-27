import { useMemo, useState } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot } from './Plot'
import type { AnalysisView } from '../core/view'
import type { Condition } from '../core/solver'
import { DEG } from '../core/math'
import { C1, C2, C3, C4, C5, GREY, INK2 } from './colors'

/** Margen vela-cola: sin sentido si la cola está en pérdida o no hay equilibrio. */
export function tailMarginText(c: Condition, mode: string) {
  if (mode !== 'tail') return '—'
  if (c.sail.anyStall) return '— (vela en pérdida)'
  if (c.sail.tailStall || !c.tailFound || !Number.isFinite(c.tailMargin)) return '— (cola en pérdida)'
  return `${c.tailMargin.toFixed(1)} % c`
}

export function ForcesChart({ v }: { v: AnalysisView }) {
  const c = v.condition
  const r = c.resistance
  const data = useMemo<Data[]>(() => {
    const labels = [
      'Propulsión de la vela',
      'Aerodinámica de cascos',
      ...r.hulls.map((h) => `Fricción ${h.name.toLowerCase()}`),
      ...r.hulls.map((h) => `Olas ${h.name.toLowerCase()}`),
      'Quilla, timón y bulbo',
      'Inducida de quilla y timón',
    ]
    const vals = [c.sail.Fx, c.windage.Fx, ...r.hulls.map((h) => -h.friction), ...r.hulls.map((h) => -h.wave), -r.appendages, -r.induced]
    return [
      {
        type: 'bar',
        orientation: 'h',
        y: labels,
        x: vals,
        marker: { color: vals.map((x) => (x >= 0 ? C1 : C2)) },
        text: vals.map((x) => x.toFixed(3) + ' N'),
        textposition: 'outside',
        cliponaxis: false,
        hovertemplate: '%{y}: %{x:.3f} N<extra></extra>',
      },
    ]
  }, [c, r])
  const xr = useMemo(() => {
    const xs = (data[0] as { x: number[] }).x
    const lo = Math.min(0, ...xs)
    const hi = Math.max(0, ...xs)
    const pad = 0.3 * (hi - lo || 1)
    return [lo - (lo < 0 ? pad : 0), hi + pad]
  }, [data])
  return (
    <div>
      <Plot
        data={data}
        height={300}
        layout={{ title: { text: 'Balance longitudinal (N, + hacia proa)' }, margin: { l: 190, r: 20, t: 36, b: 30 }, xaxis: { range: xr }, yaxis: { autorange: 'reversed' }, showlegend: false }}
      />
      <table className="table compact">
        <tbody>
          <tr>
            <td>Fuerza lateral vela / agua</td>
            <td>
              {c.sail.Fy.toFixed(3)} / {c.side.F.toFixed(3)} N
            </td>
          </tr>
          <tr>
            <td>Quilla / timón / casco</td>
            <td>
              {c.side.Lk.toFixed(2)} / {c.side.Lr.toFixed(2)} / {c.side.Lh.toFixed(2)} N
            </td>
          </tr>
          <tr>
            <td>Momento escorante / adrizante</td>
            <td>
              {c.heelMoment.toFixed(3)} / {c.righting.toFixed(3)} N·m
            </td>
          </tr>
          <tr>
            <td>Sustentación vela / cola</td>
            <td>
              {c.sail.wing.lift.toFixed(3)} / {c.sail.tail.lift.toFixed(3)} N
            </td>
          </tr>
          <tr>
            <td>Resistencia inducida / de perfil de la vela</td>
            <td>
              {c.sail.dragInduced.toFixed(3)} / {c.sail.dragProfile.toFixed(3)} N
            </td>
          </tr>
          <tr>
            <td>Asiento con el empuje · francobordo proa (casco / patín)</td>
            <td>
              {c.pitch.theta.toFixed(2)}° · {c.pitch.bowFreeboard.toFixed(3)} / {c.pitch.amaBowFreeboard.toFixed(3)} m
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const CASE_COLORS: Record<string, string> = { actual: C2, gust: C3, max: C4, feather: C5 }

/** Curva GZ con los brazos escorantes superpuestos y el brazo adrizante restante. */
export function HeelArmChart({ v }: { v: AnalysisView }) {
  const ha = v.heelArms
  const s = v.stability
  const [zoom, setZoom] = useState(false)
  const armMax = ha ? Math.max(...ha.cases.flatMap((k) => k.arm), 1e-6) : 1
  const plot = useMemo(() => {
    if (!ha) return null
    const data: Data[] = [
      { x: ha.phi, y: ha.GZ, name: 'GZ (brazo adrizante)', type: 'scatter', mode: 'lines', line: { color: C1, width: 2.5 }, hovertemplate: 'φ %{x:.0f}°: GZ %{y:.4f} m<extra></extra>' },
    ]
    const actual = ha.cases.find((k) => k.key === 'actual')
    if (actual && actual.phiEq !== null) {
      const hi = actual.phiLimit ?? ha.phi[ha.phi.length - 1]
      const xs: number[] = []
      const top: number[] = []
      const bot: number[] = []
      const gzAt = (p: number) => interp1(ha.phi, ha.GZ, p)
      const arAt = (p: number) => interp1(ha.phi, actual.arm, p)
      const pts = [actual.phiEq, ...ha.phi.filter((p) => p > actual.phiEq! && p < hi), hi]
      for (const p of pts) {
        xs.push(p)
        top.push(gzAt(p))
        bot.push(arAt(p))
      }
      data.push({
        x: [...xs, ...xs.slice().reverse()],
        y: [...top, ...bot.slice().reverse()],
        type: 'scatter',
        mode: 'lines',
        fill: 'toself',
        fillcolor: 'rgba(244,114,48,0.14)',
        line: { width: 0 },
        name: 'Reserva de estabilidad (viento actual)',
        hoverinfo: 'skip',
      })
    }
    for (const k of ha.cases) {
      data.push({
        x: ha.phi,
        y: k.arm,
        name: k.label,
        type: 'scatter',
        mode: 'lines',
        line: { color: CASE_COLORS[k.key], width: 2, dash: k.key === 'feather' ? 'dot' : k.key === 'gust' ? 'dash' : 'solid' },
        hovertemplate: `${k.label}<br>φ %{x:.0f}°: %{y:.4f} m<extra></extra>`,
      })
    }
    const eqs = ha.cases.filter((k) => k.phiEq !== null)
    data.push({
      x: eqs.map((k) => k.phiEq as number),
      y: eqs.map((k) => interp1(ha.phi, k.arm, k.phiEq as number)),
      text: eqs.map((k) => `${k.label}: equilibrio a ${(k.phiEq as number).toFixed(1)}°`),
      name: 'Escora de equilibrio',
      type: 'scatter',
      mode: 'markers',
      marker: { color: eqs.map((k) => CASE_COLORS[k.key]), size: 10, line: { color: '#fff', width: 2 } },
      hovertemplate: '%{text}<extra></extra>',
    })
    const shapes: Partial<Layout>['shapes'] = []
    const annotations: Partial<Layout>['annotations'] = []
    if (actual && actual.phiEq !== null && actual.residualMax > 0) {
      const p = actual.phiResidualMax
      const a = interp1(ha.phi, actual.arm, p)
      shapes.push({ type: 'line', x0: p, x1: p, y0: a, y1: a + actual.residualMax, line: { color: C2, width: 1.5, dash: 'dot' } })
      annotations.push({ x: p, y: a + actual.residualMax / 2, text: `brazo restante máx. ${actual.residualMax.toFixed(3)} m`, showarrow: false, xanchor: 'left', xshift: 6, font: { size: 11, color: INK2 } })
    }
    const marks: [number | null, string][] = [
      [s.phiPortOut, 'sale patín barlovento'],
      [s.phiMainOut, 'sale casco central'],
      [s.phiStbdFull, 'patín sotavento sumergido'],
      [s.phiVanish, 'estabilidad nula'],
    ]
    for (const [p, label] of marks) {
      if (p === null) continue
      shapes.push({ type: 'line', x0: p, x1: p, yref: 'paper', y0: 0, y1: 1, line: { color: GREY, width: 1, dash: 'dot' } })
      annotations.push({ x: p, yref: 'paper', y: 1, text: label, showarrow: false, textangle: '-90', xanchor: 'right', yanchor: 'top', font: { size: 10, color: INK2 } })
    }
    return { data, shapes, annotations }
  }, [ha, s])
  if (!ha || !plot) return <div className="hint">Curvas de brazo escorante no disponibles.</div>
  return (
    <div>
      <Plot
        data={plot.data}
        height={400}
        layout={{
          title: { text: 'Curva GZ y brazos escorantes de la vela' },
          xaxis: { title: { text: 'Escora φ (°)' }, range: [0, 90], dtick: 10 },
          yaxis: zoom ? { title: { text: 'Brazo (m)' }, range: [0, armMax * 3] } : { title: { text: 'Brazo (m)' }, rangemode: 'tozero' },
          shapes: plot.shapes,
          annotations: plot.annotations,
          hovermode: 'closest',
        }}
      />
      <button className="btn small" onClick={() => setZoom(!zoom)}>
        {zoom ? 'Ver la curva GZ completa' : 'Ampliar la zona de los brazos escorantes'}
      </button>
      <table className="table compact">
        <thead>
          <tr>
            <th>Caso</th>
            <th>Equilibrio</th>
            <th>Brazo restante máx.</th>
            <th>Área de reserva</th>
            <th>Ángulo límite</th>
          </tr>
        </thead>
        <tbody>
          {ha.cases.map((k) => (
            <tr key={k.key}>
              <td>
                <span className="swatch" style={{ background: CASE_COLORS[k.key] }} />
                {k.label}
              </td>
              <td>{k.phiEq === null ? 'vuelca' : `${k.phiEq.toFixed(1)}°`}</td>
              <td>{k.phiEq === null ? '—' : `${k.residualMax.toFixed(3)} m a ${k.phiResidualMax.toFixed(0)}°`}</td>
              <td>{k.phiEq === null ? '—' : `${k.area.toFixed(4)} m·rad`}</td>
              <td>{k.phiEq === null ? '—' : k.phiLimit === null ? '> 90°' : `${k.phiLimit.toFixed(1)}°`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">
        Brazo escorante = M<sub>esc</sub>(φ) / (Δ·g), con la velocidad y la deriva de la solución. El área sombreada es la reserva de estabilidad con el viento actual: GZ menos
        brazo escorante entre la escora de equilibrio y el ángulo límite. GM inicial {s.gm.toFixed(3)} m · GZ máx. {s.gzMax.toFixed(3)} m a {s.phiGzMax}° · reserva de
        flotabilidad de cada patín {v.amaReserve.toFixed(0)} %.
      </div>
    </div>
  )
}

function interp1(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1)
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

export function SailCoefChart({ v, which }: { v: AnalysisView; which: 'CL' | 'CD' }) {
  const c = v.condition
  const sc = v.sailCurves
  const data = useMemo<Data[]>(
    () => [
      { x: sc.map((p) => p.alpha), y: sc.map((p) => p[which]), name: which, type: 'scatter', mode: 'lines', line: { color: which === 'CL' ? C1 : C2, width: 2 } },
      {
        x: [c.alpha],
        y: [which === 'CL' ? c.sail.CL : c.sail.CD],
        name: 'Punto de trabajo',
        type: 'scatter',
        mode: 'markers',
        marker: { color: which === 'CL' ? C1 : C2, size: 10, line: { color: '#fff', width: 2 } },
        hovertemplate: `α %{x:.1f}°: ${which} %{y:.3f}<extra>Punto de trabajo</extra>`,
      },
    ],
    [sc, c, which],
  )
  return (
    <Plot
      data={data}
      height={280}
      layout={{
        title: { text: which === 'CL' ? 'Sustentación del conjunto vela-cola' : 'Resistencia del conjunto vela-cola' },
        xaxis: { title: { text: 'α (°)' } },
        yaxis: { title: { text: which } },
        showlegend: false,
        margin: { b: 44 },
      }}
    />
  )
}

export function SpanLoadChart({ v }: { v: AnalysisView }) {
  const c = v.condition
  const data = useMemo<Data[]>(() => {
    const w = c.sail.strips.filter((s) => s.surface === 0)
    const t = c.sail.strips.filter((s) => s.surface === 1)
    return [
      {
        y: w.map((s) => s.z),
        x: w.map((s) => s.cl),
        name: 'Vela',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: C1 },
        marker: { color: w.map((s) => (s.stalled ? '#dc3c3d' : C1)), size: 8 },
        text: w.map((s) => `Re ${(s.re / 1000).toFixed(0)}k${s.stalled ? ' · en pérdida' : ''}`),
        hovertemplate: 'z %{y:.2f} m: cl %{x:.3f}<br>%{text}<extra>Vela</extra>',
      },
      {
        y: t.map((s) => s.z),
        x: t.map((s) => s.cl),
        name: 'Cola',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: C2 },
        marker: { color: C2, size: 8 },
        text: t.map((s) => `Re ${(s.re / 1000).toFixed(0)}k${s.stalled ? ' · en pérdida' : ''}`),
        hovertemplate: 'z %{y:.2f} m: cl %{x:.3f}<br>%{text}<extra>Cola</extra>',
      },
    ]
  }, [c])
  return (
    <Plot
      data={data}
      height={280}
      layout={{ title: { text: 'Carga en altura (cl local; rojo = en pérdida)' }, xaxis: { title: { text: 'cl local' } }, yaxis: { title: { text: 'z sobre cubierta (m)' } }, margin: { b: 70 } }}
    />
  )
}

export function MomentChart({ v }: { v: AnalysisView }) {
  const c = v.condition
  const sc = v.sailCurves
  const data = useMemo<Data[]>(
    () => [
      { x: sc.map((p) => p.alpha), y: sc.map((p) => p.M), name: 'Momento en el eje', type: 'scatter', mode: 'lines', line: { color: C1, width: 2 } },
      { x: [c.alpha], y: [0], name: 'Equilibrio', type: 'scatter', mode: 'markers', marker: { color: C1, size: 10, line: { color: '#fff', width: 2 } } },
    ],
    [sc, c],
  )
  return (
    <Plot
      data={data}
      height={280}
      layout={{ title: { text: 'Momento respecto al eje (N·m, + aumenta α)' }, xaxis: { title: { text: 'α (°)' } }, yaxis: { title: { text: 'N·m' } }, showlegend: false, margin: { b: 44 } }}
    />
  )
}

export function TailCurveChart({ v }: { v: AnalysisView }) {
  const data = useMemo<Data[]>(
    () => [
      { x: v.tailCurve.map((p) => p.tail), y: v.tailCurve.map((p) => p.alpha), name: 'α de equilibrio', type: 'scatter', mode: 'lines+markers', line: { color: C3, width: 2 }, marker: { size: 6 } },
    ],
    [v.tailCurve],
  )
  return (
    <Plot
      data={data}
      height={280}
      layout={{ title: { text: 'Ángulo de cola → α de equilibrio' }, xaxis: { title: { text: 'Ángulo de cola (°)' } }, yaxis: { title: { text: 'α (°)' } }, showlegend: false, margin: { b: 44 } }}
    />
  )
}

export function SailTable({ v }: { v: AnalysisView }) {
  const c = v.condition
  const d = v.design
  const S = 0.5 * (d.sail.rootChord + d.sail.tipChord) * d.sail.height
  const re = c.sail.strips.filter((s) => s.surface === 0).map((s) => s.re)
  const reT = c.sail.strips.filter((s) => s.surface === 1).map((s) => s.re)
  const k = (x: number) => (x / 1000).toFixed(0) + 'k'
  return (
    <table className="table compact">
      <tbody>
        <tr>
          <td>Superficie / alargamiento de la vela</td>
          <td>
            {S.toFixed(3)} m² / {((d.sail.height * d.sail.height) / S).toFixed(2)}
          </td>
        </tr>
        <tr>
          <td>Margen de estabilidad vela-cola</td>
          <td>{tailMarginText(c, d.control.mode)}</td>
        </tr>
        <tr>
          <td>Reynolds vela (pie – tope) / cola</td>
          <td>
            {re.length ? `${k(Math.min(...re))} – ${k(Math.max(...re))}` : '—'} / {reT.length ? k(reT[0]) : '—'}
          </td>
        </tr>
        <tr>
          <td>VLM no lineal</td>
          <td>
            {c.sail.iterations} iteraciones{c.sail.converged ? '' : ' (sin converger)'}
          </td>
        </tr>
        <tr>
          <td>Desequilibrio de masas del conjunto</td>
          <td>
            {(v.sailAssembly.offset * 100).toFixed(1)} cm ({v.sailAssembly.mass.toFixed(2)} kg)
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export { DEG }
