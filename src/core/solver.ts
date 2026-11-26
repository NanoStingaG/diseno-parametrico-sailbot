import { buildBoat, type Boat } from './boat'
import { Hydrostatics, summarizeStability, toEarth, type StabilitySummary, type HullImmersion } from './hydrostatics'
import { SailModel, type SailForces } from './sail'
import { apparentFlow, apparentWind } from './wind'
import {
  sideForceModel,
  hydroSide,
  leewayFor,
  michellTable,
  resistance,
  type MichellTable,
  type HullState,
  type SideForceModel,
} from './water'
import { brent, DEG, G as g, goldenMax, interp, KNOT } from './math'
import type { Design } from './types'

export interface Condition {
  V: number
  lambda: number
  phi: number
  alpha: number
  tail: number
  sail: SailForces
  windage: { Fx: number; Fy: number }
  heelMoment: number
  righting: number
  side: ReturnType<typeof hydroSide>
  resistance: ReturnType<typeof resistance>
  drive: number
  zCE: number
  xCE: number
  aws: number
  awa: number
  capsized: boolean
  noProgress: boolean
  tailStable: boolean
  tailMargin: number
  tailFound: boolean
  hullStates: HullState[]
  pitch: { theta: number; bowFreeboard: number; amaBowFreeboard: number }
}

export interface Analysis {
  boat: Boat
  stability: StabilitySummary
  upright: {
    h: number
    theta: number
    draftMain: number
    freeboardMain: number
    freeboardMast: number
    hulls: HullImmersion[]
    buoyancyShare: { main: number; amas: number; appendages: number }
  }
  condition: Condition
  sailCurves: { alpha: number; CL: number; CD: number; M: number; CLtail: number }[]
  tailCurve: { tail: number; alpha: number }[]
  capsize: { trimmed: number; feathered: number }
  amaReserve: number
  warnings: { level: 'error' | 'warn' | 'info'; text: string }[]
  timings: Record<string, number>
}

interface Context {
  d: Design
  boat: Boat
  hs: Hydrostatics
  sail: SailModel
  side: SideForceModel
  curve: StabilitySummary['curve']
  rmMax: number
  phiGzMax: number
  uprightStates: HullState[]
  waves: MichellTable[]
  freeboard: number
  deckZMast: number
}

function hullStatesAt(curve: StabilitySummary['curve'], phiSigned: number): HullState[] {
  const phiDeg = Math.abs(phiSigned)
  const xs = curve.map((p) => p.phi)
  const n = curve[0].hulls.length
  const out: HullState[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      V: interp(xs, curve.map((p) => p.hulls[i].V), phiDeg),
      wetted: interp(xs, curve.map((p) => p.hulls[i].wetted), phiDeg),
      lwl: interp(xs, curve.map((p) => p.hulls[i].lwl), phiDeg),
      aMax: interp(xs, curve.map((p) => p.hulls[i].aMax), phiDeg),
    })
  }
  // escora a babor: los patines intercambian su papel
  if (phiSigned < 0 && out.length === 3) return [out[0], out[2], out[1]]
  return out
}

/** Escora en la rama estable para un momento escorante M (N·m). */
function heelFor(ctx: Context, Msigned: number): { phi: number; capsized: boolean } {
  const sgn = Msigned < 0 ? -1 : 1
  const r = heelForPos(ctx, Math.abs(Msigned))
  return { phi: sgn * r.phi, capsized: r.capsized }
}

function heelForPos(ctx: Context, M: number): { phi: number; capsized: boolean } {
  if (M <= 0) return { phi: 0, capsized: false }
  if (M >= ctx.rmMax) return { phi: ctx.phiGzMax * DEG, capsized: true }
  const pts = ctx.curve.filter((p) => p.phi <= ctx.phiGzMax)
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].RM >= M) {
      const t = (M - pts[i - 1].RM) / (pts[i].RM - pts[i - 1].RM)
      return { phi: (pts[i - 1].phi + t * (pts[i].phi - pts[i - 1].phi)) * DEG, capsized: false }
    }
  }
  return { phi: ctx.phiGzMax * DEG, capsized: true }
}

