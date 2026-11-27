import { applyFixed } from './fixed'
import { DEG, G, KNOT } from './math'
import { getPath, setPath } from './path'
import { panelPolars, sailPolarSet, sailProfilePoints, tailPolarSet, type PolarSet } from './polars'
import { analyze, buildContext, capsizeWind, hullStatesAt, solveAtSpeed, solveSpeed, type Condition, type Context } from './solver'
import { toView } from './view'
import { apparentFlow } from './wind'
import type { Design } from './types'

export type Progress = (done: number, total: number, note?: string) => void

// ---------- utilidades ----------

/** Contexto con otras condiciones de viento (la geometría y la hidrostática no cambian). */
function withWind(ctx: Context, tws: number, twa: number): Context {
  return { ...ctx, d: { ...ctx.d, env: { ...ctx.d.env, tws, twa } } }
}

/** Ángulo de ataque que da la máxima propulsión sin pérdida a una velocidad dada (aproximación rápida). */
function bestAlpha(ctx: Context, V: number): number {
  const flow = apparentFlow(ctx.d.env, V, 0, 0, ctx.freeboard)
  let best = 0
  let bestF = -Infinity
  for (let a = 0; a <= 24; a += 1.5) {
    const r = ctx.sail.evaluate(flow, a, 0, 0)
    if (r.anyStall && a > 3) break
    if (r.Fx > bestF) {
      bestF = r.Fx
      best = a
    }
  }
  return best
}

/** Resuelve una condición con el modo de manejo del diseño ('optimize' se aproxima con el α de máxima propulsión). */
function solveMode(ctx: Context, Vguess = 1): Condition {
  const d = ctx.d
  if (d.control.mode === 'tail') return solveSpeed(ctx, 'tail', d.tail.angle)
  if (d.control.mode === 'alpha') return solveSpeed(ctx, 'alpha', d.control.alpha)
  let a = bestAlpha(ctx, Vguess)
  let c = solveSpeed(ctx, 'alpha', a)
  a = bestAlpha(ctx, c.V)
  c = solveSpeed(ctx, 'alpha', a)
  return c
}

// ---------- curvas de diseño ----------

export interface PolarCurve {
  tws: number
  points: { twa: number; kn: number; heel: number; alpha: number; capsized: boolean }[]
}

export interface DesignCurves {
  polar: PolarCurve[]
  polarMode: string
  thrust: {
    V: number[]
    twa: number
    tws: number
    friction: number[]
    wave: number[]
    appendages: number[]
    induced: number[]
    total: number[]
    drive: { tws: number; values: number[] }[]
    froude: number[]
  }
  amaVsTws: { twa: number; tws: number[]; heel: number[]; leeward: number[]; windward: number[]; kn: number[]; capsized: boolean[] }
  hydro: { mass: number[]; draft: number[]; freeboard: number[]; gm: number[]; km: number[]; amaShare: number[]; current: number }
  profile: ProfilePolars
}

export interface ProfilePolars {
  sailLabel: string
  tailLabel: string
  sailRe: number
  tailRe: number
  curves: { label: string; re: number; alpha: number[]; cl: number[]; cd: number[]; cm: number[] }[]
}

function samplePolar(set: PolarSet, re: number, label: string) {
  const alpha: number[] = []
  const cl: number[] = []
  const cd: number[] = []
  const cm: number[] = []
  for (let a = -6; a <= 26; a += 0.5) {
    const p = set.at(a, re)
    alpha.push(a)
    cl.push(p.cl)
    cd.push(p.cd)
    cm.push(p.cm)
  }
  return { label, re, alpha, cl, cd, cm }
}

