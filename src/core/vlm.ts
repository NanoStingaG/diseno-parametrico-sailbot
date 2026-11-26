import { luDecompose, luSolve, type LU } from './math'

/**
 * Vortex Lattice plano. Las superficies están en el plano y = 0 del sistema de la vela:
 * x a lo largo de la cuerda (hacia el borde de salida), y normal, z en envergadura.
 * Cada panel lleva un vórtice de herradura en su 1/4 de cuerda con estelas rectas hacia +x
 * y un punto de control en su 3/4 de cuerda. Opcionalmente, un plano imagen horizontal z = zImage.
 */
export interface Panel {
  surface: number
  strip: number
  ax: number
  az: number
  bx: number
  bz: number
  cx: number
  cz: number
  /** punto medio del vórtice ligado */
  mx: number
  mz: number
  chord: number
  dz: number
}

export interface Strip {
  surface: number
  /** cuerda local, posición del 1/4 de cuerda y z del centro */
  chord: number
  xqc: number
  z: number
  dz: number
  z0: number
  z1: number
  panels: number[]
}

export interface Surface {
  name: string
  /** Borde de ataque en la raíz y la punta (x), z de raíz y punta, cuerdas */
  xLeRoot: number
  xLeTip: number
  zRoot: number
  zTip: number
  cRoot: number
  cTip: number
  nSpan: number
  nChord: number
}

const FAR = 1e4
const CORE = 1e-9

function segVel(px: number, py: number, pz: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  const r1x = px - x1
  const r1y = py - y1
  const r1z = pz - z1
  const r2x = px - x2
  const r2y = py - y2
  const r2z = pz - z2
  const cx = r1y * r2z - r1z * r2y
  const cy = r1z * r2x - r1x * r2z
  const cz = r1x * r2y - r1y * r2x
  const c2 = cx * cx + cy * cy + cz * cz
  const r1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z)
  const r2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z)
  if (r1 < CORE || r2 < CORE || c2 < CORE * CORE) return [0, 0, 0]
  const r0x = x2 - x1
  const r0y = y2 - y1
  const r0z = z2 - z1
  const k = (r0x * (r1x / r1 - r2x / r2) + r0y * (r1y / r1 - r2y / r2) + r0z * (r1z / r1 - r2z / r2)) / (4 * Math.PI * c2)
  return [k * cx, k * cy, k * cz]
}

/** Velocidad normal (y) en (px,0,pz) inducida por una herradura de Γ = 1 de A a B. */
function horseshoeVy(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const v1 = segVel(px, 0, pz, ax + FAR, 0, az, ax, 0, az)
  const v2 = segVel(px, 0, pz, ax, 0, az, bx, 0, bz)
  const v3 = segVel(px, 0, pz, bx, 0, bz, bx + FAR, 0, bz)
  return v1[1] + v2[1] + v3[1]
}

export class VLM {
  panels: Panel[] = []
  strips: Strip[] = []
  surfaces: Surface[]
  zImage: number | null
  lu: LU
  /** Malla común de Trefftz: segmentos [segZ0, segZ1], franjas que los cubren y matriz de influencia */
  segZ0!: Float64Array
  segZ1!: Float64Array
  segStrips!: number[][]
  trefftz: Float64Array