function buildContext(d: Design, fast = false): { ctx: Context; up: ReturnType<Hydrostatics['equilibrium']>; stability: StabilitySummary; timings: Record<string, number> } {
  const timings: Record<string, number> = {}
  let t = performance.now()
  const boat = buildBoat(d)
  const hs = new Hydrostatics(boat, fast ? Math.min(40, d.numeric.sections) : undefined)
  const up = hs.equilibrium(0)
  const curve = hs.gzCurve(90, fast ? 5 : 3)
  const stability = summarizeStability(hs, curve)
  timings.hydrostatics = performance.now() - t
  t = performance.now()
  // flotación en el palo
  const waterAt = (x: number) => (up.h + (x - hs.xRef) * Math.sin(up.theta)) / Math.cos(up.theta)
  const deckZMast = boat.sailDeckZ
  const freeboard = Math.max(0.01, deckZMast - waterAt(d.sail.x))
  const zImage = d.numeric.imagePlane === 'sea' ? -freeboard : d.numeric.imagePlane === 'deck' ? 0 : null
  const sail = new SailModel(d, zImage)
  timings.vlm = performance.now() - t
  t = performance.now()
  const mainIm = up.im.hulls[0]
  const zk = boat.main.zBase + boat.main.keel(d.hull.L / 2)
  const wMid = waterAt(d.hull.L / 2)
  const side = sideForceModel(boat, Math.max(0, wMid - zk), mainIm.lwl, wMid)
  const speeds: number[] = []
  for (let i = 1; i <= (fast ? 18 : 30); i++) speeds.push((i / (fast ? 18 : 30)) * 6)
  const wMain = michellTable(boat.main, wMid, d.env.rhoWater, speeds)
  const wAma = michellTable(boat.amaStbd, waterAt(d.ama.x), d.env.rhoWater, speeds)
  timings.michell = performance.now() - t
  const uprightStates = hullStatesAt(curve, 0)
  const ctx: Context = {
    d,
    boat,
    hs,
    sail,
    side,
    curve,
    rmMax: stability.rmMax,
    phiGzMax: stability.phiGzMax,
    uprightStates,
    waves: [wMain, wAma, wAma],
    freeboard,
    deckZMast,
  }
  return { ctx, up, stability, timings }
}

/** Equilibrio lateral y de escora a velocidad V. Devuelve la condición y el residuo longitudinal. */
function solveAtSpeed(ctx: Context, V: number, mode: 'tail' | 'alpha', control: number, guess?: { lambda: number; phi: number; alpha: number }): Condition {
  const d = ctx.d
  let lambda = guess?.lambda ?? 0
  let phi = guess?.phi ?? 0
  let alpha = guess?.alpha ?? (mode === 'alpha' ? control : control)
  let sailF!: SailForces
  let tailStable = true
  let tailMargin = 0
  let tailFound = true
  let capsized = false
  let windage = { Fx: 0, Fy: 0 }
  let Mh = 0
  let side!: ReturnType<typeof hydroSide>
  let zCE = 0
  let xCE = 0
  for (let it = 0; it < 40; it++) {
    const flow = apparentFlow(d.env, V, lambda, phi, ctx.freeboard)
    if (mode === 'tail') {
      const eq = ctx.sail.tailEquilibrium(flow, control, phi, alpha)
      alpha = eq.alpha
      tailStable = eq.stable
      tailMargin = eq.margin
      tailFound = eq.found
    } else alpha = control
    sailF = ctx.sail.evaluate(flow, alpha, mode === 'tail' ? control : 0, phi)
    // resistencia aerodinámica de cascos y equipos
    const fw = flow(Math.max(0.05, d.windageZ - ctx.deckZMast))
    const Dw = 0.5 * d.env.rhoAir * fw.U * fw.U * d.windageCdA
    windage = { Fx: Dw * Math.cos(fw.psi), Fy: Dw * Math.sin(fw.psi) }
    const Fy = sailF.Fy + windage.Fy
    zCE = ctx.deckZMast + sailF.zCE
    xCE = sailF.xCE
    const lamNew = V > 1e-3 ? leewayFor(ctx.side, d.env.rhoWater, V, Fy, phi) : 0.5
    side = hydroSide(ctx.side, d.env.rhoWater, V, lamNew, phi)
    Mh = sailF.Fy * (zCE - side.zCLR) + windage.Fy * (d.windageZ - side.zCLR)
    const hf = heelFor(ctx, Mh)
    capsized = hf.capsized
    const dl = lamNew - lambda
    const dp = hf.phi - phi
    lambda += 0.6 * dl
    phi += 0.6 * dp
    if (Math.abs(dl) < 1e-5 && Math.abs(dp) < 1e-5) break
  }
  const states = hullStatesAt(ctx.curve, phi / DEG)
  const res = resistance(ctx.boat, V, states, ctx.uprightStates, ctx.waves, side.Di)
  const drive = sailF.Fx + windage.Fx
  const aw = apparentWind(d.env, V, lambda, ctx.freeboard + d.sail.gap + 0.45 * d.sail.height)
  return {
    V,
    lambda,
    phi,
    alpha,
    tail: mode === 'tail' ? control : NaN,
    sail: sailF,
    windage,
    heelMoment: Mh,
    righting:
      Math.sign(phi) *
      interp(
        ctx.curve.map((p) => p.phi),
        ctx.curve.map((p) => p.RM),
        Math.abs(phi) / DEG,
      ),
    side,
    resistance: res,
    drive,
    zCE,
    xCE,
    aws: aw.aws,
    awa: aw.awa,
    capsized,
    noProgress: false,
    tailStable,
    tailMargin,
    tailFound,
    hullStates: states,
    pitch: { theta: 0, bowFreeboard: 0, amaBowFreeboard: 0 },
  }
}

