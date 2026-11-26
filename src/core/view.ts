import type { Analysis } from './solver'
import { sectionPolyline } from './hull'
import { DEG, KNOT } from './math'
import type { Design } from './types'

/** Datos planos (serializables) para dibujar y mostrar resultados. */
export interface HullView {
  name: string
  x0: number
  L: number
  yc: number
  xs: number[]
  B: number[]
  keelZ: number[]
  deckZ: number[]
  /** sección de manga máxima */
  section: number[]
  sectionX: number
}

export interface AnalysisView {
  design: Design
  hulls: HullView[]
  keel: Analysis['boat']['keel']
  rudder: Analysis['boat']['rudder']
  bulb: Analysis['boat']['bulb']
  mass: number
  G: { x: number; y: number; z: number }
  massItems: Analysis['boat']['massItems']
  loa: Analysis['boat']['loa']
  sailDeckZ: number
  sailAssembly: Analysis['boat']['sailAssembly']
  amaVolume: number
  mainVolume: number
  stability: Analysis['stability']
  upright: Analysis['upright']
  condition: Analysis['condition']
  sailCurves: Analysis['sailCurves']
  tailCurve: Analysis['tailCurve']
  capsize: Analysis['capsize']
  amaReserve: number
  warnings: Analysis['warnings']
  timings: Record<string, number>
  metrics: Record<string, number>
}

export const METRICS: { key: string; label: string; unit: string }[] = [
  { key: 'speedKn', label: 'Velocidad', unit: 'nudos' },
  { key: 'heel', label: 'Escora', unit: '°' },
  { key: 'leeway', label: 'Deriva', unit: '°' },
  { key: 'alpha', label: 'Ángulo de ataque de la vela', unit: '°' },
  { key: 'drive', label: 'Fuerza propulsora', unit: 'N' },
  { key: 'resistance', label: 'Resistencia total', unit: 'N' },
  { key: 'heelMoment', label: 'Momento escorante', unit: 'N·m' },
  { key: 'rmMax', label: 'Momento adrizante máximo', unit: 'N·m' },
  { key: 'gzMax', label: 'GZ máximo', unit: 'm' },
  { key: 'gm', label: 'GM inicial', unit: 'm' },
  { key: 'capsizeTrimmed', label: 'Viento de vuelco (vela trimada)', unit: 'm/s' },
  { key: 'capsizeFeathered', label: 'Viento de vuelco (en bandera)', unit: 'm/s' },
  { key: 'amaReserve', label: 'Reserva de flotabilidad del patín', unit: '%' },
  { key: 'amaShare', label: 'Empuje de patines en adrizado', unit: '%' },
  { key: 'mass', label: 'Desplazamiento', unit: 'kg' },
  { key: 'draft', label: 'Calado del casco central', unit: 'm' },
  { key: 'freeboard', label: 'Francobordo del casco central', unit: 'm' },
  { key: 'loa', label: 'Eslora total (vela a crujía)', unit: 'm' },
  { key: 'tailMargin', label: 'Margen de estabilidad vela-cola', unit: '% c' },
  { key: 'routeHours', label: 'Tiempo de ruta a esta velocidad', unit: 'h' },
]

function hullView(h: Analysis['boat']['main']): HullView {
  const N = 48
  const xs: number[] = []
  const B: number[] = []
  const keelZ: number[] = []
  const deckZ: number[] = []
  let bestX = h.shape.L / 2
  let bestB = -1
  for (let i = 0; i <= N; i++) {
    const xl = (i / N) * h.shape.L
    xs.push(h.x0 + xl)
    const b = h.B(xl)
    B.push(b)
    keelZ.push(h.zBase + h.keel(xl))
    deckZ.push(h.zBase + h.keel(xl) + h.D(xl))
    if (b > bestB) {
      bestB = b
      bestX = xl
    }
  }
  return {
    name: h.name,
    x0: h.x0,
    L: h.shape.L,
    yc: h.yc,
    xs,
    B,
    keelZ,
    deckZ,
    section: sectionPolyline(h, bestX),
    sectionX: h.x0 + bestX,
  }
}

export function toView(a: Analysis): AnalysisView {
  const b = a.boat
  const d = b.design
  const c = a.condition
  const metrics: Record<string, number> = {
    speedKn: c.V / KNOT,
    heel: c.phi / DEG,
    leeway: c.lambda / DEG,
    alpha: c.alpha,
    drive: c.drive,
    resistance: c.resistance.hydroTotal,
    heelMoment: c.heelMoment,
    rmMax: a.stability.rmMax,
    gzMax: a.stability.gzMax,
    gm: a.stability.gm,
    capsizeTrimmed: a.capsize.trimmed,
    capsizeFeathered: a.capsize.feathered,
    amaReserve: a.amaReserve,
    amaShare: a.upright.buoyancyShare.amas * 100,
    mass: b.mass,
    draft: a.upright.draftMain,
    freeboard: a.upright.freeboardMain,
    loa: b.loa.aligned,
    tailMargin: c.tailMargin,
    routeHours: c.V > 1e-6 ? (d.env.route * 1852) / c.V / 3600 : Infinity,
  }
  return {
    design: d,
    hulls: b.hulls.map(hullView),
    keel: b.keel,
    rudder: b.rudder,
    bulb: b.bulb,
    mass: b.mass,
    G: b.G,
    massItems: b.massItems,
    loa: b.loa,
    sailDeckZ: b.sailDeckZ,
    sailAssembly: b.sailAssembly,
    amaVolume: b.amaVolume,
    mainVolume: b.mainVolume,
    stability: a.stability,
    upright: a.upright,
    condition: c,
    sailCurves: a.sailCurves,
    tailCurve: a.tailCurve,
    capsize: a.capsize,
    amaReserve: a.amaReserve,
    warnings: a.warnings,
    timings: a.timings,
    metrics,
  }
}
