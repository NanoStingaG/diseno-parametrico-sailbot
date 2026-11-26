import type { ReactNode } from 'react'
import type { AnalysisView } from '../core/view'
import { DEG, interp } from '../core/math'
import { nacaSymmetric } from '../core/profile'

interface Frame {
  umin: number
  umax: number
  vmin: number
  vmax: number
  W: number
  H: number
  k: number
  pad: number
}

function makeFrame(umin: number, umax: number, vmin: number, vmax: number, W: number, pad = 24): Frame {
  const k = (W - 2 * pad) / (umax - umin)
  const H = (vmax - vmin) * k + 2 * pad
  return { umin, umax, vmin, vmax, W, H, k, pad }
}

const sx = (f: Frame, u: number) => (u - f.umin) * f.k + f.pad
const sy = (f: Frame, v: number) => (f.vmax - v) * f.k + f.pad
const pts = (f: Frame, p: [number, number][]) => p.map(([u, v]) => `${sx(f, u).toFixed(1)},${sy(f, v).toFixed(1)}`).join(' ')

const COLORS = {
  hull: '#3e4c59',
  hullFill: '#e4e7eb',
  water: '#2680c2',
  sail: '#c65d21',
  tail: '#e08a3c',
  force: '#d64545',
  hydro: '#2f8132',
  wind: '#7b61b0',
  grid: '#cbd2d9',
}

function Arrow({ f, x, y, dx, dy, color, label, width = 2 }: { f: Frame; x: number; y: number; dx: number; dy: number; color: string; label?: string; width?: number }) {
  const x1 = sx(f, x)
  const y1 = sy(f, y)
  const x2 = sx(f, x + dx)
  const y2 = sy(f, y + dy)
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 2) return null
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const h = Math.min(9, len * 0.4)
  const p1 = [x2 - ux * h - uy * h * 0.45, y2 - uy * h + ux * h * 0.45]
  const p2 = [x2 - ux * h + uy * h * 0.45, y2 - uy * h - ux * h * 0.45]
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - ux * h * 0.6} y2={y2 - uy * h * 0.6} stroke={color} strokeWidth={width} />
      <polygon points={`${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={color} />
      {label && (
        <text x={x2 + ux * 6} y={y2 + uy * 6 + 4} fontSize={11} fill={color} textAnchor={ux < -0.3 ? 'end' : 'start'}>
          {label}
        </text>
      )}
    </g>
  )
}

function Dot({ f, x, y, color, label }: { f: Frame; x: number; y: number; color: string; label: string }) {
  return (
    <g>
      <circle cx={sx(f, x)} cy={sy(f, y)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
      <text x={sx(f, x) + 6} y={sy(f, y) - 6} fontSize={11} fill={color}>
        {label}
      </text>
    </g>
  )
}

function Svg({ f, title, children }: { f: Frame; title: string; children: ReactNode }) {
  return (
    <figure className="view">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${f.W} ${f.H}`} width="100%" role="img" aria-label={title}>
        {children}
      </svg>
    </figure>
  )
}

function forceScale(v: AnalysisView, worldSize: number) {
  const c = v.condition
  const m = Math.max(Math.hypot(c.sail.Fx, c.sail.Fy), Math.abs(c.side.F), Math.abs(c.drive), 1e-6)
  return (0.35 * worldSize) / m
}

