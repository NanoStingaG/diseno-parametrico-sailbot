import { defaultDesign } from '../core/defaults'
import type { Design } from '../core/types'

function merge<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over) || base === null || typeof base !== 'object' || Array.isArray(base))
    return (over === undefined ? base : (over as T))
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = k in out ? merge(out[k], v) : v
  }
  return out as T
}

/** Completa un diseño cargado con los valores por defecto (compatibilidad entre versiones). */
export function normalizeDesign(raw: unknown): Design {
  return merge(defaultDesign(), raw)
}

export function encodeDesign(d: Design): string {
  const json = JSON.stringify(d)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDesign(s: string): Design | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return normalizeDesign(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}

export function downloadJson(d: Design) {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${d.name.replace(/[^\w\-áéíóúñ ]+/gi, '').trim().replace(/\s+/g, '_') || 'diseno'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === 'number' ? String(c) : `"${c.replace(/"/g, '""')}"`)).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
