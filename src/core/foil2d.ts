import { luDecompose, luSolve, pchip, type LU } from './math'
import type { PolarTable } from './data/naca0012'

/**
 * Método de paneles 2D con capa límite integral (método 4).
 *
 * - Flujo potencial: método de Hess-Smith (fuente constante por panel + vórtice constante común),
 *   condición de Kutta de igual velocidad tangencial en los dos paneles del borde de salida.
 * - Capa límite laminar: método de Thwaites con las correlaciones de Cebeci y Bradshaw.
 * - Transición: método eⁿ con la envolvente aproximada de Drela y Giles; también al separarse la laminar.
 * - Capa límite turbulenta: método de entrada de Head con la fricción de Ludwieg y Tillmann.
 * - Acoplamiento viscoso-no viscoso: velocidad de transpiración v = d(Ue·δ*)/ds, iterada con relajación.
 * - Resistencia: fórmula de Squire y Young en el borde de salida.
 * - Pérdida: modelo de Kirchhoff con el punto de separación turbulenta del extradós,
 *   y mezcla con placa plana a ángulos grandes (en polars.ts).
 *
 * Unidades adimensionales: cuerda 1, velocidad del infinito 1, ν = 1/Re.
 */

export interface Foil2DOptions {
  panels: number
  ncrit: number
  iterations: number
}

export interface Foil2DPoint {
  alpha: number
  cl: number
  cd: number
  cm: number
  /** posición de transición (x/c) en extradós e intradós */
  xtrU: number
  xtrL: number
  /** separación turbulenta (x/c) en la cara de succión, 1 si no hay */
  xsep: number
  converged: boolean
}

interface BLResult {
  /** δ* en cada panel */
  dstar: Float64Array
  cdSY: number
  xtr: number
  xsep: number
}

const TWO_PI = 2 * Math.PI

/** Reparte los nodos del contorno con espaciado en coseno por longitud de arco (borde de salida inferior → borde de ataque → borde de salida superior). */
export function repanel(pts: { x: number; y: number }[], n: number): { x: Float64Array; y: Float64Array } {
  // pts en orden Selig: TE extradós → LE → TE intradós. Se invierte para tener sentido horario.
  const p = [...pts].reverse()
  const s: number[] = [0]
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y))
  // borde de ataque: x mínima
  let iLe = 0
  for (let i = 1; i < p.length; i++) if (p[i].x < p[iLe].x) iLe = i
  const sLe = s[iLe]
  const sEnd = s[s.length - 1]
  // eliminar puntos duplicados (s no estrictamente creciente)
  const ss: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < p.length; i++) {
    if (i > 0 && s[i] - ss[ss.length - 1] < 1e-9) continue
    ss.push(s[i])
    xs.push(p[i].x)
    ys.push(p[i].y)
  }
  const fx = pchip(ss, xs)
  const fy = pchip(ss, ys)
  const half = Math.max(8, Math.round(n / 2))
  const out: number[] = []
  for (let k = 0; k <= half; k++) out.push(sLe * 0.5 * (1 - Math.cos((Math.PI * k) / half)))
  for (let k = 1; k <= half; k++) out.push(sLe + (sEnd - sLe) * 0.5 * (1 - Math.cos((Math.PI * k) / half)))
  const x = new Float64Array(out.length)
  const y = new Float64Array(out.length)
  out.forEach((v, i) => {
    x[i] = fx(v)
    y[i] = fy(v)
  })
  return { x, y }
}

// ---------- correlaciones de capa límite ----------

function thwaites(lambda: number) {
  const l = Math.max(-0.1, Math.min(0.1, lambda))
  if (l >= 0) return { L: 0.22 + 1.57 * l - 1.8 * l * l, H: 2.61 - 3.75 * l + 5.24 * l * l }
  return { L: 0.22 + 1.402 * l + (0.018 * l) / (l + 0.107), H: 2.088 + 0.0731 / (l + 0.14) }
}

