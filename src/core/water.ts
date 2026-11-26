import type { Boat, FoilGeom } from './boat'
import type { HullBody } from './hull'
import { cfITTC, G as g, interp } from './math'

/** Pendiente de sustentación de un ala de alargamiento bajo (Helmbold), por rad. */
export function helmbold(ar: number): number {
  return (2 * Math.PI * ar) / (2 + Math.sqrt(ar * ar + 4))
}

/** Factor de forma de perfil (Hoerner). */
export function foilFormFactor(tc: number) {
  return 1 + 2 * tc + 60 * tc ** 4
}

/** Factor de forma de cuerpo esbelto (Hoerner), d/L diámetro equivalente / eslora. */
export function bodyFormFactor(dl: number) {
  return 1 + 1.5 * dl ** 1.5 + 7 * dl ** 3
}

export interface FoilLift {
  name: string
  area: number
  ar: number
  slope: number
  zCP: number
  xCP: number
}

function foilLift(f: FoilGeom): FoilLift {
  // casco como plano imagen: alargamiento efectivo doble
  const ar = (2 * f.span * f.span) / Math.max(f.area, 1e-9)
  const xr = f.rootX
  const xt = f.tipX
  return {
    name: f.name,
    area: f.area,
    ar,
    slope: helmbold(ar),
    zCP: f.zCP,
    xCP: xr + 0.42 * (xt - xr),
  }
}

export interface SideForceModel {
  keel: FoilLift
  rudder: FoilLift
  hull: { area: number; slope: number; zCP: number; xCP: number }
  downwash: number
  e: number
}

export function sideForceModel(boat: Boat, mainDraft: number, mainLwl: number, waterZ: number): SideForceModel {
  const keel = foilLift(boat.keel)
  const rudder = foilLift(boat.rudder)
  const downwash = Math.min(0.6, (2 * keel.slope) / (Math.PI * keel.ar))
  const L = Math.max(mainLwl, 0.1)
  const T = Math.max(mainDraft, 0.005)
  return {
    keel,
    rudder,
    // teoría de cuerpo esbelto: CLα = π AR / 2 con AR = 2T/L, área L·T
    hull: { area: L * T, slope: (Math.PI * T) / L, zCP: waterZ - 0.5 * T, xCP: boat.design.hull.L / 2 },
    downwash,
    e: 0.9,
  }
}

/**
 * Fuerza lateral del agua (N, hacia barlovento) y su centro, para deriva lambda (rad),
 * escora phi y velocidad V.
 */
export function hydroSide(m: SideForceModel, rho: number, V: number, lambda: number, phi: number) {
  const q = 0.5 * rho * V * V
  const ak = Math.atan(Math.tan(lambda) * Math.cos(phi))
  const ar = ak * (1 - m.downwash)
  const Lk = q * m.keel.area * m.keel.slope * ak
  const Lr = q * m.rudder.area * m.rudder.slope * ar
  const Lh = q * m.hull.area * m.hull.slope * ak
  const F = Lk + Lr + Lh
  const zCLR = F !== 0 ? (Lk * m.keel.zCP + Lr * m.rudder.zCP + Lh * m.hull.zCP) / F : m.keel.zCP
  const xCLR = F !== 0 ? (Lk * m.keel.xCP + Lr * m.rudder.xCP + Lh * m.hull.xCP) / F : m.keel.xCP
  const Dik = q > 0 ? (Lk * Lk) / (q * Math.PI * m.keel.ar * m.e * m.keel.area) : 0
  const Dir = q > 0 ? (Lr * Lr) / (q * Math.PI * m.rudder.ar * m.e * m.rudder.area) : 0
  return { F, Lk, Lr, Lh, zCLR, xCLR, Di: Dik + Dir, ak }
}

/** Deriva necesaria para una fuerza lateral F (N). */
export function leewayFor(m: SideForceModel, rho: number, V: number, F: number, phi: number) {
  const q = 0.5 * rho * V * V
  const k = q * (m.keel.area * m.keel.slope + m.rudder.area * m.rudder.slope * (1 - m.downwash) + m.hull.area * m.hull.slope)
  if (k <= 1e-12) return Math.PI / 4
  const ak = F / k
  const c = Math.max(Math.cos(phi), 0.05)
  return Math.atan(Math.tan(Math.max(-1.2, Math.min(1.2, ak))) / c)
}

// ---------- Resistencia por olas: integral de Michell ----------

export interface MichellTable {
  speeds: number[]
  rw: number[]
}

/**
 * Resistencia por olas de un casco esbelto con la integral de Michell, para su flotación
 * en adrizado (nivel de agua waterZ en ejes del barco).
 */
export function michellTable(h: HullBody, waterZ: number, rho: number, speeds: number[]): MichellTable {
  const L = h.shape.L
  let Tmax = 0
  for (let i = 0; i <= 200; i++) {
    const xl = (i / 200) * L
    const zk = h.zBase + h.keel(xl)
    Tmax = Math.max(Tmax, waterZ - zk)
  }
  const halfBreadth = (xl: number, depth: number) => {
    const z = waterZ - depth
    const zk = h.zBase + h.keel(xl)
    const zeta = z - zk
    if (zeta <= 0) return 0
    const b = h.B(xl) / 2
    const T = h.T(xl)
    if (T <= 1e-9 || zeta >= T) return b
    const w = (T - zeta) / T
    const n = Math.max(0.5, h.shape.n)
    return b * Math.pow(Math.max(0, 1 - Math.pow(w, n)), 1 / n)
  }
  return michellCore(halfBreadth, L, Tmax, rho, speeds)
}

