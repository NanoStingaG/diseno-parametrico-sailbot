import { VLM, type Surface } from './vlm'
import { brent, DEG } from './math'
import { sailPolarSet, tailPolarSet, type PolarSet } from './polars'
import type { Design } from './types'

/** Flujo de aire relativo al barco a una altura z (sobre cubierta): velocidad y dirección en ejes del barco. */
export interface LocalFlow {
  U: number
  /** dirección de la velocidad del aire en ejes del barco (rad) */
  psi: number
}

export interface StripResult {
  surface: number
  z: number
  chord: number
  cl: number
  cd: number
  alphaEff: number
  stalled: boolean
  /** carga por unidad de envergadura (N/m) */
  load: number
  re: number
}

export interface SailForces {
  /** ángulo de ataque de la vela (usuario, grados) en la altura de referencia */
  alpha: number
  /** ángulo de la cuerda en ejes del barco (rad) */
  chordAngle: number
  /** Fuerzas en ejes del barco (N) */
  Fx: number
  Fy: number
  /** Fuerzas separadas */
  wing: { lift: number; drag: number }
  tail: { lift: number; drag: number }
  lift: number
  dragInduced: number
  dragProfile: number
  /** coeficientes de la vela (referidos a la superficie de la vela y q en z de referencia) */
  CL: number
  CD: number
  /** centro de esfuerzo: altura sobre cubierta (m) y x en ejes del barco */
  zCE: number
  xCE: number
  /** momentos respecto al eje (N·m): aerodinámico y por masa con escora; + aumenta α */
  Maero: number
  Mgrav: number
  strips: StripResult[]
  qRef: number
  anyStall: boolean
  tailStall: boolean
  /** iteraciones del VLM no lineal y convergencia */
  iterations: number
  converged: boolean
}

let RELAX = 0.6
let SECANT = true
export function setSecant(v: boolean) {
  SECANT = v
}
export function setRelax(r: number) {
  RELAX = r
}

export class SailModel {
  design: Design
  vlm: VLM
  area: number
  tailArea: number
  zRefSail: number
  sailPolars: PolarSet
  tailPolars: PolarSet
  /** signo que convierte Γ del VLM en sustentación positiva para α de usuario positivo */
  sgn: number
  /** última corrección de ángulo por franja (rad, sentido del usuario), para arrancar la siguiente iteración */
  lastDelta: Float64Array
  /** iteraciones del último cálculo no lineal y si convergió */
  lastIter = 0
  lastConverged = true
  evalCount = 0
  lastSlope = NaN
  lastMScale = 1
  brentCount = 0
  eqCount = 0
  iterCount = 0

  constructor(design: Design, zImage: number | null) {
    this.design = design
    const s = design.sail
    const t = design.tail
    const n = design.numeric
    const xLeRoot = -s.pivot * s.rootChord
    const xLeTip = xLeRoot + s.height * Math.tan(s.sweep * DEG) + s.pivot * (s.rootChord - s.tipChord)
    const wing: Surface = {
      name: 'vela',
      xLeRoot,
      xLeTip,
      zRoot: s.gap,
      zTip: s.gap + s.height,
      cRoot: s.rootChord,
      cTip: s.tipChord,
      nSpan: n.sailSpan,
      nChord: n.sailChord,
    }
    const tail: Surface = {
      name: 'cola',
      xLeRoot: t.arm - 0.25 * t.chord,
      xLeTip: t.arm - 0.25 * t.chord,
      zRoot: s.gap + t.height,
      zTip: s.gap + t.height + t.span,
      cRoot: t.chord,
      cTip: t.chord,
      nSpan: n.tailSpan,
      nChord: n.tailChord,
    }
    const surfaces = t.span > 0 && t.chord > 0 ? [wing, tail] : [wing]
    this.vlm = new VLM(surfaces, zImage)
    this.area = 0.5 * (s.rootChord + s.tipChord) * s.height
    this.tailArea = t.chord * t.span
    this.zRefSail = s.gap + 0.45 * s.height
    this.sailPolars = sailPolarSet(design)
    this.tailPolars = tailPolarSet(design)
    this.lastDelta = new Float64Array(this.vlm.strips.length)
    // signo: un término independiente positivo corresponde a α de usuario positivo
    const g = this.vlm.solve(new Float64Array(this.vlm.panels.length).fill(1))
    let sum = 0
    for (const v of g) sum += v
    this.sgn = sum >= 0 ? 1 : -1
  }