function dnDRet(H: number) {
  const a = 2.4 * H - 3.7 + 2.5 * Math.tanh(1.5 * H - 4.65)
  return 0.01 * Math.sqrt(a * a + 0.25)
}

function log10Ret0(H: number) {
  const h = Math.max(H, 1.05)
  return (1.415 / (h - 1) - 0.489) * Math.tanh(20 / (h - 1) - 12.9) + 3.295 / (h - 1) + 0.44
}

function fsL(H: number) {
  return (6.54 * H - 14.07) / (H * H)
}

function fsM(H: number) {
  return (0.058 * ((H - 4) ** 2) / (H - 1) - 0.068) / fsL(H)
}

function H1ofH(H: number) {
  if (H <= 1.6) return 3.3 + 0.8234 * Math.pow(Math.max(H - 1.1, 1e-3), -1.287)
  return 3.3 + 1.5501 * Math.pow(H - 0.6778, -3.064)
}

function HofH1(H1: number) {
  const h = Math.max(H1, 3.32)
  if (h >= 5.3) return 1.1 + 0.86 * Math.pow(h - 3.3, -0.777)
  return 0.6778 + 1.1536 * Math.pow(h - 3.3, -0.326)
}

function headF(H1: number) {
  return 0.0306 * Math.pow(Math.max(H1 - 3, 1e-3), -0.6169)
}

function cfLT(H: number, reTheta: number) {
  return 0.246 * Math.pow(10, -0.678 * H) * Math.pow(Math.max(reTheta, 10), -0.268)
}

const H_SEP = 2.4

/**
 * Capa límite de una cara, desde el punto de remanso.
 * s: abscisa curvilínea de cada estación (la primera es el remanso, Ue = 0); ue: velocidad exterior.
 */
function marchSurface(s: number[], ue: number[], x: number[], nu: number, ncrit: number) {
  const n = s.length
  const theta = new Float64Array(n)
  const H = new Float64Array(n)
  let xtr = 1
  let xsep = 1
  let turbulent = false
  let ampl = 0
  let I = 0
  const due = (k: number) => {
    const a = Math.max(0, k - 1)
    const b = Math.min(n - 1, k + 1)
    return (ue[b] - ue[a]) / Math.max(s[b] - s[a], 1e-12)
  }
  let th = 0
  let h1 = 0
  for (let k = 1; k < n; k++) {
    const ds = s[k] - s[k - 1]
    if (!turbulent) {
      I += 0.5 * (ue[k - 1] ** 5 + ue[k] ** 5) * ds
      const u = Math.max(ue[k], 1e-6)
      th = Math.sqrt((0.45 * nu * I) / u ** 6)
      const lambda = ((th * th) / nu) * due(k)
      const t = thwaites(lambda)
      theta[k] = th
      H[k] = t.H
      // amplificación eⁿ
      const reT = (u * th) / nu
      const hk = Math.min(Math.max(t.H, 2.2), 7)
      if (Math.log10(Math.max(reT, 1)) > log10Ret0(hk) && th > 0) {
        ampl += ((dnDRet(hk) * (fsM(hk) + 1)) / 2) * (fsL(hk) / th) * ds
      }
      if (ampl >= ncrit || lambda < -0.09) {
        turbulent = true
        xtr = x[k]
        H[k] = Math.min(H[k], 1.6)
        h1 = H1ofH(1.4)
      }
    } else {
      // Head: integración con subpasos (Euler mejorado)
      const nsub = 4
      const h = ds / nsub
      for (let j = 0; j < nsub; j++) {
        const uA = ue[k - 1] + (ue[k] - ue[k - 1]) * (j / nsub)
        const uB = ue[k - 1] + (ue[k] - ue[k - 1]) * ((j + 1) / nsub)
        const dU = (ue[k] - ue[k - 1]) / Math.max(ds, 1e-12)
        const rhs = (thv: number, h1v: number, u: number) => {
          const Hv = Math.min(HofH1(h1v), H_SEP)
          const cf = cfLT(Hv, (Math.max(u, 1e-6) * thv) / nu)
          const dth = cf / 2 - ((Hv + 2) * thv * dU) / Math.max(u, 1e-6)
          const dh1 = (headF(h1v) - h1v * dth - (h1v * thv * dU) / Math.max(u, 1e-6)) / Math.max(thv, 1e-9)
          return [dth, dh1]
        }
        const [a1, b1] = rhs(th, h1, uA)
        const thP = th + h * a1
        const h1P = Math.max(3.32, h1 + h * b1)
        const [a2, b2] = rhs(thP, h1P, uB)
        th = Math.max(1e-7, th + 0.5 * h * (a1 + a2))
        h1 = Math.max(3.32, h1 + 0.5 * h * (b1 + b2))
      }
      const Hk = HofH1(h1)
      if (Hk >= H_SEP && xsep === 1) xsep = x[k]
      theta[k] = th
      H[k] = Math.min(Hk, H_SEP)
    }
  }
  return { theta, H, xtr, xsep }
}