function solveSpeed(ctx: Context, mode: 'tail' | 'alpha', control: number): Condition {
  let guess: { lambda: number; phi: number; alpha: number } | undefined
  const resid = (V: number) => {
    const c = solveAtSpeed(ctx, V, mode, control, guess)
    guess = { lambda: c.lambda, phi: c.phi, alpha: c.alpha }
    return c.drive - c.resistance.hydroTotal
  }
  const Vmin = 0.02
  const r0 = resid(Vmin)
  if (r0 <= 0) {
    guess = undefined
    const c = solveAtSpeed(ctx, Vmin, mode, control)
    return { ...c, V: 0, noProgress: true }
  }
  let Vhi = 1
  while (resid(Vhi) > 0 && Vhi < 8) Vhi *= 1.6
  guess = undefined
  const V = brent(resid, Vmin, Vhi, 1e-4, 40)
  return solveAtSpeed(ctx, V, mode, control, guess)
}

/** Asiento con el momento de cabeceo del empuje de la vela. */
function pitchCheck(ctx: Context, c: Condition) {
  const d = ctx.d
  const zR = c.side.zCLR
  const mPitch = c.drive * (c.zCE - zR)
  const eq = ctx.hs.equilibrium(c.phi, mPitch)
  const above = (x: number, y: number, z: number) => toEarth(x, y, z, ctx.hs.xRef, eq.phi, eq.theta).z - eq.h
  const bowXl = d.hull.L * 0.95
  const bowFreeboard = above(bowXl, 0, ctx.boat.deckZ(bowXl))
  const ama = c.phi < 0 ? ctx.boat.amaPort : ctx.boat.amaStbd
  const amaXl = d.ama.L * 0.95
  const amaDeck = ama.zBase + ama.keel(amaXl) + ama.D(amaXl)
  const amaBowFreeboard = above(ama.x0 + amaXl, ama.yc, amaDeck)
  return { theta: eq.theta / DEG, bowFreeboard, amaBowFreeboard }
}