/** Vista en planta: proa a la derecha, estribor abajo. */
export function PlanView({ v }: { v: AnalysisView }) {
  const d = v.design
  const c = v.condition
  const yMax = d.ama.y + Math.max(...v.hulls[2].B) / 2 + 0.25
  const xMin = Math.min(v.loa.xMinRot, v.loa.xMin) - 0.3
  const xMax = Math.max(v.loa.xMaxRot, v.loa.xMin + d.limits.loaMax) + 0.3
  const f = makeFrame(xMin, xMax, -yMax, yMax, 560)
  const P = (x: number, y: number): [number, number] => [x, -y]
  const hullPoly = (h: AnalysisView['hulls'][number]) => {
    const top = h.xs.map((x, i) => P(x, h.yc - h.B[i] / 2))
    const bot = h.xs.map((x, i) => P(x, h.yc + h.B[i] / 2)).reverse()
    return pts(f, [...top, ...bot])
  }
  // vela: perfil de la cuerda inferior girado
  const prof = d.sailProfile ?? nacaSymmetric(d.sail.thickness, 30)
  const ca = c.sail.chordAngle
  const cr = d.sail.rootChord
  const wing = prof.map((p): [number, number] => {
    const xs = (p.x - d.sail.pivot) * cr
    const ys = p.y * cr
    return P(d.sail.x + xs * Math.cos(ca) - ys * Math.sin(ca), xs * Math.sin(ca) + ys * Math.cos(ca))
  })
  const ta = ca - (Number.isFinite(c.tail) ? c.tail : d.tail.angle) * DEG
  const tailC = d.tail.chord
  const tailPivot = [d.sail.x + d.tail.arm * Math.cos(ca), d.tail.arm * Math.sin(ca)]
  const tailPts = nacaSymmetric(d.tail.thickness, 16).map((p): [number, number] => {
    const xs = (p.x - 0.25) * tailC
    const ys = p.y * tailC
    return P(tailPivot[0] + xs * Math.cos(ta) - ys * Math.sin(ta), tailPivot[1] + xs * Math.sin(ta) + ys * Math.cos(ta))
  })
  const k = forceScale(v, xMax - xMin)
  const beamXs = [d.ama.x - d.ama.L * 0.25, d.ama.x + d.ama.L * 0.25]
  // viento real: viene por babor desde el ángulo TWA
  const twa = d.env.twa * DEG
  const windLen = 0.5
  const wx0 = xMax - 0.75
  const wy0 = yMax * 0.25
  const loaStart = v.loa.xMin
  return (
    <Svg f={f} title="Planta (proa a la derecha, estribor abajo)">
      <rect x={sx(f, loaStart)} y={sy(f, yMax - 0.05)} width={d.limits.loaMax * f.k} height={(2 * yMax - 0.1) * f.k} fill="none" stroke={v.loa.aligned > d.limits.loaMax ? COLORS.force : COLORS.grid} strokeDasharray="6 4" />
      <text x={sx(f, loaStart) + 4} y={sy(f, yMax - 0.05) + 12} fontSize={10} fill="#7b8794">
        Límite de eslora {d.limits.loaMax.toFixed(2)} m
      </text>
      <circle cx={sx(f, d.sail.x)} cy={sy(f, 0)} r={(v.loa.xMaxRot - v.loa.xMinRot > 0 ? Math.max(d.tail.arm + 0.75 * d.tail.chord, (1 - d.sail.pivot) * cr) : 0) * f.k} fill="none" stroke={COLORS.grid} strokeDasharray="2 4" />
      {beamXs.map((bx, i) => (
        <line key={i} x1={sx(f, bx)} y1={sy(f, d.ama.y)} x2={sx(f, bx)} y2={sy(f, -d.ama.y)} stroke={COLORS.hull} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      ))}
      {v.hulls.map((h) => (
        <polygon key={h.name} points={hullPoly(h)} fill={COLORS.hullFill} stroke={COLORS.hull} strokeWidth={1.5} />
      ))}
      <polygon points={pts(f, wing)} fill="#fbe3d1" stroke={COLORS.sail} strokeWidth={1.5} />
      <line x1={sx(f, d.sail.x)} y1={sy(f, 0)} x2={sx(f, tailPivot[0])} y2={sy(f, -tailPivot[1])} stroke={COLORS.sail} strokeWidth={1.5} />
      <polygon points={pts(f, tailPts)} fill="#fbe3d1" stroke={COLORS.tail} strokeWidth={1.5} />
      <circle cx={sx(f, d.sail.x)} cy={sy(f, 0)} r={3} fill={COLORS.sail} />
      <Arrow f={f} x={c.xCE} y={0} dx={c.sail.Fx * k} dy={-c.sail.Fy * k} color={COLORS.force} label={`Vela ${Math.hypot(c.sail.Fx, c.sail.Fy).toFixed(2)} N`} />
      <Arrow f={f} x={c.xCE} y={0} dx={c.drive * k} dy={0} color={COLORS.force} width={1} label={`Propulsión ${c.drive.toFixed(2)} N`} />
      <Arrow f={f} x={c.side.xCLR} y={0} dx={0} dy={c.side.F * k} color={COLORS.hydro} label={`Agua ${c.side.F.toFixed(2)} N`} />
      <Arrow f={f} x={wx0 + windLen * Math.cos(twa)} y={wy0 + windLen * Math.sin(twa)} dx={-windLen * Math.cos(twa)} dy={-windLen * Math.sin(twa)} color={COLORS.wind} label="Viento real" />
      <Dot f={f} x={v.G.x} y={-v.G.y} color={COLORS.hull} label="G" />
    </Svg>
  )
}