  /**
   * Evalúa las fuerzas para un ángulo de ataque α (grados, en la altura de referencia),
   * ángulo de cola δ (grados) y perfil de viento aparente. phi: escora (rad) para el par por masa.
   *
   * VLM no lineal: en cada franja se busca una corrección de ángulo Δ tal que la sustentación del VLM
   * coincida con la de la polar 2D viscosa al ángulo efectivo α_ef = cl_VLM/2π − Δ y a su Reynolds.
   */
  evaluate(flow: (z: number) => LocalFlow, alphaDeg: number, tailDeg: number, phi: number): SailForces {
    const d = this.design
    const rho = d.env.rhoAir
    const nu = d.env.nuAir
    const ref = flow(this.zRefSail)
    const chordAngle = ref.psi + alphaDeg * DEG
    const v = this.vlm
    const np = v.panels.length
    const ns = v.strips.length
    const Ui = new Float64Array(np)
    const ai = new Float64Array(np)
    const geo = new Float64Array(np)
    const h = d.sail.height
    for (let i = 0; i < np; i++) {
      const p = v.panels[i]
      const f = flow(p.cz)
      // ángulo del flujo respecto a la cuerda en ejes de la vela (convención VLM)
      const aS = f.psi - chordAngle
      let inc = 0
      if (p.surface === 0) inc = d.sail.twist * DEG * ((p.cz - d.sail.gap) / h)
      else inc = tailDeg * DEG
      Ui[i] = f.U
      ai[i] = aS
      geo[i] = aS + inc
    }
    const stripU = new Float64Array(ns)
    const stripRe = new Float64Array(ns)
    const polarOf = (si: number) => (v.strips[si].surface === 0 ? this.sailPolars : this.tailPolars)
    for (let si = 0; si < ns; si++) {
      const st = v.strips[si]
      stripU[si] = Ui[st.panels[0]]
      stripRe[si] = Math.max(1000, (stripU[si] * st.chord) / nu)
    }
    // Δ en sentido de usuario; en el VLM el ángulo es −α, así que se resta
    // arranque en frío: el resultado no depende del historial (en pérdida puede haber varias soluciones)
    const delta = new Float64Array(ns)
    const rhs = new Float64Array(np)
    let gamma: Float64Array = new Float64Array(np)
    const clV = new Float64Array(ns)
    const aEff = new Float64Array(ns)
    const pol = new Array<{ cl: number; cd: number; cm: number; stalled: boolean }>(ns)
    const prevD = new Float64Array(ns)
    const prevR = new Float64Array(ns)
    const maxIter = Math.max(1, d.numeric.vlmIter)
    let converged = false
    let iter = 0
    for (; iter < maxIter; iter++) {
      for (let i = 0; i < np; i++) rhs[i] = -Ui[i] * Math.sin(geo[i] - delta[v.panels[i].strip])
      gamma = v.solve(rhs)
      let err = 0
      for (let si = 0; si < ns; si++) {
        const st = v.strips[si]
        let G = 0
        for (const k of st.panels) G += gamma[k]
        const U = stripU[si]
        const cl = U > 1e-6 ? (this.sgn * 2 * G) / (U * st.chord) : 0
        clV[si] = cl
        aEff[si] = cl / (2 * Math.PI) - delta[si]
        const pp = polarOf(si).at(aEff[si] / DEG, stripRe[si])
        pol[si] = pp
        const r = pp.cl - cl
        err = Math.max(err, Math.abs(r))
        // secante por franja (acelera la convergencia); si no es fiable, paso relajado
        const dPrev = prevD[si]
        const rPrev = prevR[si]
        prevD[si] = delta[si]
        prevR[si] = r
        let step = RELAX * (r / (2 * Math.PI))
        if (iter > 0 && SECANT && Math.abs(r - rPrev) > 1e-9) {
          const sec = (-r * (delta[si] - dPrev)) / (r - rPrev)
          // sólo si va en el mismo sentido y no es desmesurado
          if (Number.isFinite(sec) && sec * step > 0 && Math.abs(sec) < 4 * Math.abs(r / (2 * Math.PI)) + 1e-6) step = sec
        }
        delta[si] += step
      }
      if (err < 3e-3) {
        converged = true
        break
      }
    }
    this.lastDelta = delta
    this.evalCount++
    this.iterCount += iter + 1
    this.lastIter = iter + 1
    this.lastConverged = converged

    let Fxs = 0
    let Fys = 0
    let M = 0
    let zMom = 0
    const wing = { lift: 0, drag: 0 }
    const tail = { lift: 0, drag: 0 }
    let dragProfile = 0
    const strips: StripResult[] = []
    let anyStall = false
    let tailStall = false
    for (let si = 0; si < ns; si++) {
      const st = v.strips[si]
      let fx = 0
      let fy = 0
      let mz = 0
      for (const k of st.panels) {
        const p = v.panels[k]
        const g = gamma[k]
        const px = rho * g * Ui[k] * p.dz * Math.sin(ai[k])
        const py = -rho * g * Ui[k] * p.dz * Math.cos(ai[k])
        fx += px
        fy += py
        mz += p.mx * py
      }
      const U = stripU[si]
      const aS = ai[st.panels[0]]
      const pp = pol[si]
      const q = 0.5 * rho * U * U
      const dp = q * st.chord * st.dz * pp.cd
      fx += dp * Math.cos(aS)
      fy += dp * Math.sin(aS)
      mz += st.xqc * dp * Math.sin(aS)
      // momento de perfil (cm respecto a c/4): positivo encabrita, es decir, aumenta α
      mz += q * st.chord * st.chord * st.dz * pp.cm
      dragProfile += dp
      if (pp.stalled) {
        if (st.surface === 0) anyStall = true
        else tailStall = true
      }
      const liftStrip = Math.hypot(fx - dp * Math.cos(aS), fy - dp * Math.sin(aS))
      const sg = Math.sign(clV[si]) || 1
      if (st.surface === 0) {
        wing.lift += sg * liftStrip
        wing.drag += dp
      } else {
        tail.lift += sg * liftStrip
        tail.drag += dp
      }
      Fxs += fx
      Fys += fy
      M += mz
      zMom += st.z * Math.hypot(fx, fy)
      strips.push({ surface: st.surface, z: st.z, chord: st.chord, cl: clV[si], cd: pp.cd, alphaEff: aEff[si] / DEG, stalled: pp.stalled, load: q * st.chord * clV[si], re: stripRe[si] })
    }
    // Resistencia inducida en la dirección del flujo de referencia
    const Di = v.inducedDrag(gamma, rho)
    const aRef = ref.psi - chordAngle
    Fxs += Di * Math.cos(aRef)
    Fys += Di * Math.sin(aRef)

    // a ejes del barco
    const c = Math.cos(chordAngle)
    const sn = Math.sin(chordAngle)
    const Fx = Fxs * c - Fys * sn
    const Fy = Fxs * sn + Fys * c
    const qRef = 0.5 * rho * ref.U * ref.U
    const dir = ref.psi
    const drag = Fx * Math.cos(dir) + Fy * Math.sin(dir)
    const liftV = Fx * Math.sin(dir) - Fy * Math.cos(dir)
    const Ftot = Math.hypot(Fx, Fy)
    const zCE = Ftot > 0 ? zMom / Math.hypot(Fxs, Fys) : this.zRefSail
    const xCEs = Math.abs(Fys) > 1e-9 ? M / Fys : 0
    const xCE = d.sail.x + xCEs * c
    const asm = this.massAssembly()
    const Mgrav = asm.offset * asm.mass * 9.81 * Math.sin(phi) * Math.cos(chordAngle)
    return {
      alpha: alphaDeg,
      chordAngle,
      Fx,
      Fy,
      wing,
      tail,
      lift: liftV,
      dragInduced: Di,
      dragProfile,
      CL: qRef > 0 ? liftV / (qRef * this.area) : 0,
      CD: qRef > 0 ? drag / (qRef * this.area) : 0,
      zCE,
      xCE,
      Maero: M,
      Mgrav,
      strips,
      qRef,
      anyStall,
      tailStall,
      iterations: this.lastIter,
      converged: converged,
    }
  }