export function analyze(d: Design, opts: { fast?: boolean; skipCurves?: boolean } = {}): Analysis {
  const t0 = performance.now()
  const { ctx, up, stability, timings } = buildContext(d, opts.fast)
  let t = performance.now()
  let cond: Condition
  if (d.control.mode === 'optimize') {
    // máximo V respetando escora máxima y sin pérdida
    const obj = (a: number) => {
      const c = solveSpeed(ctx, 'alpha', a)
      let v = c.V
      const over = Math.abs(c.phi) / DEG - d.control.maxHeel
      if (over > 0) v -= over * 0.05
      if (c.sail.anyStall) v -= 1 + 0.1 * c.sail.strips.filter((s) => s.stalled).length
      if (c.capsized) v -= 10
      return v
    }
    const best = goldenMax(obj, 0, 25, 0.1)
    cond = solveSpeed(ctx, 'alpha', best.x)
    // ángulo de cola que da ese α
    const flow = apparentFlow(d.env, cond.V, cond.lambda, cond.phi, ctx.freeboard)
    const fa = (tail: number) => ctx.sail.tailEquilibrium(flow, tail, cond.phi).alpha - best.x
    const tail = brent(fa, -40, 40, 1e-3, 40)
    cond.tail = tail
  } else if (d.control.mode === 'alpha') {
    cond = solveSpeed(ctx, 'alpha', d.control.alpha)
  } else {
    cond = solveSpeed(ctx, 'tail', d.tail.angle)
  }
  cond.pitch = pitchCheck(ctx, cond)
  timings.vpp = performance.now() - t
  t = performance.now()

  // Curvas de la vela con el viento aparente de la solución
  const flow = apparentFlow(d.env, cond.V, cond.lambda, cond.phi, ctx.freeboard)
  const sailCurves: Analysis['sailCurves'] = []
  const tailCurve: Analysis['tailCurve'] = []
  if (!opts.skipCurves) {
    for (let a = -4; a <= 24; a += 1) {
      const r = ctx.sail.evaluate(flow, a, Number.isFinite(cond.tail) ? cond.tail : d.tail.angle, cond.phi)
      const qS = r.qRef * ctx.sail.area
      sailCurves.push({
        alpha: a,
        CL: r.CL,
        CD: r.CD,
        M: r.Maero + r.Mgrav,
        CLtail: qS > 0 ? r.tail.lift / qS : 0,
      })
    }
    let g0: number | undefined
    for (let tl = 0; tl <= 20; tl += 1) {
      const eq = ctx.sail.tailEquilibrium(flow, tl, cond.phi, g0)
      g0 = eq.alpha
      tailCurve.push({ tail: tl, alpha: eq.alpha })
    }
  }
  timings.curves = performance.now() - t

  // Viento de vuelco sin arrancada, viento de través: momento ∝ TWS²
  const capsize = capsizeWind(ctx)

  // Reparto del empuje en adrizado
  const rho = d.env.rhoWater
  const ims = up.im.hulls
  const appV = ctx.boat.fixedVolumes.reduce((s, f) => s + f.V, 0)
  const Vtot = up.im.V
  const waterAt = (x: number) => (up.h + (x - ctx.hs.xRef) * Math.sin(up.theta)) / Math.cos(up.theta)
  const mid = d.hull.L / 2
  const zk = ctx.boat.main.zBase + ctx.boat.main.keel(mid)
  const amaReserve = ((ctx.boat.amaVolume * rho) / Math.max(ctx.boat.mass, 1e-9)) * 100

  const analysis: Analysis = {
    boat: ctx.boat,
    stability,
    upright: {
      h: up.h,
      theta: up.theta / DEG,
      draftMain: waterAt(mid) - zk,
      freeboardMain: ctx.boat.deckZ(mid) - waterAt(mid),
      freeboardMast: ctx.freeboard,
      hulls: ims,
      buoyancyShare: {
        main: ims[0].V / Vtot,
        amas: (ims[1].V + ims[2].V) / Vtot,
        appendages: appV / Vtot,
      },
    },
    condition: cond,
    sailCurves,
    tailCurve,
    capsize,
    amaReserve,
    warnings: [],
    timings,
  }
  analysis.warnings = warnings(analysis)
  timings.total = performance.now() - t0
  return analysis
}

/**
 * Viento de vuelco sin arrancada. El momento escorante escala con TWS², así que basta evaluarlo a 1 m/s.
 * Trimada: la fuerza aerodinámica total máxima (sin pérdida) orientada de costado, el peor caso.
 * En bandera: α = 0, sólo resistencia de la vela, más la resistencia de cascos y equipos.
 */
function capsizeWind(ctx: Context) {
  const d = ctx.d
  const env1 = { ...d.env, tws: 1, twa: 90 }
  const flow = apparentFlow(env1, 0, 0, 0, ctx.freeboard)
  const zCLR = ctx.side.keel.zCP
  let best = 0
  let arm = 0
  for (let a = 1; a <= 30; a += 1) {
    const r = ctx.sail.evaluate(flow, a, 0, 0)
    if (r.anyStall) break
    const F = Math.hypot(r.Fx, r.Fy)
    const M = F * (ctx.deckZMast + r.zCE - zCLR)
    if (M > best) {
      best = M
      arm = ctx.deckZMast + r.zCE - zCLR
    }
  }
  void arm
  const fw = flow(Math.max(0.05, d.windageZ - ctx.deckZMast))
  const Mw = 0.5 * d.env.rhoAir * fw.U * fw.U * d.windageCdA * (d.windageZ - zCLR)
  const r0 = ctx.sail.evaluate(flow, 0, 0, 0)
  const Mfeather = Math.hypot(r0.Fx, r0.Fy) * (ctx.deckZMast + r0.zCE - zCLR) + Mw
  return {
    trimmed: best + Mw > 0 ? Math.sqrt(ctx.rmMax / (best + Mw)) : Infinity,
    feathered: Mfeather > 0 ? Math.sqrt(ctx.rmMax / Mfeather) : Infinity,
  }
}