/** Polares del perfil a los Reynolds de trabajo, con la comparación frente al método de paneles. */
export function profilePolars(input: Design, V = 1): ProfilePolars {
  const d = applyFixed(input)
  const nu = d.env.nuAir
  // velocidad típica del aire en la vela: viento real a media altura más la del barco
  const U = Math.max(1, d.env.tws * 0.85 + V * 0.5)
  const cMean = 0.5 * (d.sail.rootChord + d.sail.tipChord)
  const sailRe = (U * cMean) / nu
  const tailRe = (U * d.tail.chord) / nu
  const sail = sailPolarSet(d)
  const tail = tailPolarSet(d)
  const curves = [samplePolar(sail, sailRe, `Vela · ${sail.kind === 'panel' ? 'paneles 2D' : sail.kind === 'xfoil' ? 'XFOIL' : 'cargada'}`)]
  if (sail.kind !== 'panel') {
    const n = d.numeric
    const pan = panelPolars(sailProfilePoints(d), d.sail.profileName, { panels: n.foilPanels, ncrit: n.ncrit, iterations: n.couplingIter })
    curves.push(samplePolar(pan, sailRe, 'Vela · paneles 2D (comparación)'))
  }
  curves.push(samplePolar(tail, tailRe, `Cola · ${tail.kind === 'panel' ? 'paneles 2D' : 'XFOIL'}`))
  return { sailLabel: sail.label, tailLabel: tail.label, sailRe, tailRe, curves }
}

export function designCurves(input: Design, opts: { twsList: number[]; progress?: Progress }): DesignCurves {
  const d = applyFixed(input)
  const { ctx } = buildContext(d, true)
  const twaList = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]
  const total = opts.twsList.length * twaList.length + opts.twsList.length * 12 + 10 + 11
  let done = 0
  const tick = (note: string) => opts.progress?.(++done, total, note)

  // Polar de velocidades
  const polar: PolarCurve[] = []
  for (const tws of opts.twsList) {
    const pts: PolarCurve['points'] = []
    let Vg = 1
    for (const twa of twaList) {
      const c = solveMode(withWind(ctx, tws, twa), Vg)
      if (c.V > 0.05) Vg = c.V
      pts.push({ twa, kn: c.V / KNOT, heel: c.phi / DEG, alpha: c.alpha, capsized: c.capsized })
      tick('Polar de velocidades')
    }
    polar.push({ tws, points: pts })
  }

  // Resistencia y empuje frente a la velocidad, al TWA actual
  const base = solveMode(ctx)
  const Vtop = Math.max(1.0, base.V * 1.8, ...polar.flatMap((p) => p.points.filter((q) => Math.abs(q.twa - d.env.twa) < 8).map((q) => (q.kn * KNOT) * 1.2)))
  const Vs: number[] = []
  for (let i = 1; i <= 12; i++) Vs.push((i / 12) * Vtop)
  const thrust: DesignCurves['thrust'] = {
    V: Vs,
    twa: d.env.twa,
    tws: d.env.tws,
    friction: [],
    wave: [],
    appendages: [],
    induced: [],
    total: [],
    drive: [],
    froude: Vs.map((V) => V / Math.sqrt(G * d.hull.L)),
  }
  const mode = d.control.mode === 'tail' ? 'tail' : 'alpha'
  const ctl = d.control.mode === 'tail' ? d.tail.angle : base.alpha
  for (const tws of opts.twsList) {
    const c2 = withWind(ctx, tws, d.env.twa)
    const vals: number[] = []
    let guess: { lambda: number; phi: number; alpha: number } | undefined
    for (const V of Vs) {
      const c = solveAtSpeed(c2, V, mode, ctl, guess)
      guess = { lambda: c.lambda, phi: c.phi, alpha: c.alpha }
      vals.push(c.drive)
      tick('Resistencia y empuje')
    }
    thrust.drive.push({ tws, values: vals })
  }
  {
    let guess: { lambda: number; phi: number; alpha: number } | undefined
    for (const V of Vs) {
      const c = solveAtSpeed(ctx, V, mode, ctl, guess)
      guess = { lambda: c.lambda, phi: c.phi, alpha: c.alpha }
      const r = c.resistance
      thrust.friction.push(r.friction * d.resistanceFactor)
      thrust.wave.push(r.wave * d.resistanceFactor)
      thrust.appendages.push(r.appendages * d.resistanceFactor)
      thrust.induced.push(r.induced * d.resistanceFactor)
      thrust.total.push(r.hydroTotal)
    }
  }

  // Inmersión del patín de sotavento frente al viento real
  const twsGrid = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]
  const amaVsTws: DesignCurves['amaVsTws'] = { twa: d.env.twa, tws: [], heel: [], leeward: [], windward: [], kn: [], capsized: [] }
  const amaV = Math.max(ctx.boat.amaVolume, 1e-9)
  for (const tws of twsGrid) {
    const c = solveMode(withWind(ctx, tws, d.env.twa))
    const st = hullStatesAt(ctx.curve, c.phi / DEG)
    amaVsTws.tws.push(tws)
    amaVsTws.heel.push(c.phi / DEG)
    amaVsTws.leeward.push((st[2].V / amaV) * 100)
    amaVsTws.windward.push((st[1].V / amaV) * 100)
    amaVsTws.kn.push(c.V / KNOT)
    amaVsTws.capsized.push(c.capsized)
    tick('Inmersión del patín')
  }

  // Curvas hidrostáticas frente al desplazamiento (masa añadida en el CG)
  const hydro: DesignCurves['hydro'] = { mass: [], draft: [], freeboard: [], gm: [], km: [], amaShare: [], current: ctx.boat.mass }
  const mid = d.hull.L / 2
  const zk = ctx.boat.main.zBase + ctx.boat.main.keel(mid)
  for (let f = 0.6; f <= 1.601; f += 0.1) {
    const extra = ctx.boat.mass * (f - 1)
    const eq = ctx.hs.equilibrium(0, 0, extra)
    const water = (eq.h + (mid - ctx.hs.xRef) * Math.sin(eq.theta)) / Math.cos(eq.theta)
    const e2 = ctx.hs.equilibrium(2 * DEG, 0, extra)
    const gm = e2.GZ / Math.sin(2 * DEG)
    const ims = eq.im.hulls
    hydro.mass.push(ctx.boat.mass * f)
    hydro.draft.push(water - zk)
    hydro.freeboard.push(ctx.boat.deckZ(mid) - water)
    hydro.gm.push(gm)
    hydro.km.push(gm + (ctx.boat.G.z - zk))
    hydro.amaShare.push(((ims[1].V + ims[2].V) / Math.max(eq.im.V, 1e-12)) * 100)
    tick('Curvas hidrostáticas')
  }

  const profile = profilePolars(d, base.V)
  return {
    polar,
    polarMode:
      d.control.mode === 'tail'
        ? `ángulo de cola fijo de ${d.tail.angle}°`
        : d.control.mode === 'alpha'
          ? `ángulo de ataque fijo de ${d.control.alpha}°`
          : 'vela trimada a máxima propulsión',
    thrust,
    amaVsTws,
    hydro,
    profile,
  }
}

