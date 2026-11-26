import { describe, it, expect } from 'vitest'
import { defaultDesign } from '../defaults'
import { buildBoat } from '../boat'
import { Hydrostatics, summarizeStability } from '../hydrostatics'
import { makeHull, hullTotalVolume } from '../hull'

describe('hidrostática', () => {
  it('volumen de casco de sección rectangular (n grande) y semielíptica', () => {
    // casco elíptico en planta con sección semicircular: comparar con integración analítica aproximada
    const shape = { L: 2, B: { q1: 0.2, q2: 0.2, q3: 0.2 }, T: { q1: 0.1, q2: 0.1, q3: 0.1 }, D: { q1: 0.1, q2: 0.1, q3: 0.1 }, n: 2, symmetric: true }
    const h = makeHull('t', shape, 0, 0, 0)
    // en L/4..3L/4 la sección es semielipse de semiejes 0.1 y 0.1: área pi*0.1*0.1/2
    const V = hullTotalVolume(h, 400)
    expect(V).toBeGreaterThan(0)
    // volumen entre L/4 y 3L/4 exacto = 1 * pi*0.01/2 = 0.0157; total debe ser mayor y menor que 2*0.0157
    expect(V).toBeGreaterThan(0.0157)
    expect(V).toBeLessThan(0.0314)
  })
  it('equilibrio del diseño base', () => {
    const d = defaultDesign()
    const boat = buildBoat(d)
    const hs = new Hydrostatics(boat)
    const eq = hs.equilibrium(0)
    console.log('masa', boat.mass, 'G', boat.G, 'h', eq.h, 'theta', eq.theta * 57.3, 'V', eq.im.V, eq.im.hulls.map(h => [h.name, h.V.toFixed(5), h.wetted.toFixed(3), h.lwl.toFixed(2)]))
    expect(eq.im.V * 1025).toBeCloseTo(boat.mass, 2)
    expect(Math.abs(eq.GZ)).toBeLessThan(1e-4)
    const t0 = performance.now()
    const curve = hs.gzCurve(90, 3)
    const s = summarizeStability(hs, curve)
    console.log('gz curve ms', performance.now() - t0)
    console.log(curve.map(p => `${p.phi} ${p.GZ.toFixed(3)} th=${p.theta.toFixed(1)} port=${p.vPort.toFixed(4)} stbd=${p.vStbd.toFixed(4)}`).join('\n'))
    console.log({ gm: s.gm, gzMax: s.gzMax, phiGzMax: s.phiGzMax, phiVanish: s.phiVanish, port: s.phiPortOut, stbd: s.phiStbdFull, main: s.phiMainOut, amaV: boat.amaVolume, loa: boat.loa })
  })
})