function warnings(a: Analysis): Analysis['warnings'] {
  const d = a.boat.design
  const w: Analysis['warnings'] = []
  const c = a.condition
  if (a.boat.loa.aligned > d.limits.loaMax + 1e-9)
    w.push({ level: 'error', text: `Eslora total ${a.boat.loa.aligned.toFixed(2)} m con la vela a crujía: supera el límite de ${d.limits.loaMax.toFixed(2)} m` })
  if (a.boat.loa.rotating > d.limits.loaMax + 1e-9)
    w.push({ level: 'info', text: `Al girar, la vela y la cola barren una envolvente de ${a.boat.loa.rotating.toFixed(2)} m de eslora` })
  if (c.capsized) w.push({ level: 'error', text: `El momento escorante supera el adrizante máximo: vuelco con ${d.env.tws.toFixed(1)} m/s de viento` })
  if (c.noProgress) w.push({ level: 'warn', text: 'La vela no vence la resistencia: el barco no avanza en esta condición' })
  else if (c.V / KNOT < d.limits.minSpeedKn)
    w.push({ level: 'warn', text: `Velocidad ${(c.V / KNOT).toFixed(2)} nudos, por debajo del mínimo de ${d.limits.minSpeedKn} nudos` })
  if (Math.abs(c.phi) / DEG > d.limits.maxHeelWarn) w.push({ level: 'warn', text: `Escora de ${(c.phi / DEG).toFixed(1)}°, por encima de ${d.limits.maxHeelWarn}°` })
  if (c.sail.anyStall) {
    const n = c.sail.strips.filter((s) => s.surface === 0 && s.stalled).length
    w.push({ level: 'warn', text: `Vela en pérdida en ${n} franjas: el modelo lineal sobrestima la fuerza` })
  }
  const fn = c.V / Math.sqrt(9.81 * Math.max(d.hull.L, 0.1))
  if (fn > 0.5) w.push({ level: 'warn', text: `Froude ${fn.toFixed(2)}: fuera del rango de validez del modelo de resistencia (Fn > 0,5)` })
  if (c.sail.tailStall) w.push({ level: 'warn', text: 'La cola trabaja por encima de su CL máximo' })
  if (d.control.mode === 'tail' && !c.tailStable)
    w.push({ level: 'error', text: 'La orientación vela-cola es inestable: el punto neutro está por delante del eje' })
  if (d.control.mode === 'tail' && !c.tailFound)
    w.push({ level: 'warn', text: 'No se encontró equilibrio vela-cola en ±30°' })
  if (a.amaReserve < d.limits.amaReserveMin)
    w.push({ level: 'warn', text: `Reserva de flotabilidad de cada patín ${a.amaReserve.toFixed(0)} % del desplazamiento, por debajo del ${d.limits.amaReserveMin} %` })
  if (a.upright.buoyancyShare.amas < 1e-4) w.push({ level: 'info', text: 'Los patines no tocan el agua en adrizado' })
  if (c.pitch.bowFreeboard < 0) w.push({ level: 'error', text: 'La proa del casco central se sumerge con el empuje de la vela' })
  if (c.pitch.amaBowFreeboard < 0) w.push({ level: 'warn', text: 'La proa del patín de sotavento se sumerge' })
  if (Math.abs(c.sail.Mgrav) > 0.02 && a.boat.sailAssembly.mass > 0)
    w.push({ level: 'info', text: `Desequilibrio de masas del conjunto vela-cola: ${(a.boat.sailAssembly.offset * 100).toFixed(1)} cm respecto al eje` })
  const rm = a.stability.rmMax
  if (!Number.isFinite(rm) || rm <= 0) w.push({ level: 'error', text: 'El barco no tiene estabilidad positiva' })
  if (a.capsize.trimmed < d.env.tws * 1.3 && !c.capsized)
    w.push({ level: 'warn', text: `Viento de vuelco con la vela trimada ${a.capsize.trimmed.toFixed(1)} m/s: poco margen sobre el viento actual` })
  void g
  return w
}

export { KNOT }