// ---------- sensibilidad ----------

export interface SensitivityRow {
  path: string
  label: string
  value: number
  speedMinus: number
  speedPlus: number
  capsizeMinus: number
  capsizePlus: number
}

export interface Sensitivity {
  base: { speed: number; capsize: number }
  rows: SensitivityRow[]
  step: number
}

export function sensitivity(input: Design, fields: { path: string; label: string }[], step: number, progress?: Progress): Sensitivity {
  const run = (d: Design) => {
    const a = analyze(d, { fast: true, skipCurves: true })
    return { speed: a.condition.V / KNOT, capsize: a.capsize.trimmed }
  }
  const total = fields.length * 2 + 1
  let done = 0
  const base = run(input)
  progress?.(++done, total)
  const rows: SensitivityRow[] = []
  for (const f of fields) {
    const v0 = Number(getPath(input, f.path))
    if (!Number.isFinite(v0) || v0 === 0) {
      done += 2
      continue
    }
    const lo = run(setPath(input, f.path, v0 * (1 - step)))
    progress?.(++done, total, f.label)
    const hi = run(setPath(input, f.path, v0 * (1 + step)))
    progress?.(++done, total, f.label)
    const pct = (x: number, b: number) => (Number.isFinite(x) && Number.isFinite(b) && b !== 0 ? ((x - b) / b) * 100 : 0)
    rows.push({
      path: f.path,
      label: f.label,
      value: v0,
      speedMinus: pct(lo.speed, base.speed),
      speedPlus: pct(hi.speed, base.speed),
      capsizeMinus: pct(lo.capsize, base.capsize),
      capsizePlus: pct(hi.capsize, base.capsize),
    })
  }
  return { base, rows, step }
}

