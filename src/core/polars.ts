import { NACA0012_XFOIL, type PolarTable } from './data/naca0012'
import { Foil2D } from './foil2d'
import { nacaSymmetric } from './profile'
import type { Design, Polar2D } from './types'

export interface PolarPoint {
  cl: number
  cd: number
  cm: number
  /** el ángulo está más allá del de CL máximo */
  stalled: boolean
}

/** Rejilla de Reynolds para las polares calculadas por la herramienta. */
export const RE_GRID = [20000, 30000, 50000, 70000, 100000, 150000, 200000, 300000, 500000, 1000000]

/** Ángulo de mezcla con la placa plana a partir del último punto de la tabla (grados). */
const BLEND = 8

/** Placa plana a ángulos grandes (Lindenburg): fuerza normal y centro de presión. */
export function flatPlate(alphaDeg: number, cd0 = 0.02): PolarPoint {
  const a = (alphaDeg * Math.PI) / 180
  const s = Math.sin(a)
  const cn = (2.0 * s) / (0.56 + 0.44 * Math.abs(s))
  const xcp = 0.25 + 0.25 * Math.min(1, Math.abs(a) / (Math.PI / 2))
  return { cl: cn * Math.cos(a), cd: cd0 + Math.abs(cn * s), cm: -cn * (xcp - 0.25), stalled: true }
}

interface Table extends PolarTable {
  aMin: number
  aMax: number
  clMax: number
  aClMax: number
  clMin: number
  aClMin: number
}

function prepare(t: PolarTable): Table {
  // ordenar, completar por simetría si sólo hay α ≥ 0
  const idx = t.alpha.map((_, i) => i).sort((a, b) => t.alpha[a] - t.alpha[b])
  let alpha = idx.map((i) => t.alpha[i])
  let cl = idx.map((i) => t.cl[i])
  let cd = idx.map((i) => t.cd[i])
  let cm = idx.map((i) => t.cm[i] ?? 0)
  if (alpha.length && alpha[0] >= -1e-9) {
    const start = alpha[0] <= 1e-9 ? 1 : 0
    const na: number[] = []
    const ncl: number[] = []
    const ncd: number[] = []
    const ncm: number[] = []
    for (let i = alpha.length - 1; i >= start; i--) {
      na.push(-alpha[i])
      ncl.push(-cl[i])
      ncd.push(cd[i])
      ncm.push(-cm[i])
    }
    alpha = [...na, ...alpha]
    cl = [...ncl, ...cl]
    cd = [...ncd, ...cd]
    cm = [...ncm, ...cm]
  }
  let iMax = 0
  let iMin = 0
  for (let i = 0; i < alpha.length; i++) {
    if (cl[i] > cl[iMax]) iMax = i
    if (cl[i] < cl[iMin]) iMin = i
  }
  return {
    re: t.re,
    alpha,
    cl,
    cd,
    cm,
    aMin: alpha[0],
    aMax: alpha[alpha.length - 1],
    clMax: cl[iMax],
    aClMax: alpha[iMax],
    clMin: cl[iMin],
    aClMin: alpha[iMin],
  }
}

function lin(xs: number[], ys: number[], x: number) {
  let lo = 0
  let hi = xs.length - 1
  if (x <= xs[0]) return ys[0]
  if (x >= xs[hi]) return ys[hi]
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (xs[m] > x) hi = m
    else lo = m
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo])
  return ys[lo] + t * (ys[hi] - ys[lo])
}

function tableAt(t: Table, a: number): PolarPoint {
  const stalled = a > t.aClMax || a < t.aClMin
  if (a >= t.aMin && a <= t.aMax) return { cl: lin(t.alpha, t.cl, a), cd: lin(t.alpha, t.cd, a), cm: lin(t.alpha, t.cm, a), stalled }
  const edge = a > t.aMax ? t.aMax : t.aMin
  const w = Math.min(1, Math.abs(a - edge) / BLEND)
  const e = { cl: lin(t.alpha, t.cl, edge), cd: lin(t.alpha, t.cd, edge), cm: lin(t.alpha, t.cm, edge) }
  const fp = flatPlate(a, Math.min(...t.cd))
  return { cl: (1 - w) * e.cl + w * fp.cl, cd: (1 - w) * e.cd + w * fp.cd, cm: (1 - w) * e.cm + w * fp.cm, stalled: true }
}

export class PolarSet {
  tables: Table[]
  label: string
  kind: 'xfoil' | 'panel' | 'external'

  constructor(tables: PolarTable[], label: string, kind: PolarSet['kind']) {
    this.tables = tables.filter((t) => t.alpha.length >= 2).map(prepare).sort((a, b) => a.re - b.re)
    this.label = label
    this.kind = kind
  }

  private bracket(re: number): [Table, Table, number] {
    const ts = this.tables
    if (ts.length === 1 || re <= ts[0].re) return [ts[0], ts[0], 0]
    if (re >= ts[ts.length - 1].re) return [ts[ts.length - 1], ts[ts.length - 1], 0]
    let i = 0
    while (i < ts.length - 2 && ts[i + 1].re < re) i++
    const w = Math.log(re / ts[i].re) / Math.log(ts[i + 1].re / ts[i].re)
    return [ts[i], ts[i + 1], w]
  }

