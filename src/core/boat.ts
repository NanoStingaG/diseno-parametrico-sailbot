import { makeHull, scaleShapeToVolume, hullTotalVolume, type HullBody } from './hull'
import type { Design, FoilAppendage } from './types'
import { DEG } from './math'

export interface FixedVolume {
  name: string
  V: number
  x: number
  y: number
  z: number
}

export interface FoilGeom {
  name: string
  /** puntos de la raíz y la punta del 1/4 de cuerda */
  rootX: number
  rootZ: number
  tipX: number
  tipZ: number
  rootChord: number
  tipChord: number
  span: number
  area: number
  thickness: number
  /** Profundidad del centro de presión (z) */
  zCP: number
  wetted: number
  volume: number
  cx: number
  cz: number
}

export interface BulbGeom {
  enabled: boolean
  x: number
  z: number
  length: number
  diameter: number
  volume: number
  wetted: number
  mass: number
}

export interface Boat {
  design: Design
  main: HullBody
  amaPort: HullBody
  amaStbd: HullBody
  hulls: HullBody[]
  keel: FoilGeom
  rudder: FoilGeom
  bulb: BulbGeom
  fixedVolumes: FixedVolume[]
  mass: number
  G: { x: number; y: number; z: number }
  massItems: { name: string; mass: number; x: number; y: number; z: number }[]
  deckZ: (x: number) => number
  sailDeckZ: number
  amaVolume: number
  mainVolume: number
  /** Eslora total con la vela alineada a crujía y la envolvente con la vela girando */
  loa: { aligned: number; rotating: number; xMin: number; xMax: number; xMinRot: number; xMaxRot: number }
  /** desequilibrio del conjunto vela-cola: masa total y excentricidad del CG respecto al eje (m, + hacia popa de la vela) */
  sailAssembly: { mass: number; offset: number }
}

function foilGeom(name: string, f: FoilAppendage, rootZ: number): FoilGeom {
  const tipX = f.x - f.span * Math.tan(f.sweep * DEG)
  const tipZ = rootZ - f.span
  const cm = 0.5 * (f.rootChord + f.tipChord)
  const area = cm * f.span
  // área de sección NACA 4 cifras simétrico ≈ 0.685 t c²
  const N = 20
  let V = 0
  let Vx = 0
  let Vz = 0
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N
    const c = f.rootChord + s * (f.tipChord - f.rootChord)
    const A = 0.685 * f.thickness * c * c
    const xqc = f.x + s * (tipX - f.x)
    const xc = xqc + 0.25 * c - 0.42 * c
    const z = rootZ - s * f.span
    const dV = (A * f.span) / N
    V += dV
    Vx += dV * xc
    Vz += dV * z
  }
  // centro de presión en envergadura: carga casi elíptica ≈ 0.42 de la envergadura
  const zCP = rootZ - 0.42 * f.span
  return {
    name,
    rootX: f.x,
    rootZ,
    tipX,
    tipZ,
    rootChord: f.rootChord,
    tipChord: f.tipChord,
    span: f.span,
    area,
    thickness: f.thickness,
    zCP,
    wetted: 2.04 * area,
    volume: V,
    cx: V > 0 ? Vx / V : f.x,
    cz: V > 0 ? Vz / V : rootZ,
  }
}

/** Superficie de un esferoide prolato de longitud l y diámetro d. */
export function spheroidArea(l: number, d: number) {
  const a = l / 2
  const b = d / 2
  if (a <= b + 1e-9) return 4 * Math.PI * b * b
  const e = Math.sqrt(1 - (b * b) / (a * a))
  return 2 * Math.PI * b * b * (1 + (a / (b * e)) * Math.asin(e))
}

