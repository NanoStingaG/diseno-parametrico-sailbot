import type { Design } from './types'

/** Densidad del plomo para dimensionar el bulbo (kg/m³). */
export const LEAD_DENSITY = 11340

/**
 * Valores fijos de la versión 2: los parámetros que ya no se editan se fuerzan aquí, de modo que
 * los diseños antiguos (JSON o enlaces) se calculan igual que los nuevos.
 */
export function applyFixed(src: Design): Design {
  const d: Design = structuredClone(src)
  d.hull.symmetric = true
  d.hull.n = 2
  d.ama.symmetric = true
  d.ama.n = 2
  d.ama.volumeMode = true
  d.keel.thickness = 0.12
  d.keel.sweep = 0
  d.rudder.tipChord = d.rudder.rootChord
  d.rudder.thickness = 0.12
  d.rudder.sweep = 0
  d.bulb.dx = 0
  // diámetro del bulbo (esferoide alargado) a partir de su masa de plomo y su longitud
  const V = Math.max(d.bulb.mass, 0) / LEAD_DENSITY
  d.bulb.diameter = d.bulb.length > 0 ? Math.sqrt((6 * V) / (Math.PI * d.bulb.length)) : 0
  d.sail.gap = 0
  d.sail.sweep = 0
  d.sail.twist = 0
  d.tail.height = 0.3
  d.tail.thickness = 0.12
  d.env.gradient = true
  d.env.zRef = 10
  d.env.z0 = 0.0002
  d.env.rhoAir = 1.225
  d.env.rhoWater = 1025
  d.control.maxHeel = 20
  d.resistanceFactor = 1
  d.windageCdA = 0.04
  d.windageZ = 0.3
  d.mass.simple = false
  d.limits = { amaReserveMin: 100, maxHeelWarn: 20 }
  return d
}