  constructor(surfaces: Surface[], zImage: number | null) {
    this.surfaces = surfaces
    this.zImage = zImage
    surfaces.forEach((s, si) => {
      for (let j = 0; j < s.nSpan; j++) {
        // distribución en coseno en envergadura para resolver mejor la punta
        const t0 = 0.5 * (1 - Math.cos((Math.PI * j) / s.nSpan))
        const t1 = 0.5 * (1 - Math.cos((Math.PI * (j + 1)) / s.nSpan))
        const z0 = s.zRoot + t0 * (s.zTip - s.zRoot)
        const z1 = s.zRoot + t1 * (s.zTip - s.zRoot)
        const le0 = s.xLeRoot + t0 * (s.xLeTip - s.xLeRoot)
        const le1 = s.xLeRoot + t1 * (s.xLeTip - s.xLeRoot)
        const c0 = s.cRoot + t0 * (s.cTip - s.cRoot)
        const c1 = s.cRoot + t1 * (s.cTip - s.cRoot)
        const tm = 0.5 * (t0 + t1)
        const cm = s.cRoot + tm * (s.cTip - s.cRoot)
        const lem = s.xLeRoot + tm * (s.xLeTip - s.xLeRoot)
        const strip: Strip = {
          surface: si,
          chord: cm,
          xqc: lem + 0.25 * cm,
          z: 0.5 * (z0 + z1),
          dz: z1 - z0,
          z0,
          z1,
          panels: [],
        }
        for (let i = 0; i < s.nChord; i++) {
          const f0 = i / s.nChord
          const f1 = (i + 1) / s.nChord
          const ax = le0 + (f0 + 0.25 * (f1 - f0)) * c0
          const bx = le1 + (f0 + 0.25 * (f1 - f0)) * c1
          const cxp = lem + (f0 + 0.75 * (f1 - f0)) * cm
          strip.panels.push(this.panels.length)
          this.panels.push({
            surface: si,
            strip: this.strips.length,
            ax,
            az: z0,
            bx,
            bz: z1,
            cx: cxp,
            cz: 0.5 * (z0 + z1),
            mx: 0.5 * (ax + bx),
            mz: 0.5 * (z0 + z1),
            chord: cm / s.nChord,
            dz: z1 - z0,
          })
        }
        this.strips.push(strip)
      }
    })
    const n = this.panels.length
    const A = new Float64Array(n * n)
    for (let i = 0; i < n; i++) {
      const p = this.panels[i]
      for (let j = 0; j < n; j++) {
        const q = this.panels[j]
        let v = horseshoeVy(p.cx, p.cz, q.ax, q.az, q.bx, q.bz)
        if (zImage !== null) {
          // imagen: A' = espejo(B), B' = espejo(A)
          v += horseshoeVy(p.cx, p.cz, q.bx, 2 * zImage - q.bz, q.ax, 2 * zImage - q.az)
        }
        A[i * n + j] = v
      }
    }
    this.lu = luDecompose(A, n)
    // Trefftz: todas las superficies están en el mismo plano, así que sus estelas se superponen
    // en una única línea. Se fusionan los bordes de todas las franjas en una malla común y se
    // calcula la lámina neta, para evitar singularidades cuando una estela cae sobre otra franja.
    const edges: number[] = []
    for (const st of this.strips) edges.push(Math.min(st.z0, st.z1), Math.max(st.z0, st.z1))
    edges.sort((a, b) => a - b)
    const nodes: number[] = []
    for (const e of edges) if (!nodes.length || e - nodes[nodes.length - 1] > 1e-7) nodes.push(e)
    const nseg = Math.max(0, nodes.length - 1)
    this.segZ0 = new Float64Array(nseg)
    this.segZ1 = new Float64Array(nseg)
    for (let k = 0; k < nseg; k++) {
      this.segZ0[k] = nodes[k]
      this.segZ1[k] = nodes[k + 1]
    }
    // franjas que cubren cada segmento
    this.segStrips = []
    for (let k = 0; k < nseg; k++) {
      const zm = 0.5 * (nodes[k] + nodes[k + 1])
      const list: number[] = []
      this.strips.forEach((st, si) => {
        if (zm > Math.min(st.z0, st.z1) && zm < Math.max(st.z0, st.z1)) list.push(si)
      })
      this.segStrips.push(list)
    }
    const w2d = (z: number, za: number, zb: number) => (1 / (z - za) - 1 / (z - zb)) / (2 * Math.PI)
    this.trefftz = new Float64Array(nseg * nseg)
    for (let k = 0; k < nseg; k++) {
      const z = 0.5 * (nodes[k] + nodes[k + 1])
      for (let j = 0; j < nseg; j++) {
        let w = w2d(z, nodes[j], nodes[j + 1])
        if (zImage !== null) w += w2d(z, 2 * zImage - nodes[j + 1], 2 * zImage - nodes[j])
        this.trefftz[k * nseg + j] = w
      }
    }
  }

  /** Resuelve Γ para un término independiente rhs (velocidad normal a anular). */
  solve(rhs: Float64Array): Float64Array {
    return luSolve(this.lu, rhs)
  }

  /** Resistencia inducida en el plano de Trefftz (N) para densidad rho. */
  inducedDrag(gamma: Float64Array, rho: number): number {
    const nseg = this.segZ0.length
    const Gs = new Float64Array(this.strips.length)
    this.strips.forEach((st, si) => {
      for (const k of st.panels) Gs[si] += gamma[k]
    })
    const G = new Float64Array(nseg)
    for (let k = 0; k < nseg; k++) for (const si of this.segStrips[k]) G[k] += Gs[si]
    let S = 0
    for (let k = 0; k < nseg; k++) {
      let w = 0
      for (let j = 0; j < nseg; j++) w += this.trefftz[k * nseg + j] * G[j]
      S += G[k] * w * (this.segZ1[k] - this.segZ0[k])
    }
    return 0.5 * rho * S
  }

}
