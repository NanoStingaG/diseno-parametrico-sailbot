import { useState } from 'react'
import type { PolarCurve } from '../core/studies'
import { SERIES } from './colors'

/** Polar de velocidades en SVG: ángulo = TWA (0° arriba, viento real), radio = velocidad (nudos). */
export function SpeedPolar({ curves, title, names, colors }: { curves: PolarCurve[]; title: string; names?: string[]; colors?: string[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const W = 420
  const H = 420
  const cx = 60
  const cy = 210
  const R = 180
  const vMax = Math.max(0.5, ...curves.flatMap((c) => c.points.map((p) => p.kn)))
  const step = niceStep(vMax / 4)
  const top = Math.ceil(vMax / step) * step
  const P = (twa: number, kn: number): [number, number] => {
    const a = (twa * Math.PI) / 180
    const r = (kn / top) * R
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  }
  const rings: number[] = []
  for (let v = step; v <= top + 1e-9; v += step) rings.push(v)
  const name = (i: number) => names?.[i] ?? `TWS ${curves[i].tws.toFixed(1)} m/s`
  const col = (i: number) => colors?.[i] ?? SERIES[i % SERIES.length]
  return (
    <figure className="view polar">
      <figcaption>{title} · radio en nudos</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}>
        {rings.map((v) => (
          <g key={v}>
            <path d={`M${cx},${cy - (v / top) * R} A${(v / top) * R},${(v / top) * R} 0 0 1 ${cx},${cy + (v / top) * R}`} fill="none" stroke="#e4e7eb" />
            <text x={cx - 4} y={cy - (v / top) * R + 4} fontSize={10} textAnchor="end" fill="#52606d">
              {v.toFixed(step < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, 150, 180].map((a) => {
          const [x, y] = P(a, top)
          const [tx, ty] = P(a, top * 1.08)
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e4e7eb" />
              <text x={tx} y={ty + 4} fontSize={10} textAnchor="middle" fill="#52606d">
                {a}°
              </text>
            </g>
          )
        })}
        {curves.map((c, i) => {
          const pts = c.points.filter((p) => !p.capsized)
          const d = pts.map((p, j) => `${j ? 'L' : 'M'}${P(p.twa, p.kn).join(',')}`).join('')
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={col(i)} strokeWidth={2} />
              {c.points.map((p) => {
                const [x, y] = P(p.twa, p.kn)
                const id = `${i}-${p.twa}`
                return p.capsized ? (
                  <g key={id}>
                    <path d={`M${x - 5},${y - 5}L${x + 5},${y + 5}M${x - 5},${y + 5}L${x + 5},${y - 5}`} stroke={col(i)} strokeWidth={2} />
                    <title>{`${name(i)} · TWA ${p.twa}°: vuelca`}</title>
                  </g>
                ) : (
                  <circle
                    key={id}
                    cx={x}
                    cy={y}
                    r={hover === id ? 6 : 4}
                    fill={col(i)}
                    stroke="#fff"
                    strokeWidth={1.5}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${name(i)} · TWA ${p.twa}°: ${p.kn.toFixed(2)} nudos, escora ${Math.abs(p.heel).toFixed(1)}°, α ${p.alpha.toFixed(1)}°`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}
        <g transform={`translate(${cx + R + 24}, 30)`}>
          {curves.map((_, i) => (
            <g key={i} transform={`translate(0, ${i * 16})`}>
              <line x1={0} x2={18} y1={0} y2={0} stroke={col(i)} strokeWidth={2} />
              <text x={24} y={4} fontSize={11} fill="#1f2933">
                {name(i)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </figure>
  )
}

function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p
}
