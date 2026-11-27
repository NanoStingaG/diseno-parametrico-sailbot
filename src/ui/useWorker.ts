import { useEffect, useRef } from 'react'
import type { WorkerRequest } from '../worker'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerMessage = any

/** Worker de cálculo que se puede detener (terminate) y volver a crear. */
export function useWorker(onMessage: (m: WorkerMessage) => void) {
  const ref = useRef<Worker | null>(null)
  const handler = useRef(onMessage)
  handler.current = onMessage
  const make = () => {
    const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (ev) => handler.current(ev.data)
    w.onerror = (ev) => handler.current({ type: 'error', id: -1, task: 'worker', error: ev.message })
    return w
  }
  useEffect(() => {
    ref.current = make()
    return () => ref.current?.terminate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {
    post: (m: WorkerRequest) => {
      if (!ref.current) ref.current = make()
      ref.current.postMessage(m)
    },
    restart: () => {
      ref.current?.terminate()
      ref.current = make()
    },
  }
}
