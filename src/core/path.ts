/** Lectura y escritura de un valor por ruta 'a.b.c' sobre una copia profunda. */
export function getPath(obj: unknown, path: string): unknown {
  let o: unknown = obj
  for (const k of path.split('.')) {
    if (o === null || typeof o !== 'object') return undefined
    o = (o as Record<string, unknown>)[k]
  }
  return o
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as unknown as Record<string, unknown>
  const keys = path.split('.')
  let o = copy
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] as Record<string, unknown>
  o[keys[keys.length - 1]] = value
  return copy as unknown as T
}
