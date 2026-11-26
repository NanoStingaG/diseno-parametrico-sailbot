import { it, expect } from 'vitest'
import { defaultDesign } from '../defaults'
import { analyze } from '../solver'

it('análisis completo del diseño base', () => {
  const d = defaultDesign()
  const a = analyze(d)
  const c = a.condition
  console.log('timings', a.timings)
  console.log('V kn', (c.V / 0.5144).toFixed(2), 'heel', (c.phi * 57.3).toFixed(2), 'leeway', (c.lambda * 57.3).toFixed(2), 'alpha', c.alpha.toFixed(2), 'tail', c.tail, 'margin', c.tailMargin.toFixed(1), 'stable', c.tailStable)
  console.log('drive', c.drive.toFixed(3), 'res', c.resistance, 'sail', { Fx: c.sail.Fx, Fy: c.sail.Fy, CL: c.sail.CL, CD: c.sail.CD, zCE: c.sail.zCE, Mg: c.sail.Mgrav })
  console.log('aws', c.aws, 'awa', c.awa, 'Mh', c.heelMoment, 'pitch', c.pitch, 'capsize', a.capsize, 'reserve', a.amaReserve)
  console.log('upright', a.upright)
  console.log('warnings', a.warnings)
  console.log('tailCurve', a.tailCurve.map(p => `${p.tail}:${p.alpha.toFixed(1)}`).join(' '))
  console.log('sailCurves', a.sailCurves.map(p => `${p.alpha}:${p.CL.toFixed(2)}/${p.CD.toFixed(3)}/${p.M.toFixed(3)}`).join(' '))
  expect(c.V).toBeGreaterThan(0)
  expect(Math.abs(c.drive - c.resistance.hydroTotal)).toBeLessThan(1e-2)
})