export function buildBoat(d: Design): Boat {
  const main = makeHull('Casco central', d.hull, 0, 0, 0)
  const amaShape = d.ama.volumeMode ? scaleShapeToVolume(d.ama, d.ama.targetVolume) : d.ama
  const amaPort = makeHull('Patín babor', amaShape, d.ama.x - d.ama.L / 2, -d.ama.y, d.ama.z)
  const amaStbd = makeHull('Patín estribor', amaShape, d.ama.x - d.ama.L / 2, d.ama.y, d.ama.z)
  const hulls = [main, amaPort, amaStbd]

  const deckZ = (x: number) => {
    const xl = Math.min(Math.max(x, 0), d.hull.L)
    return main.zBase + main.keel(xl) + main.D(xl)
  }
  const bottomZ = (x: number) => {
    const xl = Math.min(Math.max(x, 0), d.hull.L)
    return main.zBase + main.keel(xl)
  }

  const keel = foilGeom('Quilla', d.keel, bottomZ(d.keel.x))
  const rudder = foilGeom('Timón', d.rudder, bottomZ(d.rudder.x))

  const bulbV = d.bulb.enabled ? (Math.PI / 6) * d.bulb.diameter ** 2 * d.bulb.length : 0
  const bulb: BulbGeom = {
    enabled: d.bulb.enabled,
    x: keel.tipX + d.bulb.dx,
    z: keel.tipZ,
    length: d.bulb.length,
    diameter: d.bulb.diameter,
    volume: bulbV,
    wetted: d.bulb.enabled ? spheroidArea(d.bulb.length, d.bulb.diameter) : 0,
    mass: d.bulb.enabled ? d.bulb.mass : 0,
  }

  const fixedVolumes: FixedVolume[] = [
    { name: 'Quilla', V: keel.volume, x: keel.cx, y: 0, z: keel.cz },
    { name: 'Timón', V: rudder.volume, x: rudder.cx, y: 0, z: rudder.cz },
  ]
  if (bulb.enabled) fixedVolumes.push({ name: 'Bulbo', V: bulb.volume, x: bulb.x, y: 0, z: bulb.z })

  const sailDeckZ = deckZ(d.sail.x)
  const sailBaseZ = sailDeckZ + d.sail.gap

  // Masas
  const items: Boat['massItems'] = []
  if (d.mass.simple) {
    items.push({ name: 'Masa total', mass: d.mass.total, ...d.mass.cg })
  } else {
    for (const it of d.mass.items) items.push({ ...it })
    items.push({ name: 'Vela', mass: d.sail.mass, x: d.sail.x, y: 0, z: sailBaseZ + d.sail.cgHeight })
    const tailZ = sailBaseZ + d.tail.height + d.tail.span / 2
    items.push({ name: 'Cola', mass: d.tail.mass, x: d.sail.x - d.tail.arm, y: 0, z: tailZ })
    if (d.tail.counterweight > 0)
      items.push({
        name: 'Contrapeso',
        mass: d.tail.counterweight,
        x: d.sail.x + d.tail.counterweightArm,
        y: 0,
        z: tailZ,
      })
    if (bulb.enabled) items.push({ name: 'Bulbo', mass: bulb.mass, x: bulb.x, y: 0, z: bulb.z })
  }
  let m = 0
  let mx = 0
  let my = 0
  let mz = 0
  for (const it of items) {
    m += it.mass
    mx += it.mass * it.x
    my += it.mass * it.y
    mz += it.mass * it.z
  }
  const G = m > 0 ? { x: mx / m, y: my / m, z: mz / m } : { x: 0, y: 0, z: 0 }

  // Conjunto vela-cola: excentricidad del CG respecto al eje, + hacia popa de la vela
  const cMean = 0.5 * (d.sail.rootChord + d.sail.tipChord)
  const wingX = (0.4 - d.sail.pivot) * cMean
  const asmMass = d.sail.mass + d.tail.mass + d.tail.counterweight
  const asmOffset =
    asmMass > 0
      ? (d.sail.mass * wingX + d.tail.mass * d.tail.arm - d.tail.counterweight * d.tail.counterweightArm) / asmMass
      : 0

  // Esloras
  const xs: number[] = [0, d.hull.L, d.ama.x - d.ama.L / 2, d.ama.x + d.ama.L / 2]
  for (const f of [keel, rudder]) {
    for (const [qx, c] of [
      [f.rootX, f.rootChord],
      [f.tipX, f.tipChord],
    ]) {
      xs.push(qx + 0.25 * c, qx - 0.75 * c)
    }
  }
  if (bulb.enabled) xs.push(bulb.x - bulb.length / 2, bulb.x + bulb.length / 2)
  const hullMin = Math.min(...xs)
  const hullMax = Math.max(...xs)
  const cMax = Math.max(d.sail.rootChord, d.sail.tipChord)
  const fwd = Math.max(d.sail.pivot * cMax, d.tail.counterweight > 0 ? d.tail.counterweightArm : 0)
  const aft = Math.max((1 - d.sail.pivot) * cMax, d.tail.arm + 0.75 * d.tail.chord)
  const R = Math.max(fwd, aft)
  const xMin = Math.min(hullMin, d.sail.x - aft)
  const xMax = Math.max(hullMax, d.sail.x + fwd)
  const xMinRot = Math.min(hullMin, d.sail.x - R)
  const xMaxRot = Math.max(hullMax, d.sail.x + R)

  return {
    design: d,
    main,
    amaPort,
    amaStbd,
    hulls,
    keel,
    rudder,
    bulb,
    fixedVolumes,
    mass: m,
    G,
    massItems: items,
    deckZ,
    sailDeckZ,
    amaVolume: hullTotalVolume(amaStbd),
    mainVolume: hullTotalVolume(main),
    loa: { aligned: xMax - xMin, rotating: xMaxRot - xMinRot, xMin, xMax, xMinRot, xMaxRot },
    sailAssembly: { mass: asmMass, offset: asmOffset },
  }
}