// ---------- mapa de dos parámetros ----------

export interface MapResult {
  pathX: string
  pathY: string
  xs: number[]
  ys: number[]
  /** metrics[iy][ix] */
  metrics: Record<string, number>[][]
}

export function map2d(input: Design, pathX: string, xs: number[], pathY: string, ys: number[], progress?: Progress): MapResult {
  const metrics: Record<string, number>[][] = []
  let done = 0
  for (const y of ys) {
    const row: Record<string, number>[] = []
    for (const x of xs) {
      const d = setPath(setPath(input, pathX, x), pathY, y)
      const v = toView(analyze(d, { fast: true, skipCurves: true }))
      row.push(v.metrics)
      progress?.(++done, xs.length * ys.length)
    }
    metrics.push(row)
  }
  return { pathX, pathY, xs, ys, metrics }
}

// ---------- optimización ----------

export interface OptVariable {
  path: string
  label: string
  min: number
  max: number
}

export interface OptSettings {
  variables: OptVariable[]
  /** 'speed': velocidad en la condición actual; 'mean': media en las condiciones de la lista */
  objective: 'speed' | 'mean'
  conditions: { tws: number; twa: number }[]
  constraints: { maxHeel: number; minCapsize: number; minAmaReserve: number; minTailMargin: number }
  maxEvals: number
}

export interface OptEval {
  speed: number
  heel: number
  capsize: number
  amaReserve: number
  tailMargin: number
  penalty: number
  score: number
  feasible: boolean
  sailStall: boolean
}

export interface OptProgress {
  evals: number
  maxEvals: number
  history: { evals: number; best: number; bestSpeed: number; current: number }[]
  best: { values: number[]; eval: OptEval } | null
  base: { values: number[]; eval: OptEval }
}

/** Evalúa un diseño para el optimizador: velocidad (nudos) y restricciones. */
export function evaluateDesign(input: Design, s: OptSettings): OptEval {
  const d = applyFixed(input)
  const { ctx } = buildContext(d, true)
  const conds = s.objective === 'mean' && s.conditions.length > 0 ? s.conditions : [{ tws: d.env.tws, twa: d.env.twa }]
  let sumV = 0
  let maxHeel = 0
  let minMargin = Infinity
  let capsized = false
  let sailStall = false
  for (const c of conds) {
    const cc = withWind(ctx, c.tws, c.twa)
    const r = solveMode(cc)
    sumV += r.V / KNOT
    maxHeel = Math.max(maxHeel, Math.abs(r.phi) / DEG)
    // con la vela o la cola en pérdida el margen vela-cola no tiene sentido (dL/dα ≈ 0)
    if (r.sail.anyStall) sailStall = true
    else if (d.control.mode === 'tail' && !r.sail.tailStall && Number.isFinite(r.tailMargin)) minMargin = Math.min(minMargin, r.tailMargin)
    if (r.capsized) capsized = true
  }
  const speed = sumV / conds.length
  const cap = capsizeWind(ctx).trimmed
  const amaReserve = ((ctx.boat.amaVolume * d.env.rhoWater) / Math.max(ctx.boat.mass, 1e-9)) * 100
  const k = s.constraints
  let penalty = 0
  penalty += Math.max(0, maxHeel - k.maxHeel) / 5
  penalty += Math.max(0, k.minCapsize - cap) / 2
  penalty += Math.max(0, k.minAmaReserve - amaReserve) / 20
  if (d.control.mode === 'tail' && Number.isFinite(minMargin)) penalty += Math.max(0, k.minTailMargin - minMargin) / 5
  if (capsized) penalty += 5
  // la vela en pérdida en la condición de diseño no es un punto de trabajo aceptable
  if (sailStall) penalty += 1
  return {
    speed,
    heel: maxHeel,
    capsize: cap,
    amaReserve,
    tailMargin: Number.isFinite(minMargin) ? minMargin : NaN,
    penalty,
    score: speed - penalty,
    feasible: penalty < 1e-9,
    sailStall,
  }
}

