import { describe, it, expect } from 'vitest'
import { Foil2D } from '../foil2d'
import { nacaSymmetric } from '../profile'
import { NACA0012_XFOIL } from '../data/naca0012'
import { naca0012Xfoil, panelPolars, externalPolars } from '../polars'

const xf = (re: number, a: number) => {
  const t = NACA0012_XFOIL.find((p) => p.re === re)!
  const i = t.alpha.findIndex((x) => Math.abs(x - a) < 1e-9)
  return { cl: t.cl[i], cd: t.cd[i] }
}

describe('método de paneles 2D con capa límite', () => {
  const foil = new Foil2D(nacaSymmetric(0.12, 160), { panels: 140, ncrit: 9, iterations: 4 })

  it('flujo potencial: pendiente cercana a 2π(1 + 0,77 t/c) y cl(0) = 0', () => {
    const inv = new Foil2D(nacaSymmetric(0.12, 160), { panels: 140, ncrit: 9, iterations: 0 })
    const p0 = inv.point(0, 1e9)
    const p4 = inv.point(4, 1e9)
    expect(Math.abs(p0.cl)).toBeLessThan(1e-3)
    const slope = p4.cl / ((4 * Math.PI) / 180)
    // teoría de perfiles gruesos: 2π(1 + 0,77·0,12) ≈ 6,86 /rad (la viscosidad la reduce)
    expect(slope).toBeGreaterThan(6.0)
    expect(slope).toBeLessThan(7.2)
  })

  it('frente a XFOIL a Re 5·10⁵ y 10⁶ (α 2–10°)', () => {
    for (const re of [500000, 1000000]) {
      for (const a of [2, 4, 6, 8, 10]) {
        const p = foil.point(a, re)
        const x = xf(re, a)
        expect(Math.abs(p.cl - x.cl)).toBeLessThan(0.15 * Math.abs(x.cl) + 0.03)
        expect(p.cd).toBeGreaterThan(0.5 * x.cd)
        expect(p.cd).toBeLessThan(1.8 * x.cd)
      }
    }
  })
})

describe('conjuntos de polares', () => {
  it('tabla XFOIL: simetría, interpolación en Re y placa plana más allá de la tabla', () => {
    const s = naca0012Xfoil()
    const a = s.at(5, 1e5)
    const b = s.at(-5, 1e5)
    expect(b.cl).toBeCloseTo(-a.cl, 6)
    expect(b.cd).toBeCloseTo(a.cd, 6)
    // entre dos Reynolds de la tabla el resultado queda entre ambos
    const lo = s.at(6, 1e5).cl
    const hi = s.at(6, 1.5e5).cl
    const mid = s.at(6, 1.22e5).cl
    expect(mid).toBeGreaterThanOrEqual(Math.min(lo, hi) - 1e-9)
    expect(mid).toBeLessThanOrEqual(Math.max(lo, hi) + 1e-9)
    // a 60° domina la placa plana: cd grande
    expect(s.at(60, 1e5).cd).toBeGreaterThan(1)
    expect(s.at(60, 1e5).stalled).toBe(true)
  })

  it('polares cargadas: se ordenan por Reynolds y se interpolan', () => {
    const mk = (re: number, k: number) => ({ reynolds: re, points: [0, 2, 4, 6, 8, 10].map((a) => ({ alpha: a, cl: k * a * 0.1, cd: 0.01 + 0.001 * a })) })
    const s = externalPolars([mk(2e5, 1.0), mk(5e4, 0.8)])
    expect(s.at(4, 5e4).cl).toBeCloseTo(0.32, 3)
    expect(s.at(4, 2e5).cl).toBeCloseTo(0.4, 3)
    const m = s.at(4, 1e5).cl
    expect(m).toBeGreaterThan(0.32)
    expect(m).toBeLessThan(0.4)
  })

  it('polar de paneles de un perfil simétrico: cl impar en α', () => {
    const s = panelPolars(nacaSymmetric(0.12, 160), 'NACA 0012', { panels: 100, ncrit: 9, iterations: 2 })
    expect(s.at(-4, 2e5).cl).toBeCloseTo(-s.at(4, 2e5).cl, 4)
    expect(s.at(4, 2e5).cl).toBeGreaterThan(0.3)
  })
})
