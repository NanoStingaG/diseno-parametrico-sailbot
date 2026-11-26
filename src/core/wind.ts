import type { EnvParams } from './types'
import { DEG } from './math'
import type { LocalFlow } from './sail'

/** Viento real a una altura z sobre el agua (m/s), ley logarítmica. */
export function trueWindAt(env: EnvParams, z: number): number {
  if (!env.gradient) return env.tws
  const zz = Math.max(z, Math.max(0.05, env.z0 * 10))
  return (env.tws * Math.log(zz / env.z0)) / Math.log(env.zRef / env.z0)
}

/**
 * Perfil de flujo de aire relativo al barco en ejes del barco, para alturas sobre cubierta.
 * Viento por babor. V: velocidad del barco (m/s), lambda: deriva (rad, hacia estribor),
 * phi: escora (rad), freeboard: altura de cubierta sobre el agua en el palo (m).
 */
export function apparentFlow(env: EnvParams, V: number, lambda: number, phi: number, freeboard: number) {
  const twa = env.twa * DEG
  const cp = Math.cos(phi)
  return (zDeck: number): LocalFlow => {
    const zw = Math.max(0.05, (freeboard + zDeck) * cp)
    const vt = trueWindAt(env, zw)
    const ax = -vt * Math.cos(twa) - V * Math.cos(lambda)
    const ay = vt * Math.sin(twa) - V * Math.sin(lambda)
    const ayb = ay * cp
    return { U: Math.hypot(ax, ayb), psi: Math.atan2(ayb, ax) }
  }
}

/** Ángulo y velocidad del viento aparente en el plano horizontal (para mostrar). */
export function apparentWind(env: EnvParams, V: number, lambda: number, z: number) {
  const twa = env.twa * DEG
  const vt = trueWindAt(env, z)
  const fx = vt * Math.cos(twa) + V * Math.cos(lambda)
  const fy = vt * Math.sin(twa) - V * Math.sin(lambda)
  return { aws: Math.hypot(fx, fy), awa: Math.atan2(fy, fx) / DEG }
}
