import { useMemo } from 'react'
import type { Data } from 'plotly.js'
import { Plot } from './Plot'
import type { AnalysisView } from '../core/view'
import { DEG } from '../core/math'

const C1 = '#2680c2'
const C2 = '#c65d21'
const C3 = '#2f8132'
const C4 = '#7b61b0'
const GREY = '#9aa5b1'

export function ForcesChart({ v }: { v: AnalysisView }) {
  const c = v.condition
  const r = c.resistance
  const data = useMemo<Data[]>(() => {
    const labels = [
      'Propulsión de la vela',
      'Resistencia aerodinámica de cascos',
      ...r.hulls.map((h) => `Fricción ${h.name.toLowerCase()}`),
      ...r.hulls.map((h) => `Olas ${h.name.toLowerCase()}`),
      'Quilla, timón y bulbo',
      'Inducida de quilla y timón',
    ]
    const vals = [
      c.sail.Fx,
      c.windage.Fx,
      ...r.hulls.map((h) => -h.friction * v.design.resistanceFactor),
      ...r.hulls.map((h) => -h.wave * v.design.resistanceFactor),
      -r.appendages,
      -r.induced,
    ]
    return [
      {
        type: 'bar',
        orientation: 'h',
        y: labels,
        x: vals,
        marker: { color: vals.map((x) => (x >= 0 ? C3 : C2)) },
        text: vals.map((x) => x.toFixed(3) + ' N'),
        textposition: 'outside',
        cliponaxis: false,
        hovertemplate: '%{y}: %{x:.3f} N<extra></extra>',
      },
    ]
  }, [c, r, v.design.resistanceFactor])
  const xr = useMemo(() => {
    const xs = (data[0] as { x: number[] }).x
    const lo = Math.min(0, ...xs)
    const hi = Math.max(0, ...xs)
    const pad = 0.28 * (hi - lo || 1)
    return [lo - (lo < 0 ? pad : 0), hi + pad]
  }, [data])
  return (
    <div>
      <Plot data={data} height={340} layout={{ title: { text: 'Balance longitudinal (N, + hacia proa)' }, margin: { l: 220, r: 30, t: 36, b: 36 }, xaxis: { range: xr }, yaxis: { autorange: 'reversed' } }} />
      <table className="table">
        <tbody>
          <tr>
            <td>Fuerza lateral de la vela</td>
            <td>{c.sail.Fy.toFixed(3)} N</td>
            <td>Fuerza lateral del agua</td>
            <td>{c.side.F.toFixed(3)} N</td>
          </tr>
          <tr>
            <td>Quilla / timón / casco</td>
            <td>
              {c.side.Lk.toFixed(2)} / {c.side.Lr.toFixed(2)} / {c.side.Lh.toFixed(2)} N
            </td>
            <td>Altura CE sobre línea base</td>
            <td>{c.zCE.toFixed(3)} m</td>
          </tr>
          <tr>
            <td>Momento escorante</td>
            <td>{c.heelMoment.toFixed(3)} N·m</td>
            <td>Momento adrizante a esa escora</td>
            <td>{c.righting.toFixed(3)} N·m</td>
          </tr>
          <tr>
            <td>Sustentación / resistencia de la vela</td>
            <td>
              {c.sail.lift.toFixed(3)} / {(c.sail.dragInduced + c.sail.dragProfile).toFixed(3)} N
            </td>
            <td>Vela / cola (sustentación)</td>
            <td>
              {c.sail.wing.lift.toFixed(3)} / {c.sail.tail.lift.toFixed(3)} N
            </td>
          </tr>
          <tr>
            <td>Asiento con el empuje</td>
            <td>{c.pitch.theta.toFixed(2)}° (+ proa abajo)</td>
            <td>Francobordo en proa (casco / patín sotavento)</td>
            <td>
              {c.pitch.bowFreeboard.toFixed(3)} / {c.pitch.amaBowFreeboard.toFixed(3)} m
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function StabilityChart({ v }: { v: AnalysisView }) {
  const s = v.stability
  const c = v.condition
  const data = useMemo<Data[]>(() => {
    const phi = s.curve.map((p) => p.phi)
    const marks: { phi: number | null; label: string }[] = [
      { phi: s.phiPortOut, label: 'Sale el patín de barlovento' },
      { phi: s.phiMainOut, label: 'Sale el casco central' },
      { phi: s.phiStbdFull, label: 'Patín de sotavento sumergido' },
      { phi: s.phiVanish, label: 'Estabilidad nula' },
    ]
    const RMat = (p: number) => {
      const i = s.curve.findIndex((q) => q.phi >= p)
      return i >= 0 ? s.curve[i].RM : 0
    }
    return [
      { x: phi, y: s.curve.map((p) => p.RM), name: 'Momento adrizante', type: 'scatter', mode: 'lines', line: { color: C1, width: 2 } },
      {
        x: [0, 90],
        y: [Math.abs(c.heelMoment), Math.abs(c.heelMoment)],
        name: 'Momento escorante actual',
        type: 'scatter',
        mode: 'lines',
        line: { color: C2, dash: 'dash' },
      },
      {
        x: [Math.abs(c.phi) / DEG],
        y: [Math.abs(c.heelMoment)],
        name: 'Equilibrio',
        type: 'scatter',
        mode: 'markers',
        marker: { color: C2, size: 10 },
      },
      {
        x: marks.filter((m) => m.phi !== null).map((m) => m.phi as number),
        y: marks.filter((m) => m.phi !== null).map((m) => RMat(m.phi as number)),
        text: marks.filter((m) => m.phi !== null).map((m) => m.label),
        name: 'Ángulos característicos',
        type: 'scatter',
        mode: 'markers',
        marker: { color: GREY, size: 8, symbol: 'diamond' },
        hovertemplate: '%{text}: %{x:.1f}°<extra></extra>',
      },
    ]
  }, [s, c])
  const gz = useMemo<Data[]>(
    () => [
      { x: s.curve.map((p) => p.phi), y: s.curve.map((p) => p.GZ), name: 'GZ', type: 'scatter', mode: 'lines', line: { color: C1 } },
      { x: s.curve.map((p) => p.phi), y: s.curve.map((p) => p.theta), name: 'Asiento (°)', type: 'scatter', mode: 'lines', yaxis: 'y2', line: { color: GREY, dash: 'dot' } },
    ],
    [s],
  )
  return (
    <div className="grid2">
      <Plot data={data} layout={{ title: { text: 'Momento adrizante y escorante' }, xaxis: { title: { text: 'Escora (°)' } }, yaxis: { title: { text: 'N·m' } } }} />
      <Plot
        data={gz}
        layout={{
          title: { text: 'Curva GZ' },
          xaxis: { title: { text: 'Escora (°)' } },
          yaxis: { title: { text: 'GZ (m)' } },
          yaxis2: { overlaying: 'y', side: 'right', title: { text: 'Asiento (°)' }, showgrid: false },
        }}
      />
      <table className="table">
        <tbody>
          <tr>
            <td>GM inicial</td>
            <td>{s.gm.toFixed(3)} m</td>
            <td>GZ máximo</td>
            <td>
              {s.gzMax.toFixed(3)} m a {s.phiGzMax}°
            </td>
          </tr>
          <tr>
            <td>Momento adrizante máximo</td>
            <td>{s.rmMax.toFixed(2)} N·m</td>
            <td>Estabilidad nula</td>
            <td>{s.phiVanish === null ? '> 90°' : s.phiVanish.toFixed(1) + '°'}</td>
          </tr>
          <tr>
            <td>Sale el patín de barlovento</td>
            <td>{s.phiPortOut === null ? '—' : s.phiPortOut + '°'}</td>
            <td>Sale el casco central</td>
            <td>{s.phiMainOut === null ? '—' : s.phiMainOut + '°'}</td>
          </tr>
          <tr>
            <td>Patín de sotavento sumergido</td>
            <td>{s.phiStbdFull === null ? 'No llega a sumergirse' : s.phiStbdFull + '°'}</td>
            <td>Reserva de flotabilidad de cada patín</td>
            <td>{v.amaReserve.toFixed(0)} % del desplazamiento</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function SailChart({ v }: { v: AnalysisView }) {
  const c = v.condition
  const sc = v.sailCurves
  const polar = useMemo<Data[]>(
    () => [
      { x: sc.map((p) => p.alpha), y: sc.map((p) => p.CL), name: 'CL', type: 'scatter', mode: 'lines', line: { color: C1 } },
      { x: sc.map((p) => p.alpha), y: sc.map((p) => p.CD), name: 'CD', type: 'scatter', mode: 'lines', yaxis: 'y2', line: { color: C2 } },
      { x: [c.alpha], y: [c.sail.CL], name: 'Punto actual', type: 'scatter', mode: 'markers', marker: { color: C1, size: 10 } },
    ],
    [sc, c],
  )
  const moment = useMemo<Data[]>(
    () => [
      { x: sc.map((p) => p.alpha), y: sc.map((p) => p.M), name: 'Momento en el eje (ángulo de cola actual)', type: 'scatter', mode: 'lines', line: { color: C4 } },
      { x: [c.alpha], y: [0], name: 'Equilibrio', type: 'scatter', mode: 'markers', marker: { color: C4, size: 10 } },
    ],
    [sc, c],
  )
  const span = useMemo<Data[]>(() => {
    const w = c.sail.strips.filter((s) => s.surface === 0)
    const t = c.sail.strips.filter((s) => s.surface === 1)
    const clMax = v.design.sail.clMax
    return [
      { y: w.map((s) => s.z), x: w.map((s) => s.cl), name: 'cl local vela', type: 'scatter', mode: 'lines+markers', line: { color: C2 }, marker: { color: w.map((s) => (s.stalled ? '#d64545' : C2)) } },
      { y: t.map((s) => s.z), x: t.map((s) => s.cl), name: 'cl local cola', type: 'scatter', mode: 'lines+markers', line: { color: C4 } },
      { y: [0, v.design.sail.gap + v.design.sail.height], x: [clMax, clMax], name: 'CL máx', type: 'scatter', mode: 'lines', line: { color: GREY, dash: 'dash' } },
    ]
  }, [c, v.design])
  const tail = useMemo<Data[]>(
    () => [{ x: v.tailCurve.map((p) => p.tail), y: v.tailCurve.map((p) => p.alpha), name: 'α de equilibrio', type: 'scatter', mode: 'lines', line: { color: C3 } }],
    [v.tailCurve],
  )
  return (
    <div className="grid2">
      <Plot
        data={polar}
        layout={{
          title: { text: 'Coeficientes de la vela (con la cola)' },
          xaxis: { title: { text: 'α (°)' } },
          yaxis: { title: { text: 'CL' } },
          yaxis2: { overlaying: 'y', side: 'right', title: { text: 'CD' }, showgrid: false },
        }}
      />
      <Plot data={span} layout={{ title: { text: 'Carga en altura' }, xaxis: { title: { text: 'cl local' } }, yaxis: { title: { text: 'Altura sobre cubierta (m)' } } }} />
      <Plot data={moment} layout={{ title: { text: 'Momento respecto al eje (N·m; + aumenta α)' }, xaxis: { title: { text: 'α (°)' } } }} />
      <Plot data={tail} layout={{ title: { text: 'Ángulo de cola y ángulo de ataque de equilibrio' }, xaxis: { title: { text: 'Ángulo de cola (°)' } }, yaxis: { title: { text: 'α de equilibrio (°)' } } }} />
      <table className="table">
        <tbody>
          <tr>
            <td>Superficie de la vela</td>
            <td>{(0.5 * (v.design.sail.rootChord + v.design.sail.tipChord) * v.design.sail.height).toFixed(3)} m²</td>
            <td>Alargamiento geométrico</td>
            <td>{((v.design.sail.height * v.design.sail.height) / (0.5 * (v.design.sail.rootChord + v.design.sail.tipChord) * v.design.sail.height)).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Margen de estabilidad vela-cola</td>
            <td>{c.tailMargin.toFixed(1)} % de la cuerda media</td>
            <td>Desequilibrio de masas</td>
            <td>
              {(v.sailAssembly.offset * 100).toFixed(1)} cm ({v.sailAssembly.mass.toFixed(2)} kg)
            </td>
          </tr>
          <tr>
            <td>Resistencia inducida / de perfil</td>
            <td>
              {c.sail.dragInduced.toFixed(3)} / {c.sail.dragProfile.toFixed(3)} N
            </td>
            <td>Reynolds en la cuerda media</td>
            <td>{(((c.aws * 0.5 * (v.design.sail.rootChord + v.design.sail.tipChord)) / v.design.env.nuAir) / 1e5).toFixed(2)} × 10⁵</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function MassChart({ v }: { v: AnalysisView }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Partida</th>
          <th>Masa (kg)</th>
          <th>x (m)</th>
          <th>y (m)</th>
          <th>z (m)</th>
        </tr>
      </thead>
      <tbody>
        {v.massItems.map((m, i) => (
          <tr key={i}>
            <td>{m.name}</td>
            <td>{m.mass.toFixed(2)}</td>
            <td>{m.x.toFixed(3)}</td>
            <td>{m.y.toFixed(3)}</td>
            <td>{m.z.toFixed(3)}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Total y CG</td>
          <td>{v.mass.toFixed(2)}</td>
          <td>{v.G.x.toFixed(3)}</td>
          <td>{v.G.y.toFixed(3)}</td>
          <td>{v.G.z.toFixed(3)}</td>
        </tr>
      </tbody>
    </table>
  )
}
