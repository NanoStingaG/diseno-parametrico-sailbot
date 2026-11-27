import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot } from './Plot'
import { SpeedPolar } from './SpeedPolar'
import { ProfilePolarCharts } from './ProfileCharts'
import type { DesignCurves, Sensitivity } from '../core/studies'
import type { AnalysisView } from '../core/view'
import { C1, C2, C3, C4, C5, C6, SERIES } from './colors'
import { KNOT } from '../core/math'

export interface TaskProgress {
  done: number
  total: number
  note?: string
}

export function ProgressBar({ p, label }: { p: TaskProgress; label: string }) {
  const pct = p.total > 0 ? (100 * p.done) / p.total : 0
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
      <span>
        {label} {p.note ? `· ${p.note}` : ''} ({p.done}/{p.total})
      </span>
    </div>
  )
}

export function CurvesWindow(props: {
  view: AnalysisView | null
  curves: DesignCurves | null
  progress: TaskProgress | null
  stale: boolean
  twsText: string
  setTwsText: (s: string) => void
  onRun: () => void
  sens: Sensitivity | null
  sensProgress: TaskProgress | null
  onSens: (step: number) => void
}) {
  const { view, curves, progress, stale, twsText, setTwsText, onRun, sens, sensProgress, onSens } = props
  return (
    <div className="window">
      <div className="toolbar">
        <label>
          Vientos reales para las curvas (m/s)
          <input value={twsText} onChange={(e) => setTwsText(e.target.value)} aria-label="Vientos reales para las curvas" />
        </label>
        <button className="btn primary" onClick={onRun} disabled={!!progress}>
          {progress ? 'Calculando…' : 'Recalcular curvas'}
        </button>
        {progress && <ProgressBar p={progress} label="Curvas de diseño" />}
        {!progress && stale && curves && <span className="hint">Las curvas corresponden a una versión anterior del diseño: se recalculan solas en unos segundos.</span>}
      </div>
      {!curves ? (
        <div className="loading">{progress ? 'Calculando las curvas de diseño (unos 15 s)…' : 'Sin curvas todavía.'}</div>
      ) : (
        <>
          <div className="grid2">
            <section className="card">
              <h2>Polar de velocidades</h2>
              <SpeedPolar curves={curves.polar} title={`Velocidad frente al ángulo del viento real, ${curves.polarMode}`} />
              <p className="hint">Las cruces marcan las condiciones en las que el barco vuelca.</p>
            </section>
            <section className="card">
              <h2>Empuje y resistencia frente a la velocidad</h2>
              <ThrustChart c={curves} />
              <ResistanceChart c={curves} />
            </section>
          </div>
          <div className="grid2">
            <section className="card">
              <h2>Inmersión de los patines</h2>
              {view && <AmaHeelChart v={view} />}
              <AmaTwsChart c={curves} />
            </section>
            <section className="card">
              <h2>Curvas hidrostáticas</h2>
              <HydroCharts c={curves} />
            </section>
          </div>
          <section className="card wide">
            <h2>Polares del perfil a los Reynolds de trabajo</h2>
            <ProfilePolarCharts p={curves.profile} />
          </section>
        </>
      )}
      <section className="card wide">
        <h2>Sensibilidad</h2>
        <div className="toolbar">
          <span className="hint">Cambio de la velocidad y del viento de vuelco al variar cada parámetro de diseño ±10 % (los demás fijos).</span>
          <button className="btn primary" onClick={() => onSens(0.1)} disabled={!!sensProgress}>
            {sensProgress ? 'Calculando…' : sens ? 'Recalcular sensibilidad' : 'Calcular sensibilidad'}
          </button>
          {sensProgress && <ProgressBar p={sensProgress} label="Sensibilidad" />}
        </div>
        {sens && <Tornado s={sens} />}
      </section>
    </div>
  )
}

function vline(x: number, label: string): { shapes: Partial<Layout>['shapes']; annotations: Partial<Layout>['annotations'] } {
  return {
    shapes: [{ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { color: '#9aa5b1', dash: 'dot', width: 1 } }],
    annotations: [{ x, yref: 'paper', y: 1, text: label, showarrow: false, xanchor: 'left', yanchor: 'top', xshift: 4, font: { size: 10, color: '#52606d' } }],
  }
}