/** Integral de Michell para una semimanga f(x, profundidad), x de 0 a L. */
export function michellCore(
  halfBreadth: (xl: number, depth: number) => number,
  L: number,
  Tmax: number,
  rho: number,
  speeds: number[],
): MichellTable {
  const NX = 240
  const NZ = 10
  const dx = L / NX
  if (Tmax <= 1e-6) return { speeds, rw: speeds.map(() => 0) }
  const dz = Tmax / NZ
  // fx[i][k] = ∂f/∂x en x_i, profundidad z_k
  const xs: number[] = []
  const fx: Float64Array[] = []
  for (let i = 0; i < NX; i++) {
    const xl = (i + 0.5) * dx
    xs.push(xl - L / 2)
    const row = new Float64Array(NZ)
    for (let k = 0; k < NZ; k++) {
      const depth = (k + 0.5) * dz
      row[k] = (halfBreadth(xl + dx / 2, depth) - halfBreadth(xl - dx / 2, depth)) / dx
    }
    fx.push(row)
  }
  const rw = speeds.map((U) => {
    const fn = U / Math.sqrt(g * L)
    if (fn < 0.08) return 0
    const k0 = g / (U * U)
    const lmax = Math.min(40, Math.max(3, Math.sqrt(12 / (k0 * Math.max(Tmax * 0.15, 1e-3)))))
    const tmax = Math.acosh(lmax)
    const NT = 240
    const dt = tmax / NT
    let sum = 0
    for (let j = 0; j <= NT; j++) {
      const t = j * dt
      const lam = Math.cosh(t)
      const w = j === 0 || j === NT ? 0.5 : 1
      let P = 0
      let Q = 0
      const decay: number[] = []
      for (let k = 0; k < NZ; k++) decay.push(Math.exp(-lam * lam * k0 * (k + 0.5) * dz))
      const kx = lam * k0
      for (let i = 0; i < NX; i++) {
        const row = fx[i]
        let s = 0
        for (let k = 0; k < NZ; k++) s += row[k] * decay[k]
        if (s === 0) continue
        s *= dz * dx
        P += s * Math.cos(kx * xs[i])
        Q += s * Math.sin(kx * xs[i])
      }
      sum += w * (P * P + Q * Q) * lam * lam * dt
    }
    // dos lados del casco: el integrando usa la semimanga f; el factor 4ρg²/(πU²) es para el casco completo
    return ((4 * rho * g * g) / (Math.PI * U * U)) * sum
  })
  return { speeds, rw }
}

export interface HullState {
  V: number
  wetted: number
  lwl: number
  aMax: number
}

export interface ResistanceBreakdown {
  total: number
  friction: number
  wave: number
  appendages: number
  induced: number
  windage: number
  hulls: { name: string; friction: number; wave: number; wetted: number }[]
}

/**
 * Resistencia hidrodinámica al avance (N) a velocidad V con el estado de inmersión de cada casco.
 * waveTables: Michell en adrizado; se escala con (volumen actual / volumen en adrizado)².
 */
export function resistance(
  boat: Boat,
  V: number,
  states: HullState[],
  upright: HullState[],
  waveTables: MichellTable[],
  inducedDrag: number,
): Omit<ResistanceBreakdown, 'windage' | 'total'> & { hydroTotal: number } {
  const d = boat.design
  const rho = d.env.rhoWater
  const nu = d.env.nuWater
  const q = 0.5 * rho * V * V
  let friction = 0
  let wave = 0
  const hulls: ResistanceBreakdown['hulls'] = []
  states.forEach((s, i) => {
    if (s.V <= 1e-9 || s.wetted <= 0) {
      hulls.push({ name: boat.hulls[i].name, friction: 0, wave: 0, wetted: 0 })
      return
    }
    const re = (V * s.lwl) / nu
    const deq = Math.sqrt((8 * s.aMax) / Math.PI)
    const ff = bodyFormFactor(deq / Math.max(s.lwl, 1e-3))
    const rf = q * s.wetted * cfITTC(re) * ff
    const ratio = upright[i].V > 1e-9 ? s.V / upright[i].V : 0
    const rw = interp(waveTables[i].speeds, waveTables[i].rw, V) * ratio * ratio
    friction += rf
    wave += rw
    hulls.push({ name: boat.hulls[i].name, friction: rf, wave: rw, wetted: s.wetted })
  })
  let app = 0
  for (const f of [boat.keel, boat.rudder]) {
    const c = 0.5 * (f.rootChord + f.tipChord)
    app += q * f.wetted * cfITTC((V * c) / nu) * foilFormFactor(f.thickness)
  }
  if (boat.bulb.enabled) {
    const b = boat.bulb
    app += q * b.wetted * cfITTC((V * b.length) / nu) * bodyFormFactor(b.diameter / b.length)
  }
  const k = d.resistanceFactor
  return {
    friction: friction * k,
    wave: wave * k,
    appendages: app * k,
    induced: inducedDrag * k,
    hulls,
    hydroTotal: (friction + wave + app + inducedDrag) * k,
  }
}
