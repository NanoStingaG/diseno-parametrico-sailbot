import { describe, it, expect } from 'vitest'
import { VLM, type Surface } from '../vlm'

function wingCL(surfs: Surface[], zImage: number | null, alphaDeg: number, area: number) {
  const v = new VLM(surfs, zImage)
  const a = alphaDeg * Math.PI / 180
  const rhs = new Float64Array(v.panels.length).fill(-Math.sin(a))
  const g = v.solve(rhs)
  let L = 0
  v.panels.forEach((p, i) => { L += g[i] * p.dz })
  const Di = v.inducedDrag(g, 1)
  const CL = L / (0.5 * area)
  const CDi = Di / (0.5 * area)
  return { CL, CDi, g, v }
}

describe('VLM', () => {
  it('ala rectangular AR 6', () => {
    const s: Surface = { name: 'w', xLeRoot: 0, xLeTip: 0, zRoot: -3, zTip: 3, cRoot: 1, cTip: 1, nSpan: 30, nChord: 6 }
    const r = wingCL([s], null, 5, 6)
    const cla = r.CL / (5 * Math.PI / 180)
    const e = r.CL * r.CL / (Math.PI * 6 * r.CDi)
    console.log('AR6 CLa', cla, 'CL', r.CL, 'CDi', r.CDi, 'e', e)
    expect(Math.abs(cla)).toBeGreaterThan(4.0)
    expect(Math.abs(cla)).toBeLessThan(4.7)
    expect(e).toBeGreaterThan(0.85)
    expect(e).toBeLessThan(1.03)
  })
  it('semiala con imagen = ala completa', () => {
    const full: Surface = { name: 'w', xLeRoot: 0, xLeTip: 0, zRoot: -3, zTip: 3, cRoot: 1, cTip: 1, nSpan: 40, nChord: 6 }
    const half: Surface = { name: 'w', xLeRoot: 0, xLeTip: 0, zRoot: 0, zTip: 3, cRoot: 1, cTip: 1, nSpan: 20, nChord: 6 }
    const a = wingCL([full], null, 5, 6)
    const b = wingCL([half], 0, 5, 3)
    console.log('full', a.CL, a.CDi, 'half+image', b.CL, b.CDi)
    expect(b.CL).toBeCloseTo(a.CL, 2)
  })
  it('ala elíptica aproximada: e cercano a 1', () => {
    // ala trapecial con estrechamiento 0.4 (casi elíptica)
    const s: Surface = { name: 'w', xLeRoot: 0, xLeTip: 0.15, zRoot: 0, zTip: 4, cRoot: 1, cTip: 0.4, nSpan: 30, nChord: 6 }
    const r = wingCL([s], 0, 4, 4 * 0.7)
    const AR = 64 / (2 * 4 * 0.7)
    const e = r.CL * r.CL / (Math.PI * AR * r.CDi)
    console.log('taper0.4 AR', AR, 'CL', r.CL, 'e', e)
    expect(e).toBeGreaterThan(0.95)
  })
})
