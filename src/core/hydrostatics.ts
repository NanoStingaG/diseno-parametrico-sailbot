import type { Boat } from './boat'
import { sectionPolyline, clipPolygon, clipPolylineLength, type HullBody } from './hull'
import { brent, DEG, G as g } from './math'

/**
 * Postura del barco: escora phi (rad, + estribor abajo), asiento theta (rad, + proa abajo)
 * y nivel del agua h en el sistema girado. El punto de referencia es (xRef, 0, 0).
 */
export interface Pose {
  phi: number
  theta: number
  h: number
}

export interface HullImmersion {
  name: string
  V: number
  /** centroide en ejes del barco */
  cx: number
  cy: number
  cz: number
  wetted: number
  lwl: number
  /** área máxima de sección sumergida */
  aMax: number
}

export interface Immersion {
  V: number
  cx: number
  cy: number
  cz: number
  hulls: HullImmersion[]
}

/** Transformación de un punto del barco a ejes tierra (x_e, y_e, z_e). */
export function toEarth(x: number, y: number, z: number, xRef: number, phi: number, theta: number) {
  const cp = Math.cos(phi)
  const sp = Math.sin(phi)
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const xr = x - xRef
  const y1 = y * cp + z * sp
  const z1 = -y * sp + z * cp
  return { x: xr * ct + z1 * st, y: y1, z: -xr * st + z1 * ct }
}

export class Hydrostatics {
  boat: Boat
  xRef: number
  N: number
  /** Polilíneas de sección precalculadas por casco */
  private sections: { hull: HullBody; xs: number[]; dx: number; polys: number[][] }[]

  constructor(boat: Boat, N?: number) {
    this.boat = boat
    this.N = N ?? boat.design.numeric.sections
    this.xRef = boat.design.hull.L / 2
    this.sections = boat.hulls.map((h) => {
      const dx = h.shape.L / this.N
      const xs: number[] = []
      const polys: number[][] = []
      for (let i = 0; i < this.N; i++) {
        const xl = (i + 0.5) * dx
        xs.push(h.x0 + xl)
        polys.push(sectionPolyline(h, xl))
      }
      return { hull: h, xs, dx, polys }
    })
  }

  /** Volumen sumergido y centro de carena para una postura. */
  immersion(p: Pose): Immersion {
    const cp = Math.cos(p.phi)
    const sp = Math.sin(p.phi)
    const ct = Math.cos(p.theta)
    const st = Math.sin(p.theta)
    const a = -sp * ct
    const b = cp * ct
    let V = 0
    let Mx = 0
    let My = 0
    let Mz = 0
    const hulls: HullImmersion[] = []
    for (const s of this.sections) {
      let hv = 0
      let hx = 0
      let hy = 0
      let hz = 0
      let wet = 0
      let xMin = Infinity
      let xMax = -Infinity
      let aMax = 0
      for (let i = 0; i < s.xs.length; i++) {
        const poly = s.polys[i]
        if (poly.length < 6) continue
        const x = s.xs[i]
        const c = p.h + (x - this.xRef) * st
        const r = clipPolygon(poly, a, b, c)
        if (r.area <= 0) continue
        const dV = r.area * s.dx
        hv += dV
        hx += dV * x
        hy += dV * r.cy
        hz += dV * r.cz
        wet += clipPolylineLength(poly, a, b, c) * s.dx
        if (x < xMin) xMin = x
        if (x > xMax) xMax = x
        if (r.area > aMax) aMax = r.area
      }
      hulls.push({
        name: s.hull.name,
        V: hv,
        cx: hv > 0 ? hx / hv : 0,
        cy: hv > 0 ? hy / hv : 0,
        cz: hv > 0 ? hz / hv : 0,
        wetted: wet,
        lwl: hv > 0 ? xMax - xMin + s.dx : 0,
        aMax,
      })
      V += hv
      Mx += hx
      My += hy
      Mz += hz
    }
    // Apéndices: siempre sumergidos
    for (const f of this.boat.fixedVolumes) {
      V += f.V
      Mx += f.V * f.x
      My += f.V * f.y
      Mz += f.V * f.z
    }
    return { V, cx: V > 0 ? Mx / V : 0, cy: V > 0 ? My / V : 0, cz: V > 0 ? Mz / V : 0, hulls }
  }

  /** Rango del nivel del agua que va de nada a todo sumergido. */
  private hRange(phi: number, theta: number) {
    let lo = Infinity
    let hi = -Infinity
    for (const s of this.sections) {
      for (let i = 0; i < s.xs.length; i += 4) {
        const poly = s.polys[i]
        for (let k = 0; k < poly.length; k += 2) {
          const e = toEarth(s.xs[i], poly[k], poly[k + 1], this.xRef, phi, theta)
          if (e.z < lo) lo = e.z
          if (e.z > hi) hi = e.z
        }
      }
    }
    return { lo: lo - 0.05, hi: hi + 0.05 }
  }