/** Vista desde popa con escora: estribor a la derecha. */
export function SectionView({ v }: { v: AnalysisView }) {
  const d = v.design
  const c = v.condition
  const phi = c.phi
  const cp = Math.cos(phi)
  const sp = Math.sin(phi)
  const T = (y: number, z: number): [number, number] => [y * cp + z * sp, -y * sp + z * cp]
  const curve = v.stability.curve
  const h = interp(
    curve.map((p) => p.phi),
    curve.map((p) => p.h),
    Math.abs(phi) / DEG,
  )
  const yMax = d.ama.y + 0.35
  const zTop = v.sailDeckZ + d.sail.gap + d.sail.height + 0.1
  const zBot = v.keel.tipZ - (v.bulb.enabled ? v.bulb.diameter : 0) - 0.1
  const f = makeFrame(-yMax, yMax, zBot, zTop, 360)
  const sections = v.hulls.map((hv) => {
    const p: [number, number][] = []
    for (let i = 0; i < hv.section.length; i += 2) p.push(T(hv.section[i], hv.section[i + 1]))
    return pts(f, p)
  })
  const keelT = v.keel.thickness * v.keel.rootChord
  const keelPoly = pts(f, [T(-keelT / 2, v.keel.rootZ), T(keelT / 2, v.keel.rootZ), T(keelT / 2, v.keel.tipZ), T(-keelT / 2, v.keel.tipZ)])
  const deck = v.sailDeckZ + d.sail.gap
  const sw = Math.max(0.02, d.sail.thickness * d.sail.rootChord)
  const sailPoly = pts(f, [T(-sw / 2, deck), T(sw / 2, deck), T(sw / 2, deck + d.sail.height), T(-sw / 2, deck + d.sail.height)])
  const k = forceScale(v, 2 * yMax)
  const ce = T(0, c.zCE)
  const clr = T(0, c.side.zCLR)
  const G = T(v.G.y, v.G.z)
  const gz = (Math.sign(phi) || 1) * interp(curve.map((p) => p.phi), curve.map((p) => p.GZ), Math.abs(phi) / DEG)
  const beam = d.ama.y
  const beamZ = v.hulls[0].deckZ[Math.floor(v.hulls[0].deckZ.length / 2)]
  const bulb = v.bulb.enabled ? T(0, v.bulb.z) : null
  return (
    <Svg f={f} title={`Vista desde popa, escora ${(phi / DEG).toFixed(1)}° (estribor a la derecha)`}>
      <rect x={0} y={sy(f, h)} width={f.W} height={f.H - sy(f, h)} fill="#d9ecfa" opacity={0.6} />
      <line x1={0} y1={sy(f, h)} x2={f.W} y2={sy(f, h)} stroke={COLORS.water} strokeWidth={1.5} />
      <polyline points={pts(f, [T(-beam, beamZ), T(beam, beamZ)])} stroke={COLORS.hull} strokeWidth={4} opacity={0.6} fill="none" />
      {sections.map((s, i) => (
        <polygon key={i} points={s} fill={COLORS.hullFill} stroke={COLORS.hull} strokeWidth={1.5} />
      ))}
      <polygon points={keelPoly} fill={COLORS.hullFill} stroke={COLORS.hull} />
      {bulb && <circle cx={sx(f, bulb[0])} cy={sy(f, bulb[1])} r={(v.bulb.diameter / 2) * f.k} fill={COLORS.hullFill} stroke={COLORS.hull} />}
      <polygon points={sailPoly} fill="#fbe3d1" stroke={COLORS.sail} />
      <Arrow f={f} x={ce[0]} y={ce[1]} dx={c.sail.Fy * k * cp} dy={-c.sail.Fy * k * sp} color={COLORS.force} label="F lateral vela" />
      <Arrow f={f} x={clr[0]} y={clr[1]} dx={-c.side.F * k * cp} dy={c.side.F * k * sp} color={COLORS.hydro} label="F lateral agua" />
      <Dot f={f} x={G[0]} y={G[1]} color={COLORS.hull} label="G" />
      <Dot f={f} x={G[0] + gz} y={Math.min(h - 0.03, G[1])} color={COLORS.water} label="B" />
      <text x={8} y={16} fontSize={11} fill="#52606d">
        M escorante {c.heelMoment.toFixed(2)} N·m · M adrizante {c.righting.toFixed(2)} N·m
      </text>
    </Svg>
  )
}

