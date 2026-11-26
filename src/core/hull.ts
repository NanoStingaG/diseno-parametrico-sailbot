import { pchip } from './math'
import type { HullShape } from './types'

/** Un casco colocado en el sistema del barco. */
export interface HullBody {
  name: string
  shape: HullShape
  /** x de la popa del casco */
  x0: number
  /** y de la crujía del casco */
  yc: number
  /** z del punto más bajo de su quilla */
  zBase: number
  B: (xl: number) => number
  T: (xl: number) => number
  D: (xl: number) => number
  /** Altura de la quilla sobre zBase en xl */
  keel: (xl: number) => number
  /** Calado máximo de la forma (flotación de diseño sobre zBase) */
  Tmax: number
}

export function effectiveStations(s: HullShape) {
  const q3B = s.symmetric ? s.B.q1 : s.B.q3
  const q3T = s.symmetric ? s.T.q1 : s.T.q3
  const q3D = s.symmetric ? s.D.q1 : s.D.q3
  return {
    B: [0, s.B.q1, s.B.q2, q3B, 0],
    T: [0, s.T.q1, s.T.q2, q3T, 0],
    D: [s.D.q1, s.D.q1, s.D.q2, q3D, q3D],
  }
}

export function makeHull(name: string, shape: HullShape, x0: number, yc: number, zBase: number): HullBody {
  const L = shape.L
  const xs = [0, L / 4, L / 2, (3 * L) / 4, L]
  const st = effectiveStations(shape)
  const Bf = pchip(xs, st.B)
  const Tf = pchip(xs, st.T)
  const Df = pchip(xs, st.D)
  const Tmax = Math.max(...st.T)
  return {
    name,
    shape,
    x0,
    yc,
    zBase,
    B: (xl) => Math.max(0, Bf(xl)),
    T: (xl) => Math.max(0, Tf(xl)),
    D: (xl) => Math.max(Df(xl), Tf(xl)),
    keel: (xl) => Tmax - Math.max(0, Tf(xl)),
    Tmax,
  }
}

const SECTION_PTS = 12

/**
 * Polilínea de la sección (y, z) en coordenadas del barco, de cubierta babor a cubierta estribor.
 * Bajo la flotación de diseño es una superelipse; por encima, costados verticales.
 */
export function sectionPolyline(h: HullBody, xl: number): number[] {
  const b = h.B(xl) / 2
  const T = h.T(xl)
  const D = h.D(xl)
  const zk = h.zBase + h.keel(xl)
  const n = Math.max(0.5, h.shape.n)
  if (b <= 1e-6 || D <= 1e-6) return []
  // media sección estribor desde la quilla hasta cubierta
  const half: number[] = []
  if (T > 1e-6) {
    for (let i = 0; i <= SECTION_PTS; i++) {
      const t = (i / SECTION_PTS) * (Math.PI / 2)
      const y = b * Math.pow(Math.sin(t), 2 / n)
      const w = T * Math.pow(Math.cos(t), 2 / n)
      half.push(y, T - w)
    }
  } else {
    half.push(0, 0, b, 0)
  }
  half.push(b, D)
  const pts: number[] = []
  // babor: recorrer half al revés con y negativa
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(h.yc - half[i], zk + half[i + 1])
  for (let i = 2; i < half.length; i += 2) pts.push(h.yc + half[i], zk + half[i + 1])
  return pts
}

/** Recorta un polígono cerrado (y,z) con a*y + b*z <= c. Devuelve área y centroide. */
export function clipPolygon(p: number[], a: number, b: number, c: number) {
  const n = p.length / 2
  const out: number[] = []
  if (n < 3) return { area: 0, cy: 0, cz: 0, poly: out }
  for (let i = 0; i < n; i++) {
    const y1 = p[2 * i]
    const z1 = p[2 * i + 1]
    const j = (i + 1) % n
    const y2 = p[2 * j]
    const z2 = p[2 * j + 1]
    const s1 = a * y1 + b * z1 - c
    const s2 = a * y2 + b * z2 - c
    if (s1 <= 0) out.push(y1, z1)
    if ((s1 <= 0) !== (s2 <= 0)) {
      const t = s1 / (s1 - s2)
      out.push(y1 + t * (y2 - y1), z1 + t * (z2 - z1))
    }
  }
  const m = out.length / 2
  let A = 0
  let Cy = 0
  let Cz = 0
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m
    const cr = out[2 * i] * out[2 * j + 1] - out[2 * j] * out[2 * i + 1]
    A += cr
    Cy += (out[2 * i] + out[2 * j]) * cr
    Cz += (out[2 * i + 1] + out[2 * j + 1]) * cr
  }
  A /= 2
  if (Math.abs(A) < 1e-14) return { area: 0, cy: 0, cz: 0, poly: out }
  return { area: Math.abs(A), cy: Cy / (6 * A), cz: Cz / (6 * A), poly: out }
}

/** Longitud de la polilínea abierta por debajo de a*y + b*z <= c (perímetro mojado). */
export function clipPolylineLength(p: number[], a: number, b: number, c: number): number {
  let L = 0
  for (let i = 0; i + 3 < p.length; i += 2) {
    const y1 = p[i]
    const z1 = p[i + 1]
    const y2 = p[i + 2]
    const z2 = p[i + 3]
    const s1 = a * y1 + b * z1 - c
    const s2 = a * y2 + b * z2 - c
    const seg = Math.hypot(y2 - y1, z2 - z1)
    if (s1 <= 0 && s2 <= 0) L += seg
    else if (s1 <= 0 || s2 <= 0) {
      const t = s1 / (s1 - s2)
      L += s1 <= 0 ? seg * t : seg * (1 - t)
    }
  }
  return L
}

/** Volumen total encerrado por un casco hasta su cubierta (m³). */
export function hullTotalVolume(h: HullBody, N = 80): number {
  const dx = h.shape.L / N
  let V = 0
  for (let i = 0; i < N; i++) {
    const xl = (i + 0.5) * dx
    const poly = sectionPolyline(h, xl)
    if (poly.length < 6) continue
    const r = clipPolygon(poly, 0, 1, 1e9)
    V += r.area * dx
  }
  return V
}

/** Escala manga y calado de una forma para alcanzar un volumen objetivo (hasta cubierta). */
export function scaleShapeToVolume(shape: HullShape, target: number): HullShape {
  const make = (s: number): HullShape => ({
    ...shape,
    B: { q1: shape.B.q1 * s, q2: shape.B.q2 * s, q3: shape.B.q3 * s },
    T: { q1: shape.T.q1 * s, q2: shape.T.q2 * s, q3: shape.T.q3 * s },
  })
  const vol = (s: number) => hullTotalVolume(makeHull('tmp', make(s), 0, 0, 0), 40)
  let lo = 0.05
  let hi = 5
  if (vol(hi) < target) return make(hi)
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi)
    if (vol(mid) < target) lo = mid
    else hi = mid
  }
  return make(0.5 * (lo + hi))
}