  /**
   * Equilibrio vertical y longitudinal para una escora dada.
   * mPitch: momento externo de cabeceo (N·m, + proa abajo).
   */
  equilibrium(phi: number, mPitch = 0, extraMass = 0) {
    const rho = this.boat.design.env.rhoWater
    const m = this.boat.mass + extraMass
    const G = this.boat.G
    const solveH = (theta: number) => {
      const r = this.hRange(phi, theta)
      return brent((h) => rho * this.immersion({ phi, theta, h }).V - m, r.lo, r.hi, 1e-6, 60)
    }
    const pitchRes = (theta: number) => {
      const h = solveH(theta)
      const im = this.immersion({ phi, theta, h })
      const B = toEarth(im.cx, im.cy, im.cz, this.xRef, phi, theta)
      const Ge = toEarth(G.x, G.y, G.z, this.xRef, phi, theta)
      return (B.x - Ge.x) * m * g - mPitch
    }
    const lim = 12 * DEG
    let theta = 0
    const f0 = pitchRes(-lim)
    const f1 = pitchRes(lim)
    if (f0 * f1 < 0) theta = brent(pitchRes, -lim, lim, 1e-6, 40)
    else theta = Math.abs(f0) < Math.abs(f1) ? -lim : lim
    const h = solveH(theta)
    const im = this.immersion({ phi, theta, h })
    const B = toEarth(im.cx, im.cy, im.cz, this.xRef, phi, theta)
    const Ge = toEarth(G.x, G.y, G.z, this.xRef, phi, theta)
    return { phi, theta, h, im, GZ: B.y - Ge.y, trimLimited: !(f0 * f1 < 0) }
  }

  /** Curva GZ de 0 a phiMax (grados). */
  gzCurve(phiMaxDeg = 90, stepDeg = 3) {
    const pts: {
      phi: number
      GZ: number
      RM: number
      theta: number
      h: number
      vPort: number
      vStbd: number
      vMain: number
      hulls: HullImmersion[]
    }[] = []
    const m = this.boat.mass
    for (let d = 0; d <= phiMaxDeg + 1e-9; d += stepDeg) {
      const eq = this.equilibrium(d * DEG)
      pts.push({
        phi: d,
        GZ: eq.GZ,
        RM: eq.GZ * m * g,
        theta: eq.theta / DEG,
        h: eq.h,
        hulls: eq.im.hulls,
        vMain: eq.im.hulls[0].V,
        vPort: eq.im.hulls[1].V,
        vStbd: eq.im.hulls[2].V,
      })
    }
    return pts
  }
}

export interface StabilitySummary {
  curve: ReturnType<Hydrostatics['gzCurve']>
  gm: number
  gzMax: number
  phiGzMax: number
  rmMax: number
  phiVanish: number | null
  phiPortOut: number | null
  phiStbdFull: number | null
  phiMainOut: number | null
}

export function summarizeStability(h: Hydrostatics, curve: ReturnType<Hydrostatics['gzCurve']>): StabilitySummary {
  const amaV = h.boat.amaVolume
  let gzMax = -Infinity
  let phiGzMax = 0
  for (const p of curve) {
    if (p.GZ > gzMax) {
      gzMax = p.GZ
      phiGzMax = p.phi
    }
  }
  const firstCross = (pred: (p: (typeof curve)[number]) => boolean) => {
    for (let i = 1; i < curve.length; i++) if (pred(curve[i]) && !pred(curve[i - 1])) return curve[i].phi
    return null
  }
  let phiVanish: number | null = null
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].phi > phiGzMax && curve[i].GZ <= 0 && curve[i - 1].GZ > 0) {
      const t = curve[i - 1].GZ / (curve[i - 1].GZ - curve[i].GZ)
      phiVanish = curve[i - 1].phi + t * (curve[i].phi - curve[i - 1].phi)
      break
    }
  }
  // GM inicial a partir de la pendiente en el origen (1 grado)
  const e1 = h.equilibrium(1 * DEG)
  const gm = e1.GZ / Math.sin(1 * DEG)
  return {
    curve,
    gm,
    gzMax,
    phiGzMax,
    rmMax: gzMax * h.boat.mass * g,
    phiVanish,
    phiPortOut: firstCross((p) => p.vPort <= 1e-7),
    phiStbdFull: firstCross((p) => p.vStbd >= 0.995 * amaV),
    phiMainOut: firstCross((p) => p.vMain <= 1e-7),
  }
}
