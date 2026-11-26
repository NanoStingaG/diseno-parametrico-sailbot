import { VLM, type Surface } from './vlm'
import { brent, cfITTC, DEG, interp } from './math'
import type { Design, Polar2D } from './types'

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
}

function profileCd(polar: Polar2D | undefined, alphaDeg: number, re: number, tc: number) {
  if (polar && polar.points.length > 1) {
    const pts = polar.points
    const xs = pts.map((p) => p.alpha)
    const cds = pts.map((p) => p.cd)
    // perfil simétrico: si la polar sólo tiene α positivos, usar |α|
    const a = xs[0] >= 0 ? Math.abs(alphaDeg) : alphaDeg
    return interp(xs, cds, a)
  }
  return 2 * cfITTC(re) * (1 + 2 * tc + 60 * tc ** 4)
}

export function polarSlope(polar?: Polar2D): number {
  // pendiente en la zona lineal (|α| ≤ 4°), por rad
  if (!polar || polar.points.length < 3) return 2 * Math.PI
  const pts = polar.points.filter((p) => Math.abs(p.alpha) <= 4.01)
  if (pts.length < 2) return 2 * Math.PI
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of pts) {
    sx += p.alpha
    sy += p.cl
    sxx += p.alpha * p.alpha
    sxy += p.alpha * p.cl
  }
  const n = pts.length
  const slopeDeg = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  return slopeDeg / DEG
}

export function polarClMax(polar?: Polar2D): number | null {
  if (!polar || polar.points.length < 2) return null
  return Math.max(...polar.points.map((p) => p.cl))
}

