import { it, expect } from 'vitest'
import { michellCore } from '../water'

it('Michell: casco Wigley (B/L=0.1, T/L=0.0625)', () => {
  const L = 1, B = 0.1, T = 0.0625
  const f = (xl: number, d: number) => {
    const x = 2 * xl / L - 1
    if (d > T) return 0
    return (B / 2) * (1 - x * x) * (1 - (d / T) ** 2)
  }
  const S = 0.148 * L * L
  const fns = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5]
  const speeds = fns.map(fn => fn * Math.sqrt(9.81 * L))
  const t = michellCore(f, L, T, 1000, speeds)
  const cw = t.rw.map((r, i) => r / (0.5 * 1000 * speeds[i] ** 2 * S))
  console.log(fns.map((fn, i) => `Fn ${fn}: Cw=${(cw[i] * 1000).toFixed(3)}e-3`).join('\n'))
  // valores publicados de Michell para Wigley: ~1.5e-3 en Fn 0.3, ~2.5e-3 hacia Fn 0.5 (orden de magnitud)
  expect(cw[2]).toBeGreaterThan(0.5e-3)
  expect(cw[2]).toBeLessThan(3e-3)
})