  massAssembly() {
    const d = this.design
    const cMean = 0.5 * (d.sail.rootChord + d.sail.tipChord)
    const wingX = (0.4 - d.sail.pivot) * cMean
    const m = d.sail.mass + d.tail.mass + d.tail.counterweight
    const off = m > 0 ? (d.sail.mass * wingX + d.tail.mass * d.tail.arm - d.tail.counterweight * d.tail.counterweightArm) / m : 0
    return { mass: m, offset: off }
  }

  /**
   * Ángulo de ataque de equilibrio para un ángulo de cola δ (grados): momento total respecto al eje nulo.
   * La vela libre gira en el sentido del momento hasta el primer equilibrio estable (dM/dα < 0):
   * se parte de la estimación previa (o de α = 0), se avanza en el sentido del momento con pasos
   * crecientes hasta cambiar de signo y se afina con Brent.
   * Con withMargin también calcula el margen de estabilidad (punto neutro respecto al eje en % de la cuerda media).
   */
  tailEquilibrium(flow: (z: number) => LocalFlow, tailDeg: number, phi: number, guess?: number, withMargin = true) {
    this.eqCount++
    const Mt = (a: number) => {
      const r = this.evaluate(flow, a, tailDeg, phi)
      return r.Maero + r.Mgrav
    }
    const LIM = 40
    let a0 = guess !== undefined && Number.isFinite(guess) ? Math.max(-LIM, Math.min(LIM, guess)) : 0
    let f0 = Mt(a0)
    let alpha = a0
    let found = false
    const tol = 1e-5 * Math.max(1e-3, this.lastMScale)
    if (Math.abs(f0) < 1e-12) found = true
    // atajo: secante desde la estimación con la pendiente del último equilibrio (cerca de una solución conocida)
    if (!found && guess !== undefined && Number.isFinite(this.lastSlope) && this.lastSlope < 0) {
      let xa = a0
      let fa = f0
      let xb = a0 - f0 / this.lastSlope
      if (Math.abs(xb - a0) < 2) {
        let fb = Mt(xb)
        for (let k = 0; k < 4; k++) {
          if (Math.abs(fb) < tol || Math.abs(xb - xa) < 2e-3) {
            found = true
            alpha = xb
            break
          }
          if (fb === fa) break
          const xc = xb - (fb * (xb - xa)) / (fb - fa)
          if (!Number.isFinite(xc) || Math.abs(xc - a0) > 2) break
          xa = xb
          fa = fb
          xb = xc
          fb = Mt(xb)
        }
        if (found && Math.abs(xb - xa) > 1e-9 && fb !== fa) {
          const sl = (fb - fa) / (xb - xa)
          if (sl < 0) this.lastSlope = sl
        }
      }
    }
    if (!found) {
      const dir = f0 > 0 ? 1 : -1
      let step = 0.5
      for (let k = 0; k < 12; k++) {
        const a1 = Math.max(-LIM, Math.min(LIM, a0 + dir * step))
        const f1 = Mt(a1)
        if ((f0 > 0 && f1 <= 0) || (f0 < 0 && f1 >= 0)) {
          const lo = Math.min(a0, a1)
          const hi = Math.max(a0, a1)
          alpha = brent(Mt, lo, hi, 2e-3, 30)
          found = true
          const sl = (f1 - f0) / (a1 - a0)
          if (sl < 0) this.lastSlope = sl
          this.lastMScale = Math.max(Math.abs(f0), Math.abs(f1))
          break
        }
        if (a1 === a0) break
        a0 = a1
        f0 = f1
        step *= 2
      }
      if (!found) alpha = dir > 0 ? LIM : -LIM
    }
    if (!withMargin) return { alpha, found, dMdAlpha: NaN, stable: true, margin: NaN }
    const da = 0.5
    const r0 = this.evaluate(flow, alpha - da, tailDeg, phi)
    const r1 = this.evaluate(flow, alpha + da, tailDeg, phi)
    const dM = (r1.Maero - r0.Maero) / (2 * da)
    const dL = (r1.lift - r0.lift) / (2 * da)
    const cMean = 0.5 * (this.design.sail.rootChord + this.design.sail.tipChord)
    // punto neutro: x tal que dM/dα = -x dL/dα (x + hacia popa)
    const xNP = Math.abs(dL) > 1e-12 ? -dM / dL : 0
    return { alpha, found, dMdAlpha: dM, stable: dM < 0, margin: (xNP / cMean) * 100 }
  }
}