function ThrustChart({ c }: { c: DesignCurves }) {
  const t = c.thrust
  const data = useMemo<Data[]>(() => {
    const kn = t.V.map((v) => v / KNOT)
    return [
      { x: kn, y: t.total, name: 'Resistencia total', type: 'scatter', mode: 'lines', line: { color: '#1f2933', width: 2.5 } },
      ...t.drive.map(
        (d, i): Data => ({ x: kn, y: d.values, name: `Empuje con TWS ${d.tws.toFixed(1)} m/s`, type: 'scatter', mode: 'lines', line: { color: SERIES[i % SERIES.length], width: 2 } }),
      ),
    ]
  }, [t])
  return (
    <Plot
      data={data}
      height={320}
      layout={{
        title: { text: `Empuje de la vela y resistencia, TWA ${t.twa}°` },
        xaxis: { title: { text: 'Velocidad (nudos)' } },
        yaxis: { title: { text: 'N' }, rangemode: 'tozero' },
        hovermode: 'x unified',
      }}
    />
  )
}

function ResistanceChart({ c }: { c: DesignCurves }) {
  const t = c.thrust
  const data = useMemo<Data[]>(() => {
    const kn = t.V.map((v) => v / KNOT)
    const comp: [number[], string, string][] = [
      [t.friction, 'Fricción de cascos', C1],
      [t.wave, 'Olas (Michell)', C2],
      [t.appendages, 'Apéndices', C3],
      [t.induced, 'Inducida (deriva)', C4],
    ]
    return comp.map(([y, name, color]) => ({ x: kn, y, name, type: 'scatter', mode: 'lines', stackgroup: 'r', line: { color, width: 1.5 } }) as Data)
  }, [t])
  const v05 = (0.5 / t.froude[t.froude.length - 1]) * t.V[t.V.length - 1]
  const lines = v05 < t.V[t.V.length - 1] ? vline(v05 / KNOT, 'Fn = 0,5') : { shapes: [], annotations: [] }
  return (
    <Plot
      data={data}
      height={320}
      layout={{
        title: { text: 'Resistencia por componentes (apiladas)' },
        xaxis: { title: { text: 'Velocidad (nudos)' } },
        yaxis: { title: { text: 'N' } },
        hovermode: 'x unified',
        ...lines,
      }}
    />
  )
}

function AmaHeelChart({ v }: { v: AnalysisView }) {
  const data = useMemo<Data[]>(() => {
    const curve = v.stability.curve
    const V = Math.max(v.amaVolume, 1e-9)
    return [
      { x: curve.map((p) => p.phi), y: curve.map((p) => (p.vStbd / V) * 100), name: 'Patín de sotavento', type: 'scatter', mode: 'lines', line: { color: C1, width: 2 } },
      { x: curve.map((p) => p.phi), y: curve.map((p) => (p.vPort / V) * 100), name: 'Patín de barlovento', type: 'scatter', mode: 'lines', line: { color: C2, width: 2 } },
    ]
  }, [v])
  const phi = Math.abs(v.condition.phi) * (180 / Math.PI)
  return (
    <Plot
      data={data}
      height={300}
      layout={{
        title: { text: 'Volumen sumergido de cada patín frente a la escora' },
        xaxis: { title: { text: 'Escora (°)' }, range: [0, 60] },
        yaxis: { title: { text: '% del volumen del patín' }, range: [0, 105] },
        hovermode: 'x unified',
        ...vline(phi, `equilibrio ${phi.toFixed(1)}°`),
      }}
    />
  )
}

function AmaTwsChart({ c }: { c: DesignCurves }) {
  const a = c.amaVsTws
  const data = useMemo<Data[]>(
    () => [
      {
        x: a.tws,
        y: a.leeward,
        name: 'Patín de sotavento',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: C1, width: 2 },
        text: a.heel.map((h, i) => `escora ${Math.abs(h).toFixed(1)}° · ${a.kn[i].toFixed(2)} nudos${a.capsized[i] ? ' · vuelca' : ''}`),
        hovertemplate: 'TWS %{x} m/s: %{y:.0f} %<br>%{text}<extra>Sotavento</extra>',
      },
      { x: a.tws, y: a.windward, name: 'Patín de barlovento', type: 'scatter', mode: 'lines+markers', line: { color: C2, width: 2 } },
    ],
    [a],
  )
  return (
    <Plot
      data={data}
      height={300}
      layout={{
        title: { text: `Inmersión de los patines frente al viento real (TWA ${a.twa}°)` },
        xaxis: { title: { text: 'TWS (m/s)' } },
        yaxis: { title: { text: '% del volumen del patín' }, range: [0, 105] },
      }}
    />
  )
}

