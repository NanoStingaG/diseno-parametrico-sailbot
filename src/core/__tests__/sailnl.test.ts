import { describe, it, expect } from 'vitest'
import { buildContext } from '../solver'
import { applyFixed } from '../fixed'
import { defaultDesign } from '../defaults'
import { apparentFlow } from '../wind'

describe('VLM no lineal acoplado a polares 2D', () => {
  const d = applyFixed(defaultDesign())
  const { ctx } = buildContext(d)
  const flow = apparentFlow(d.env, 1, 0, 0, ctx.freeboard)

  it('converge y es determinista (no depende de llamadas anteriores)', () => {
    const a = ctx.sail.evaluate(flow, 8, 10, 0)
    ctx.sail.evaluate(flow, 18, 0, 0)
    const b = ctx.sail.evaluate(flow, 8, 10, 0)
    expect(a.converged).toBe(true)
    expect(a.iterations).toBeLessThan(d.numeric.vlmIter)
    expect(b.CL).toBeCloseTo(a.CL, 6)
  })

  it('reproduce la pérdida: CL máximo y caída a ángulos grandes', () => {
    const cl = [4, 8, 12, 16, 22].map((a) => ctx.sail.evaluate(flow, a, 0, 0).CL)
    expect(cl[1]).toBeGreaterThan(cl[0])
    expect(cl[2]).toBeGreaterThan(cl[1] * 0.95)
    // a 22° la vela está en pérdida: menos CL que el máximo
    expect(cl[4]).toBeLessThan(Math.max(...cl))
    expect(ctx.sail.evaluate(flow, 22, 0, 0).anyStall).toBe(true)
  })

  it('en régimen lineal coincide con la pendiente 3D esperada', () => {
    const r2 = ctx.sail.evaluate(flow, 2, 0, 0)
    const r4 = ctx.sail.evaluate(flow, 4, 0, 0)
    const slope = (r4.CL - r2.CL) / ((2 * Math.PI) / 180)
    // vela de alargamiento ~4,6 con plano imagen: pendiente 3D entre 3 y 6 /rad
    expect(slope).toBeGreaterThan(3)
    expect(slope).toBeLessThan(6.5)
  })
})