export class Foil2D {
  x: Float64Array
  y: Float64Array
  n: number
  xc: Float64Array
  yc: Float64Array
  tx: Float64Array
  ty: Float64Array
  len: Float64Array
  An: Float64Array
  At: Float64Array
  Bn: Float64Array
  Bt: Float64Array
  lu: LU
  opts: Foil2DOptions
  relax = 0.25

  constructor(pts: { x: number; y: number }[], opts: Foil2DOptions) {
    this.opts = opts
    const { x, y } = repanel(pts, opts.panels)
    this.x = x
    this.y = y
    const n = x.length - 1
    this.n = n
    this.xc = new Float64Array(n)
    this.yc = new Float64Array(n)
    this.tx = new Float64Array(n)
    this.ty = new Float64Array(n)
    this.len = new Float64Array(n)
    for (let j = 0; j < n; j++) {
      const dx = x[j + 1] - x[j]
      const dy = y[j + 1] - y[j]
      const l = Math.hypot(dx, dy)
      this.len[j] = l
      this.tx[j] = dx / l
      this.ty[j] = dy / l
      this.xc[j] = 0.5 * (x[j] + x[j + 1])
      this.yc[j] = 0.5 * (y[j] + y[j + 1])
    }
    this.An = new Float64Array(n * n)
    this.At = new Float64Array(n * n)
    this.Bn = new Float64Array(n)
    this.Bt = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const nxI = -this.ty[i]
      const nyI = this.tx[i]
      for (let j = 0; j < n; j++) {
        let beta: number
        let lnr: number
        if (i === j) {
          beta = Math.PI
          lnr = 0
        } else {
          const dx1 = this.xc[i] - x[j]
          const dy1 = this.yc[i] - y[j]
          const dx2 = this.xc[i] - x[j + 1]
          const dy2 = this.yc[i] - y[j + 1]
          beta = Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2)
          lnr = 0.5 * Math.log((dx1 * dx1 + dy1 * dy1) / (dx2 * dx2 + dy2 * dy2))
        }
        const txJ = this.tx[j]
        const tyJ = this.ty[j]
        const nxJ = -tyJ
        const nyJ = txJ
        // fuente: u = ln(r1/r2)/2π (tangente), v = β/2π (normal)
        const sx = (lnr * txJ + beta * nxJ) / TWO_PI
        const sy = (lnr * tyJ + beta * nyJ) / TWO_PI
        // vórtice: u = β/2π, v = −ln(r1/r2)/2π
        const vx = (beta * txJ - lnr * nxJ) / TWO_PI
        const vy = (beta * tyJ - lnr * nyJ) / TWO_PI
        this.An[i * n + j] = sx * nxI + sy * nyI
        this.At[i * n + j] = sx * this.tx[i] + sy * this.ty[i]
        this.Bn[i] += vx * nxI + vy * nyI
        this.Bt[i] += vx * this.tx[i] + vy * this.ty[i]
      }
    }
    const N = n + 1
    const M = new Float64Array(N * N)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) M[i * N + j] = this.An[i * n + j]
      M[i * N + n] = this.Bn[i]
    }
    for (let j = 0; j < n; j++) M[n * N + j] = this.At[j] + this.At[(n - 1) * n + j]
    M[n * N + n] = this.Bt[0] + this.Bt[n - 1]
    this.lu = luDecompose(M, N)
  }

  /** Velocidad tangencial en cada panel para un ángulo α (rad) y una transpiración dada. */
  tangential(alpha: number, vtr: Float64Array): Float64Array {
    const n = this.n
    const ca = Math.cos(alpha)
    const sa = Math.sin(alpha)
    const rhs = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) rhs[i] = -(ca * -this.ty[i] + sa * this.tx[i]) + vtr[i]
    rhs[n] = -(ca * (this.tx[0] + this.tx[n - 1]) + sa * (this.ty[0] + this.ty[n - 1]))
    const sol = luSolve(this.lu, rhs)
    const g = sol[n]
    const vt = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let v = ca * this.tx[i] + sa * this.ty[i] + g * this.Bt[i]
      for (let j = 0; j < n; j++) v += this.At[i * n + j] * sol[j]
      vt[i] = v
    }
    return vt
  }

  /** Coeficientes de presión integrados: cl y cm respecto a c/4. */
  forces(alpha: number, vt: Float64Array) {
    let cx = 0
    let cy = 0
    let mz = 0
    for (let i = 0; i < this.n; i++) {
      const cp = 1 - vt[i] * vt[i]
      const nx = -this.ty[i]
      const ny = this.tx[i]
      const fx = -cp * nx * this.len[i]
      const fy = -cp * ny * this.len[i]
      cx += fx
      cy += fy
      mz += (this.xc[i] - 0.25) * fy - this.yc[i] * fx
    }
    const cl = cy * Math.cos(alpha) - cx * Math.sin(alpha)
    return { cl, cm: -mz }
  }

  /** Capa límite sobre las dos caras para una distribución de velocidad tangencial. */
  boundaryLayer(vt: Float64Array, re: number): { up: BLResult; lo: BLResult; stag: number } {
    const n = this.n
    const nu = 1 / re
    // remanso: cambio de signo de vt (negativa en el intradós, positiva en el extradós)
    let is = -1
    for (let i = 0; i < n - 1; i++) {
      if (vt[i] < 0 && vt[i + 1] >= 0) {
        // el más cercano al borde de ataque
        if (is < 0 || Math.abs(this.xc[i]) < Math.abs(this.xc[is])) is = i
      }
    }
    if (is < 0) is = Math.floor(n / 2) - 1
    const f = vt[is] / (vt[is] - vt[is + 1])
    const dist = 0.5 * (this.len[is] + this.len[is + 1])
    const sStag = f * dist // distancia desde el centro del panel is
    const build = (dir: 1 | -1) => {
      const idx: number[] = []
      const s: number[] = [0]
      const ue: number[] = [0]
      const xx: number[] = [dir > 0 ? this.xc[is + 1] : this.xc[is]]
      let acc = dir > 0 ? dist - sStag : sStag
      let i = dir > 0 ? is + 1 : is
      let first = true
      while (i >= 0 && i < n) {
        if (!first) acc += 0.5 * (this.len[i] + this.len[i - dir])
        first = false
        idx.push(i)
        s.push(acc)
        ue.push(Math.abs(vt[i]))
        xx.push(this.xc[i])
        i += dir
      }
      return { idx, s, ue, xx }
    }
    const surf = (dir: 1 | -1): BLResult => {
      const b = build(dir)
      const r = marchSurface(b.s, b.ue, b.xx, nu, this.opts.ncrit)
      const dstar = new Float64Array(n)
      for (let k = 0; k < b.idx.length; k++) dstar[b.idx[k]] = r.theta[k + 1] * r.H[k + 1]
      const last = b.s.length - 1
      const th = r.theta[last]
      const H = r.H[last]
      const uTe = b.ue[last]
      const cdSY = 2 * th * Math.pow(Math.max(uTe, 0.05), (H + 5) / 2)
      return { dstar, cdSY, xtr: r.xtr, xsep: r.xsep }
    }
    return { up: surf(1), lo: surf(-1), stag: is }
  }

  /** Punto de la polar con acoplamiento viscoso. alpha en grados. */
  point(alphaDeg: number, re: number): Foil2DPoint {
    const a = (alphaDeg * Math.PI) / 180
    const n = this.n
    let vtr = new Float64Array(n)
    let vt = this.tangential(a, vtr)
    let bl = this.boundaryLayer(vt, re)
    let clPrev = this.forces(a, vt).cl
    let converged = false
    const iters = Math.max(0, this.opts.iterations)
    for (let it = 0; it < iters; it++) {
      // transpiración: d(Ue δ*)/ds a lo largo de la superficie (orden de paneles)
      const m = new Float64Array(n)
      for (let i = 0; i < n; i++) m[i] = Math.abs(vt[i]) * (bl.up.dstar[i] + bl.lo.dstar[i])
      const next = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        // derivada respecto a la abscisa en el sentido del flujo de cada cara
        const dirUp = i > bl.stag
        const iPrev = dirUp ? i - 1 : i + 1
        if (iPrev < 0 || iPrev >= n || (dirUp && iPrev <= bl.stag) || (!dirUp && iPrev > bl.stag)) {
          next[i] = 0
          continue
        }
        const ds = 0.5 * (this.len[i] + this.len[iPrev])
        next[i] = (m[i] - m[iPrev]) / ds
      }
      // suavizado de 3 puntos y relajación fuerte: el acoplamiento directo es inestable cerca de la separación
      const sm = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const a0 = next[Math.max(0, i - 1)]
        const a2 = next[Math.min(n - 1, i + 1)]
        sm[i] = Math.max(-0.2, Math.min(0.2, 0.25 * a0 + 0.5 * next[i] + 0.25 * a2))
      }
      const w = this.relax
      const mixed = new Float64Array(n)
      for (let i = 0; i < n; i++) mixed[i] = (1 - w) * vtr[i] + w * sm[i]
      vtr = mixed
      vt = this.tangential(a, vtr)
      bl = this.boundaryLayer(vt, re)
      const cl = this.forces(a, vt).cl
      if (Math.abs(cl - clPrev) < 1e-3) {
        converged = true
        clPrev = cl
        break
      }
      clPrev = cl
    }
    const f = this.forces(a, vt)
    const suctionUp = alphaDeg >= 0
    const xsep = suctionUp ? bl.up.xsep : bl.lo.xsep
    // Kirchhoff: pérdida de sustentación por separación del borde de salida
    const fs = Math.max(0, Math.min(1, xsep))
    const k = ((1 + Math.sqrt(fs)) / 2) ** 2
    const cl = f.cl * k
    const cnAtt = f.cl / Math.max(Math.cos(a), 0.2)
    // resistencia de presión por la separación (fuerza normal del modelo de Kirchhoff)
    const cdSep = Math.abs(cnAtt * k * Math.sin(a)) * (1 - Math.sqrt(fs))
    const cd = bl.up.cdSY + bl.lo.cdSY + Math.abs(cdSep)
    // momento: el centro de presión se desplaza hacia atrás con la separación
    const cm = f.cm - cnAtt * (k - 0) * 0.25 * (1 - Math.sqrt(fs)) * Math.sign(alphaDeg || 1) * 0.5
    return { alpha: alphaDeg, cl, cd, cm, xtrU: bl.up.xtr, xtrL: bl.lo.xtr, xsep, converged: converged || iters === 0 }
  }

  /** Polar a un Reynolds dado, α en grados. */
  polar(re: number, alphas: number[]): PolarTable {
    const out: PolarTable = { re, alpha: [], cl: [], cd: [], cm: [] }
    for (const a of alphas) {
      const p = this.point(a, re)
      if (![p.cl, p.cd, p.cm].every(Number.isFinite)) continue
      out.alpha.push(a)
      out.cl.push(p.cl)
      out.cd.push(p.cd)
      out.cm.push(p.cm)
    }
    return out
  }
}