function designFrom(input: Design, vars: OptVariable[], x: number[]): Design {
  let d = input
  vars.forEach((v, i) => {
    d = setPath(d, v.path, v.min + Math.min(1, Math.max(0, x[i])) * (v.max - v.min))
  })
  return d
}

/** Nelder-Mead sobre las variables normalizadas a [0, 1], maximizando la velocidad penalizada. */
export function optimize(input: Design, s: OptSettings, onProgress?: (p: OptProgress) => void): OptProgress {
  const vars = s.variables
  const n = vars.length
  const toVals = (x: number[]) => vars.map((v, i) => v.min + Math.min(1, Math.max(0, x[i])) * (v.max - v.min))
  let evals = 0
  const history: OptProgress['history'] = []
  let best: OptProgress['best'] = null
  const f = (x: number[]) => {
    const e = evaluateDesign(designFrom(input, vars, x), s)
    evals++
    if (!best || e.score > best.eval.score) best = { values: toVals(x), eval: e }
    history.push({ evals, best: best.eval.score, bestSpeed: best.eval.speed, current: e.score })
    return -e.score
  }
  const x0 = vars.map((v) => {
    const cur = Number(getPath(input, v.path))
    return v.max > v.min ? Math.min(1, Math.max(0, (cur - v.min) / (v.max - v.min))) : 0
  })
  const baseEval = evaluateDesign(input, s)
  const base = { values: toVals(x0), eval: baseEval }
  const report = () => onProgress?.({ evals, maxEvals: s.maxEvals, history, best, base })
  if (n === 0) return { evals, maxEvals: s.maxEvals, history, best, base }
  const clampX = (x: number[]) => x.map((v) => Math.min(1, Math.max(0, v)))
  let simplex: { x: number[]; f: number }[] = [{ x: x0, f: f(x0) }]
  for (let i = 0; i < n; i++) {
    const x = [...x0]
    x[i] = x[i] + (x[i] < 0.85 ? 0.15 : -0.15)
    simplex.push({ x: clampX(x), f: f(x) })
    report()
  }
  while (evals < s.maxEvals) {
    simplex.sort((a, b) => a.f - b.f)
    const spread = simplex[n].f - simplex[0].f
    const size = Math.max(...simplex.map((p) => Math.max(...p.x.map((v, i) => Math.abs(v - simplex[0].x[i])))))
    if (spread < 1e-4 && size < 1e-3) break
    const c = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i].x[j] / n
    const worst = simplex[n]
    const xr = clampX(c.map((v, j) => v + (v - worst.x[j])))
    const fr = f(xr)
    if (fr < simplex[0].f) {
      const xe = clampX(c.map((v, j) => v + 2 * (v - worst.x[j])))
      const fe = f(xe)
      simplex[n] = fe < fr ? { x: xe, f: fe } : { x: xr, f: fr }
    } else if (fr < simplex[n - 1].f) {
      simplex[n] = { x: xr, f: fr }
    } else {
      const xc = clampX(c.map((v, j) => v + 0.5 * (worst.x[j] - v)))
      const fc = f(xc)
      if (fc < worst.f) simplex[n] = { x: xc, f: fc }
      else {
        simplex = simplex.map((p, i) => (i === 0 ? p : { x: clampX(p.x.map((v, j) => simplex[0].x[j] + 0.5 * (v - simplex[0].x[j]))), f: NaN }))
        for (let i = 1; i <= n; i++) simplex[i].f = f(simplex[i].x)
      }
    }
    report()
  }
  report()
  return { evals, maxEvals: s.maxEvals, history, best, base }
}

/** Polar de velocidades a un viento, para comparar diseños (base frente a óptimo). */
export function speedPolar(input: Design, tws: number): PolarCurve {
  const d = applyFixed(input)
  const { ctx } = buildContext(d, true)
  const pts: PolarCurve['points'] = []
  let Vg = 1
  for (const twa of [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]) {
    const c = solveMode(withWind(ctx, tws, twa), Vg)
    if (c.V > 0.05) Vg = c.V
    pts.push({ twa, kn: c.V / KNOT, heel: c.phi / DEG, alpha: c.alpha, capsized: c.capsized })
  }
  return { tws, points: pts }
}
