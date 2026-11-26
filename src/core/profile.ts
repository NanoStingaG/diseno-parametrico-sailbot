import type { Polar2D } from './types'

/** Coordenadas de un NACA 00xx (contorno cerrado, formato Selig). */
export function nacaSymmetric(t: number, n = 60): { x: number; y: number }[] {
  const yt = (x: number) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)
  const pts: { x: number; y: number }[] = []
  for (let i = n; i >= 0; i--) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / n))
    pts.push({ x, y: yt(x) })
  }
  for (let i = 1; i <= n; i++) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / n))
    pts.push({ x, y: -yt(x) })
  }
  return pts
}

/** Lee un fichero de coordenadas Selig o Lednicer. Devuelve nombre, puntos y espesor relativo. */
export function parseSelig(text: string): { name: string; points: { x: number; y: number }[]; thickness: number } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length < 5) return null
  let name = ''
  const pts: { x: number; y: number }[] = []
  for (const l of lines) {
    const parts = l.split(/[\s,;]+/).map(Number)
    if (parts.length >= 2 && parts.slice(0, 2).every(Number.isFinite)) {
      // Lednicer: primera línea numérica son los recuentos (> 1)
      if (pts.length === 0 && parts[0] > 1.5 && parts[1] > 1.5) continue
      pts.push({ x: parts[0], y: parts[1] })
    } else if (!name && pts.length === 0) name = l
  }
  if (pts.length < 5) return null
  // normalizar cuerda
  const xmin = Math.min(...pts.map((p) => p.x))
  const xmax = Math.max(...pts.map((p) => p.x))
  const c = xmax - xmin
  if (c <= 0) return null
  const norm = pts.map((p) => ({ x: (p.x - xmin) / c, y: p.y / c }))
  // espesor: máxima distancia vertical entre extradós e intradós por bandas de x
  let tmax = 0
  for (let k = 1; k < 100; k++) {
    const x = k / 100
    const ys = norm.filter((p) => Math.abs(p.x - x) < 0.02).map((p) => p.y)
    if (ys.length >= 2) tmax = Math.max(tmax, Math.max(...ys) - Math.min(...ys))
  }
  return { name, points: norm, thickness: tmax > 0 ? tmax : 0.12 }
}

/** Lee una polar en CSV o en el formato de salida de XFOIL: columnas alfa (grados), cl, cd. */
export function parsePolarCsv(text: string): Polar2D | null {
  const lines = text.split(/\r?\n/)
  const pts: { alpha: number; cl: number; cd: number }[] = []
  let iA = 0
  let iCl = 1
  let iCd = 2
  let re: number | undefined
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    const mRe = l.match(/Re\s*=\s*([\d.]+)\s*e\s*([\d]+)/i)
    if (mRe) re = Number(mRe[1]) * 10 ** Number(mRe[2])
    const cols = l.split(/[\s,;]+/)
    const lower = cols.map((c) => c.toLowerCase())
    if (lower.includes('cl') && lower.includes('cd')) {
      iA = lower.findIndex((c) => c.startsWith('alpha') || c === 'a' || c === 'aoa')
      if (iA < 0) iA = 0
      iCl = lower.indexOf('cl')
      iCd = lower.indexOf('cd')
      continue
    }
    const nums = cols.map((c) => Number(c.replace(',', '.')))
    if (nums.length > Math.max(iA, iCl, iCd) && [nums[iA], nums[iCl], nums[iCd]].every(Number.isFinite)) {
      pts.push({ alpha: nums[iA], cl: nums[iCl], cd: nums[iCd] })
    }
  }
  if (pts.length < 3) return null
  pts.sort((a, b) => a.alpha - b.alpha)
  return { points: pts, reynolds: re }
}
