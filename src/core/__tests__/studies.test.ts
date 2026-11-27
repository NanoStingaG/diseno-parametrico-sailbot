import { describe, it, expect } from 'vitest'
import { defaultDesign } from '../defaults'
import { evaluateDesign, optimize, sensitivity, speedPolar, type OptSettings } from '../studies'
import { analyze } from '../solver'

describe('estudios', () => {
  const d = defaultDesign()

  it('brazos escorantes: la racha escora más que el viento actual y en bandera menos', () => {
    const a = analyze(d)
    const ha = a.heelArms!
    const get = (k: string) => ha.cases.find((c) => c.key === k)!
    const act = get('actual')
    expect(act.phiEq).not.toBeNull()
    // el equilibrio de la curva de brazos coincide con la escora del VPP (±1,5°)
    expect(Math.abs((act.phiEq as number) - Math.abs(a.condition.phi) * (180 / Math.PI))).toBeLessThan(1.5)
    const gust = get('gust')
    if (gust.phiEq !== null) expect(gust.phiEq).toBeGreaterThan(act.phiEq as number)
    expect(get('feather').phiEq as number).toBeLessThanOrEqual(act.phiEq as number)
    expect(act.residualMax).toBeGreaterThan(0)
  }, 60000)

  it('polar de velocidades: velocidad positiva en través', () => {
    const p = speedPolar(d, d.env.tws)
    const beam = p.points.find((q) => q.twa === 90)!
    expect(beam.kn).toBeGreaterThan(0.5)
    expect(p.points.length).toBe(11)
  }, 60000)

  it('sensibilidad: más altura de vela da menos viento de vuelco', () => {
    const s = sensitivity(d, [{ path: 'sail.height', label: 'Altura' }], 0.1)
    expect(s.rows[0].capsizePlus).toBeLessThan(0)
    expect(s.rows[0].capsizeMinus).toBeGreaterThan(0)
  }, 60000)

  it('optimizador: el mejor no es peor que la base y respeta los rangos', () => {
    const settings: OptSettings = {
      variables: [{ path: 'sail.height', label: 'Altura', min: 1.0, max: 1.8 }],
      objective: 'speed',
      conditions: [],
      constraints: { maxHeel: 20, minCapsize: 8, minAmaReserve: 100, minTailMargin: 0 },
      maxEvals: 10,
    }
    const base = evaluateDesign(d, settings)
    const r = optimize(d, settings)
    expect(r.best).not.toBeNull()
    expect(r.best!.eval.score).toBeGreaterThanOrEqual(base.score - 1e-9)
    expect(r.best!.values[0]).toBeGreaterThanOrEqual(1.0)
    expect(r.best!.values[0]).toBeLessThanOrEqual(1.8)
    expect(r.evals).toBeLessThanOrEqual(10 + 2)
  }, 120000)
})