export class SailModel {
  design: Design
  vlm: VLM
  area: number
  tailArea: number
  zRefSail: number
  slopeFactor: number
  clMaxWing: number

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
    this.slopeFactor = polarSlope(design.sailPolar) / (2 * Math.PI)
    this.clMaxWing = polarClMax(design.sailPolar) ?? s.clMax
  }

  /**
   * Evalúa las fuerzas para un ángulo de ataque α (grados, en la altura de referencia),
   * ángulo de cola δ (grados) y perfil de viento aparente. phi: escora (rad) para el par por masa.
   */
  evaluate(flow: (z: number) => LocalFlow, alphaDeg: number, tailDeg: number, phi: number): SailForces {
    const d = this.design
    const rho = d.env.rhoAir
    const nu = d.env.nuAir
    const ref = flow(this.zRefSail)
    const chordAngle = ref.psi + alphaDeg * DEG
    const v = this.vlm
    const np = v.panels.length
    const rhs = new Float64Array(np)
    const Ui = new Float64Array(np)
    const ai = new Float64Array(np)
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
      rhs[i] = -f.U * Math.sin(aS + inc)
    }
    const gamma = v.solve(rhs)
    for (let i = 0; i < np; i++) gamma[i] *= this.slopeFactor

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
    for (const st of v.strips) {
      let G = 0
      let fx = 0
      let fy = 0
      let mz = 0
      for (const k of st.panels) {
        const p = v.panels[k]
        const g = gamma[k]
        G += g
        const px = rho * g * Ui[k] * p.dz * Math.sin(ai[k])
        const py = -rho * g * Ui[k] * p.dz * Math.cos(ai[k])
        fx += px
        fy += py
        mz += p.mx * py
      }
      const k0 = st.panels[0]
      const U = Ui[k0]
      const aS = ai[k0]
      const cl = U > 1e-6 ? (2 * G) / (U * st.chord) : 0
      const a0 = 2 * Math.PI * this.slopeFactor
      const alphaEff = cl / a0 / DEG
      const tc = st.surface === 0 ? d.sail.thickness : d.tail.thickness
      const re = (U * st.chord) / nu
      const polar = st.surface === 0 ? d.sailPolar : undefined
      const cd = profileCd(polar, alphaEff, re, tc)
      const q = 0.5 * rho * U * U
      const dp = q * st.chord * st.dz * cd
      fx += dp * Math.cos(aS)
      fy += dp * Math.sin(aS)
      mz += st.xqc * dp * Math.sin(aS)
      dragProfile += dp
      const clMax = st.surface === 0 ? this.clMaxWing : d.tail.clMax
      const stalled = Math.abs(cl) > clMax
      if (stalled) {
        if (st.surface === 0) anyStall = true
        else tailStall = true
      }
      const liftStrip = Math.hypot(fx - dp * Math.cos(aS), fy - dp * Math.sin(aS))
      if (st.surface === 0) {
        wing.lift += Math.sign(G) * liftStrip
        wing.drag += dp
      } else {
        tail.lift += Math.sign(G) * liftStrip
        tail.drag += dp
      }
      Fxs += fx
      Fys += fy
      M += mz
      zMom += st.z * Math.hypot(fx, fy)
      strips.push({ surface: st.surface, z: st.z, chord: st.chord, cl, cd, alphaEff, stalled, load: (q * st.chord * cl) })
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
    // sustentación y resistencia respecto al flujo de referencia
    const dir = ref.psi
    const drag = Fx * Math.cos(dir) + Fy * Math.sin(dir)
    const liftV = Fx * Math.sin(dir) - Fy * Math.cos(dir)
    const Ftot = Math.hypot(Fx, Fy)
    const zCE = Ftot > 0 ? zMom / Math.hypot(Fxs, Fys) : this.zRefSail
    // posición x del CE en ejes del barco: a partir del momento respecto al eje
    const xCEs = Math.abs(Fys) > 1e-9 ? M / Fys : 0
    const xCE = d.sail.x + xCEs * c
    // Par por masa del conjunto con escora (gravedad hacia +y en ejes del barco)
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
   * Devuelve también el margen de estabilidad (punto neutro respecto al eje en % de la cuerda media).
   */
  tailEquilibrium(flow: (z: number) => LocalFlow, tailDeg: number, phi: number, guess?: number) {
    const Mt = (a: number) => {
      const r = this.evaluate(flow, a, tailDeg, phi)
      return r.Maero + r.Mgrav
    }
    let alpha = NaN
    let found = false
    // secante desde la estimación previa
    if (guess !== undefined && Number.isFinite(guess)) {
      let a0 = guess - 0.5
      let a1 = guess + 0.5
      let f0 = Mt(a0)
      let f1 = Mt(a1)
      for (let i = 0; i < 8; i++) {
        if (f1 === f0) break
        const a2 = a1 - (f1 * (a1 - a0)) / (f1 - f0)
        if (!Number.isFinite(a2) || Math.abs(a2) > 40) break
        a0 = a1
        f0 = f1
        a1 = a2
        f1 = Mt(a1)
        if (Math.abs(a1 - a0) < 1e-3) {
          alpha = a1
          found = true
          break
        }
      }
    }
    if (!found) {
      const lo = -30
      const hi = 30
      const flo = Mt(lo)
      const fhi = Mt(hi)
      if (flo * fhi < 0) {
        alpha = brent(Mt, lo, hi, 1e-4, 50)
        found = true
      } else alpha = Math.abs(flo) < Math.abs(fhi) ? lo : hi
    }
    const da = 0.5
    const r0 = this.evaluate(flow, alpha - da, tailDeg, phi)
    const r1 = this.evaluate(flow, alpha + da, tailDeg, phi)
    const dM = (r1.Maero - r0.Maero) / (2 * da)
    // fuerza normal en ejes de la vela ≈ sustentación
    const dL = (r1.lift - r0.lift) / (2 * da)
    const cMean = 0.5 * (this.design.sail.rootChord + this.design.sail.tipChord)
    // punto neutro: x tal que dM/dα = -x dL/dα (x + hacia popa)
    const xNP = Math.abs(dL) > 1e-12 ? -dM / dL : 0
    return { alpha, found, dMdAlpha: dM, stable: dM < 0, margin: (xNP / cMean) * 100 }
  }
}