/** Perfil: proa a la derecha. */
export function ProfileView({ v }: { v: AnalysisView }) {
  const d = v.design
  const c = v.condition
  const zTop = v.sailDeckZ + d.sail.gap + Math.max(d.sail.height, d.tail.height + d.tail.span) + 0.1
  const zBot = Math.min(v.keel.tipZ, v.rudder.tipZ) - (v.bulb.enabled ? v.bulb.diameter : 0) - 0.08
  const xMin = Math.min(v.loa.xMin, 0) - 0.2
  const xMax = Math.max(v.loa.xMax, d.hull.L) + 0.2
  const f = makeFrame(xMin, xMax, zBot, zTop, 560)
  const main = v.hulls[0]
  const ama = v.hulls[2]
  const outline = (hv: AnalysisView['hulls'][number]) => pts(f, [...hv.xs.map((x, i): [number, number] => [x, hv.keelZ[i]]), ...hv.xs.map((x, i): [number, number] => [x, hv.deckZ[i]]).reverse()])
  const foil = (g: AnalysisView['keel']) =>
    pts(f, [
      [g.rootX + 0.25 * g.rootChord, g.rootZ],
      [g.rootX - 0.75 * g.rootChord, g.rootZ],
      [g.tipX - 0.75 * g.tipChord, g.tipZ],
      [g.tipX + 0.25 * g.tipChord, g.tipZ],
    ])
  const deck = v.sailDeckZ + d.sail.gap
  const s = d.sail
  const leR = s.x + s.pivot * s.rootChord
  const teR = leR - s.rootChord
  const leT = s.x + s.pivot * s.rootChord - s.height * Math.tan(s.sweep * DEG) - s.pivot * (s.rootChord - s.tipChord)
  const teT = leT - s.tipChord
  const sail = pts(f, [
    [leR, deck],
    [teR, deck],
    [teT, deck + s.height],
    [leT, deck + s.height],
  ])
  const t = d.tail
  const tl = s.x - t.arm + 0.25 * t.chord
  const tail = pts(f, [
    [tl, deck + t.height],
    [tl - t.chord, deck + t.height],
    [tl - t.chord, deck + t.height + t.span],
    [tl, deck + t.height + t.span],
  ])
  const h = v.upright.h
  return (
    <Svg f={f} title="Perfil (proa a la derecha), vela alineada a crujía">
      <rect x={0} y={sy(f, h)} width={f.W} height={f.H - sy(f, h)} fill="#d9ecfa" opacity={0.6} />
      <line x1={0} y1={sy(f, h)} x2={f.W} y2={sy(f, h)} stroke={COLORS.water} strokeWidth={1.5} />
      <polygon points={outline(ama)} fill="none" stroke={COLORS.hull} strokeDasharray="5 3" />
      <polygon points={outline(main)} fill={COLORS.hullFill} stroke={COLORS.hull} strokeWidth={1.5} />
      <polygon points={foil(v.keel)} fill={COLORS.hullFill} stroke={COLORS.hull} />
      <polygon points={foil(v.rudder)} fill={COLORS.hullFill} stroke={COLORS.hull} />
      {v.bulb.enabled && <ellipse cx={sx(f, v.bulb.x)} cy={sy(f, v.bulb.z)} rx={(v.bulb.length / 2) * f.k} ry={(v.bulb.diameter / 2) * f.k} fill={COLORS.hullFill} stroke={COLORS.hull} />}
      <polygon points={sail} fill="#fbe3d1" stroke={COLORS.sail} strokeWidth={1.5} />
      <line x1={sx(f, s.x)} y1={sy(f, deck + t.height + t.span / 2)} x2={sx(f, tl - t.chord / 2)} y2={sy(f, deck + t.height + t.span / 2)} stroke={COLORS.sail} />
      <polygon points={tail} fill="#fbe3d1" stroke={COLORS.tail} />
      <line x1={sx(f, s.x)} y1={sy(f, v.sailDeckZ)} x2={sx(f, s.x)} y2={sy(f, deck + s.height)} stroke={COLORS.sail} strokeDasharray="3 3" />
      <Dot f={f} x={s.x} y={c.zCE} color={COLORS.force} label="CE" />
      <Dot f={f} x={c.side.xCLR} y={c.side.zCLR} color={COLORS.hydro} label="CLR" />
      <Dot f={f} x={v.G.x} y={v.G.z} color={COLORS.hull} label="G" />
      <text x={8} y={16} fontSize={11} fill="#52606d">
        Eslora total {v.loa.aligned.toFixed(2)} m · calado máximo {(h - Math.min(v.keel.tipZ - (v.bulb.enabled ? v.bulb.diameter / 2 : 0), v.rudder.tipZ)).toFixed(2)} m
      </text>
    </Svg>
  )
}
