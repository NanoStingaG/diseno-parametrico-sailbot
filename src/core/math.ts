export const DEG = Math.PI / 180
export const G = 9.81
export const KNOT = 0.514444

/** Interpolación PCHIP (Fritsch-Carlson): monótona, sin oscilaciones entre nodos. */
export function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length
  const h: number[] = []
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const m: number[] = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0
    else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }
  // Extremos: fórmula de tres puntos con limitación
  const endSlope = (h0: number, h1: number, d0: number, d1: number) => {
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
    if (Math.sign(s) !== Math.sign(d0)) s = 0
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0
    return s
  }
  if (n > 2) {
    m[0] = endSlope(h[0], h[1], d[0], d[1])
    m[n - 1] = endSlope(h[n - 2], h[n - 3], d[n - 2], d[n - 3])
  } else {
    m[0] = d[0]
    m[n - 1] = d[0]
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    )
  }
}

/** Interpolación lineal en tabla ordenada. */
export function interp(xs: number[], ys: number[], x: number): number {
  const n = xs.length
  if (n === 0) return 0
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] > x) hi = mid
    else lo = mid
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo])
  return ys[lo] + t * (ys[hi] - ys[lo])
}

/** Método de Brent para raíces en [a, b] con cambio de signo. */
export function brent(f: (x: number) => number, a: number, b: number, tol = 1e-8, maxIter = 100): number {
  let fa = f(a)
  let fb = f(b)
  if (fa === 0) return a
  if (fb === 0) return b
  if (fa * fb > 0) return Math.abs(fa) < Math.abs(fb) ? a : b
  let c = a
  let fc = fa
  let d = b - a
  let e = d
  for (let iter = 0; iter < maxIter; iter++) {
    if (fb * fc > 0) {
      c = a
      fc = fa
      d = b - a
      e = d
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b
      b = c
      c = a
      fa = fb
      fb = fc
      fc = fa
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol
    const xm = 0.5 * (c - b)
    if (Math.abs(xm) <= tol1 || fb === 0) return b
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa
      let p: number
      let q: number
      if (a === c) {
        p = 2 * xm * s
        q = 1 - s
      } else {
        const qq = fa / fc
        const r = fb / fc
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1))
        q = (qq - 1) * (r - 1) * (s - 1)
      }
      if (p > 0) q = -q
      p = Math.abs(p)
      const min1 = 3 * xm * q - Math.abs(tol1 * q)
      const min2 = Math.abs(e * q)
      if (2 * p < Math.min(min1, min2)) {
        e = d
        d = p / q
      } else {
        d = xm
        e = d
      }
    } else {
      d = xm
      e = d
    }
    a = b
    fa = fb
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1
    fb = f(b)
  }
  return b
}

/** Búsqueda de sección áurea del máximo de f en [a, b]. */
export function goldenMax(f: (x: number) => number, a: number, b: number, tol = 1e-3): { x: number; f: number } {
  const gr = (Math.sqrt(5) - 1) / 2
  let c = b - gr * (b - a)
  let d = a + gr * (b - a)
  let fc = f(c)
  let fd = f(d)
  while (Math.abs(b - a) > tol) {
    if (fc > fd) {
      b = d
      d = c
      fd = fc
      c = b - gr * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + gr * (b - a)
      fd = f(d)
    }
  }
  return fc > fd ? { x: c, f: fc } : { x: d, f: fd }
}

/** Factorización LU con pivotaje parcial (in place sobre copia). */
export interface LU {
  n: number
  a: Float64Array
  piv: Int32Array
}

export function luDecompose(A: Float64Array, n: number): LU {
  const a = new Float64Array(A)
  const piv = new Int32Array(n)
  for (let i = 0; i < n; i++) piv[i] = i
  for (let k = 0; k < n; k++) {
    let p = k
    let max = Math.abs(a[k * n + k])
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k])
      if (v > max) {
        max = v
        p = i
      }
    }
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j]
        a[k * n + j] = a[p * n + j]
        a[p * n + j] = t
      }
      const t = piv[k]
      piv[k] = piv[p]
      piv[p] = t
    }
    const akk = a[k * n + k]
    if (akk === 0) continue
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= akk)
      if (f === 0) continue
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j]
    }
  }
  return { n, a, piv }
}

export function luSolve(lu: LU, b: Float64Array): Float64Array {
  const { n, a, piv } = lu
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = b[piv[i]]
  for (let i = 0; i < n; i++) {
    let s = x[i]
    for (let j = 0; j < i; j++) s -= a[i * n + j] * x[j]
    x[i] = s
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j]
    x[i] = s / a[i * n + i]
  }
  return x
}

/** Coeficiente de fricción ITTC-57. */
export function cfITTC(re: number): number {
  if (re < 1e3) re = 1e3
  const l = Math.log10(re) - 2
  return 0.075 / (l * l)
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}