function HydroCharts({ c }: { c: DesignCurves }) {
  const h = c.hydro
  const mark = vline(h.current, 'actual')
  const d1 = useMemo<Data[]>(
    () => [
      { x: h.mass, y: h.draft.map((x) => x * 100), name: 'Calado del casco central', type: 'scatter', mode: 'lines', line: { color: C1, width: 2 } },
      { x: h.mass, y: h.freeboard.map((x) => x * 100), name: 'Francobordo', type: 'scatter', mode: 'lines', line: { color: C2, width: 2 } },
    ],
    [h],
  )
  const d2 = useMemo<Data[]>(
    () => [
      { x: h.mass, y: h.gm, name: 'GM inicial', type: 'scatter', mode: 'lines', line: { color: C3, width: 2 } },
      { x: h.mass, y: h.km, name: 'KM', type: 'scatter', mode: 'lines', line: { color: C5, width: 2 } },
    ],
    [h],
  )
  const d3 = useMemo<Data[]>(() => [{ x: h.mass, y: h.amaShare, name: 'Empuje de los patines', type: 'scatter', mode: 'lines', line: { color: C6, width: 2 } }], [h])
  const base = { xaxis: { title: { text: 'Desplazamiento (kg)' } }, hovermode: 'x unified' as const, ...mark, margin: { b: 100 }, legend: { orientation: 'h' as const, y: -0.42, x: 0 } }
  return (
    <>
      <Plot data={d1} height={290} layout={{ ...base, title: { text: 'Calado y francobordo en el centro' }, yaxis: { title: { text: 'cm' } } }} />
      <Plot data={d2} height={290} layout={{ ...base, title: { text: 'Altura metacéntrica (CG fijo)' }, yaxis: { title: { text: 'm' } } }} />
      <Plot data={d3} height={240} layout={{ ...base, title: { text: 'Empuje de los patines en adrizado' }, yaxis: { title: { text: '% del total' } }, showlegend: false }} />
    </>
  )
}

function Tornado({ s }: { s: Sensitivity }) {
  const rows = [...s.rows].sort((a, b) => Math.max(Math.abs(a.speedMinus), Math.abs(a.speedPlus)) - Math.max(Math.abs(b.speedMinus), Math.abs(b.speedPlus)))
  const mk = (key: 'speed' | 'capsize'): Data[] => {
    const minus = rows.map((r) => (key === 'speed' ? r.speedMinus : r.capsizeMinus))
    const plus = rows.map((r) => (key === 'speed' ? r.speedPlus : r.capsizePlus))
    const y = rows.map((r) => r.label)
    return [
      { type: 'bar', orientation: 'h', y, x: minus, name: `parámetro −${(s.step * 100).toFixed(0)} %`, marker: { color: C2 }, hovertemplate: '%{y}: %{x:.2f} %<extra>−</extra>' },
      { type: 'bar', orientation: 'h', y, x: plus, name: `parámetro +${(s.step * 100).toFixed(0)} %`, marker: { color: C1 }, hovertemplate: '%{y}: %{x:.2f} %<extra>+</extra>' },
    ]
  }
  const h = Math.max(320, 22 * rows.length + 120)
  const lay = (t: string): Partial<Layout> => ({ title: { text: t }, barmode: 'overlay', margin: { l: 230, r: 20, t: 36, b: 70 }, xaxis: { title: { text: '% de cambio' } }, bargap: 0.25 })
  return (
    <div className="grid2">
      <Plot data={mk('speed')} height={h} layout={lay(`Velocidad (base ${s.base.speed.toFixed(2)} nudos)`)} />
      <Plot data={mk('capsize')} height={h} layout={lay(`Viento de vuelco (base ${s.base.capsize.toFixed(1)} m/s)`)} />
    </div>
  )
}