  /** Coeficientes a un ángulo (grados) y Reynolds, interpolando en log(Re). */
  at(alphaDeg: number, re: number): PolarPoint {
    const [a, b, w] = this.bracket(re)
    const pa = tableAt(a, alphaDeg)
    if (w === 0) return pa
    const pb = tableAt(b, alphaDeg)
    return {
      cl: (1 - w) * pa.cl + w * pb.cl,
      cd: (1 - w) * pa.cd + w * pb.cd,
      cm: (1 - w) * pa.cm + w * pb.cm,
      stalled: w < 0.5 ? pa.stalled : pb.stalled,
    }
  }

  clMax(re: number): number {
    const [a, b, w] = this.bracket(re)
    return (1 - w) * a.clMax + w * b.clMax
  }

  /** Pendiente media entre −4° y 4° (por radián). */
  slope(re: number): number {
    const p = this.at(4, re).cl - this.at(-4, re).cl
    return p / ((8 * Math.PI) / 180)
  }
}

// ---------- fuentes ----------

let xfoilSet: PolarSet | null = null
export function naca0012Xfoil(): PolarSet {
  if (!xfoilSet) xfoilSet = new PolarSet(NACA0012_XFOIL, 'NACA 0012 · XFOIL 6.99, Ncrit 9 (tabla incluida)', 'xfoil')
  return xfoilSet
}

const panelCache = new Map<string, PolarSet>()

export interface PanelSettings {
  panels: number
  ncrit: number
  iterations: number
}

/** Polares calculadas con el método de paneles 2D + capa límite para un perfil y la rejilla de Reynolds. */
export function panelPolars(points: { x: number; y: number }[], name: string, s: PanelSettings): PolarSet {
  const key = `${s.panels}|${s.ncrit}|${s.iterations}|${points.length}|${points.map((p) => p.x.toFixed(4) + ',' + p.y.toFixed(4)).join(';')}`
  const hit = panelCache.get(key)
  if (hit) return hit
  const foil = new Foil2D(points, s)
  const alphas: number[] = []
  for (let a = -20; a <= 20; a += 1) alphas.push(a)
  const symmetric = isSymmetric(points)
  const list = symmetric ? alphas.filter((a) => a >= 0) : alphas
  const tables = RE_GRID.map((re) => foil.polar(re, list))
  const set = new PolarSet(tables, `${name} · paneles 2D + capa límite (calculada)`, 'panel')
  if (panelCache.size > 8) panelCache.clear()
  panelCache.set(key, set)
  return set
}

function isSymmetric(pts: { x: number; y: number }[]) {
  const up = pts.filter((p) => p.y >= 0)
  const lo = pts.filter((p) => p.y < 0)
  if (!up.length || !lo.length) return false
  const area = (arr: { x: number; y: number }[]) => arr.reduce((s, p) => s + Math.abs(p.y), 0) / arr.length
  const yMean = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return Math.abs(yMean) < 0.002 && Math.abs(area(up) - area(lo)) < 0.004
}

export function externalPolars(polars: Polar2D[]): PolarSet {
  const tables: PolarTable[] = polars.map((p) => ({
    re: p.reynolds ?? 1e5,
    alpha: p.points.map((q) => q.alpha),
    cl: p.points.map((q) => q.cl),
    cd: p.points.map((q) => q.cd),
    cm: p.points.map((q) => q.cm ?? 0),
  }))
  // varias polares con el mismo Re: quedarse con la última
  const byRe = new Map<number, PolarTable>()
  for (const t of tables) byRe.set(t.re, t)
  const res = [...byRe.keys()].sort((a, b) => a - b).map((r) => `${(r / 1000).toFixed(0)}k`)
  return new PolarSet([...byRe.values()], `Polares cargadas (Re ${res.join(', ')})`, 'external')
}

/** Perfil de la vela como puntos (el cargado o un NACA 0012). */
export function sailProfilePoints(d: Design) {
  return d.sailProfile && d.sailProfile.length > 10 ? d.sailProfile : nacaSymmetric(0.12, 160)
}

function isNaca0012(d: Design) {
  return !d.sailProfile || d.sailProfile.length <= 10 || /naca\s*0012/i.test(d.sail.profileName)
}

/** Polares de la vela según la fuente elegida en la ventana de Resolución. */
export function sailPolarSet(d: Design): PolarSet {
  const n = d.numeric
  if (d.sailPolars && d.sailPolars.length > 0 && n.polarSource !== 'panel') return externalPolars(d.sailPolars)
  if (n.polarSource !== 'panel' && isNaca0012(d)) return naca0012Xfoil()
  return panelPolars(sailProfilePoints(d), d.sail.profileName || 'Perfil', { panels: n.foilPanels, ncrit: n.ncrit, iterations: n.couplingIter })
}

/** Polares de la cola (NACA 0012). */
export function tailPolarSet(d: Design): PolarSet {
  const n = d.numeric
  if (n.polarSource === 'panel') return panelPolars(nacaSymmetric(0.12, 160), 'NACA 0012', { panels: n.foilPanels, ncrit: n.ncrit, iterations: n.couplingIter })
  return naca0012Xfoil()
}
