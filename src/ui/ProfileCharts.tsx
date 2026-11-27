import { useMemo } from 'react'
import type { Data } from 'plotly.js'
import { Plot } from './Plot'
import type { ProfilePolars } from '../core/studies'
import { SERIES } from './colors'

/** Polares 2D del perfil a los Reynolds de trabajo: cl(α), cd(cl) y cm(α). */
export function ProfilePolarCharts({ p }: { p: ProfilePolars }) {
  const sets = useMemo(() => {
    const line = (i: number, dash?: 'dash') => ({ color: SERIES[i % SERIES.length], width: 2, dash })
    const lab = (c: ProfilePolars['curves'][number]) => `${c.label} (Re ${(c.re / 1000).toFixed(0)}k)`
    const cl: Data[] = p.curves.map((c, i) => ({ x: c.alpha, y: c.cl, name: lab(c), type: 'scatter', mode: 'lines', line: line(i, /comparación/.test(c.label) ? 'dash' : undefined) }))
    const cd: Data[] = p.curves.map((c, i) => ({ x: c.cd, y: c.cl, name: lab(c), type: 'scatter', mode: 'lines', line: line(i, /comparación/.test(c.label) ? 'dash' : undefined), showlegend: false }))
    const cm: Data[] = p.curves.map((c, i) => ({ x: c.alpha, y: c.cm, name: lab(c), type: 'scatter', mode: 'lines', line: line(i, /comparación/.test(c.label) ? 'dash' : undefined), showlegend: false }))
    return { cl, cd, cm }
  }, [p])
  return (
    <div className="grid3">
      <Plot data={sets.cl} height={330} layout={{ title: { text: 'cl frente a α' }, xaxis: { title: { text: 'α (°)' } }, yaxis: { title: { text: 'cl' } }, margin: { b: 130 }, legend: { orientation: 'h', y: -0.3, x: 0 } }} />
      <Plot data={sets.cd} height={330} layout={{ title: { text: 'Polar cl – cd' }, xaxis: { title: { text: 'cd' }, range: [0, 0.12] }, yaxis: { title: { text: 'cl' } }, margin: { b: 130 } }} />
      <Plot data={sets.cm} height={330} layout={{ title: { text: 'cm (c/4) frente a α' }, xaxis: { title: { text: 'α (°)' } }, yaxis: { title: { text: 'cm' } }, margin: { b: 130 } }} />
    </div>
  )
}
