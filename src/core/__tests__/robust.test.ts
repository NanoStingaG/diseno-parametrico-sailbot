import { it, expect } from 'vitest'
import { defaultDesign } from '../defaults'
import { analyze } from '../solver'

it('robustez en varias condiciones y modos', () => {
  const rows: string[] = []
  for (const mode of ['tail', 'alpha', 'optimize'] as const) {
    for (const twa of [45, 90, 135, 170]) {
      for (const tws of [2, 6, 12]) {
        const d = defaultDesign()
        d.control.mode = mode
        d.env.twa = twa
        d.env.tws = tws
        const t = performance.now()
        const a = analyze(d, { fast: true, skipCurves: true })
        const c = a.condition
        rows.push(`${mode} twa${twa} tws${tws}: V=${(c.V / 0.5144).toFixed(2)}kn heel=${(c.phi * 57.3).toFixed(1)} lee=${(c.lambda * 57.3).toFixed(1)} a=${c.alpha.toFixed(1)} tail=${Number(c.tail).toFixed(1)} res=${(c.drive - c.resistance.hydroTotal).toFixed(4)} cap=${c.capsized} np=${c.noProgress} ${(performance.now() - t).toFixed(0)}ms`)
        expect(Number.isFinite(c.V)).toBe(true)
      }
    }
  }
  console.log(rows.join('\n'))
}, 120000)
