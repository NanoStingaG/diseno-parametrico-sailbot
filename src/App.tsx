import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { defaultDesign } from './core/defaults'
import type { Design } from './core/types'
import { METRICS, type AnalysisView } from './core/view'
import { ParamPanel } from './ui/ParamPanel'
import { Results } from './ui/Results'
import { PlanView, SectionView, ProfileView } from './ui/BoatViews'
import { ForcesChart, StabilityChart, SailChart, MassChart } from './ui/Charts'
import { SweepPanel, ComparePanel, type SweepResult } from './ui/SweepCompare'
import { decodeDesign, downloadCsv, downloadJson, encodeDesign, normalizeDesign } from './ui/io'

type Tab = 'forces' | 'stability' | 'sail' | 'mass' | 'sweep' | 'compare' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'forces', label: 'Fuerzas' },
  { id: 'stability', label: 'Estabilidad' },
  { id: 'sail', label: 'Vela y cola' },
  { id: 'mass', label: 'Masas' },
  { id: 'sweep', label: 'Barrido' },
  { id: 'compare', label: 'Comparar' },
  { id: 'about', label: 'Modelo' },
]

function initialDesign(): Design {
  const h = window.location.hash
  if (h.startsWith('#d=')) {
    const d = decodeDesign(h.slice(3))
    if (d) return d
  }
  try {
    const s = localStorage.getItem('sailbot-design')
    if (s) return normalizeDesign(JSON.parse(s))
  } catch {
    /* sin almacenamiento */
  }
  return defaultDesign()
}

export default function App() {
  const [design, setDesign] = useState<Design>(initialDesign)
  const [view, setView] = useState<AnalysisView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('forces')
  const [compare, setCompare] = useState<AnalysisView[]>([])
  const [sweep, setSweep] = useState<SweepResult | null>(null)
  const [sweepProgress, setSweepProgress] = useState<{ done: number; total: number } | null>(null)
  const [toast, setToast] = useState('')
  const worker = useRef<Worker | null>(null)
  const sweepWorker = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const sweepPath = useRef('')

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (ev) => {
      const m = ev.data
      if (m.id !== reqId.current) return
      if (m.type === 'analyze') {
        setView(m.view)
        setError(null)
        setBusy(false)
      } else if (m.type === 'error') {
        setError(m.error)
        setBusy(false)
      }
    }
    worker.current = w
    const sw = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    sw.onmessage = (ev) => {
      const m = ev.data
      if (m.type === 'sweep-progress') setSweepProgress({ done: m.done, total: m.total })
      else if (m.type === 'sweep') {
        setSweep({ path: sweepPath.current, rows: m.rows })
        setSweepProgress(null)
      } else if (m.type === 'compare') {
        setCompare((c) => [...c, m.view].slice(-3))
      } else if (m.type === 'error') {
        setSweepProgress(null)
        setError(m.error)
      }
    }
    sweepWorker.current = sw
    return () => {
      w.terminate()
      sw.terminate()
    }
  }, [])

  // recalcular con un pequeño retardo tras cada cambio
  useEffect(() => {
    setBusy(true)
    const t = setTimeout(() => {
      reqId.current += 1
      worker.current?.postMessage({ type: 'analyze', id: reqId.current, design })
    }, 200)
    try {
      localStorage.setItem('sailbot-design', JSON.stringify(design))
    } catch {
      /* ignorar */
    }
    return () => clearTimeout(t)
  }, [design])

  const flash = (s: string) => {
    setToast(s)
    setTimeout(() => setToast(''), 2500)
  }

  const shareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#d=${encodeDesign(design)}`
    window.history.replaceState(null, '', url)
    navigator.clipboard?.writeText(url).then(
      () => flash('Enlace copiado al portapapeles'),
      () => flash('Enlace en la barra de direcciones'),
    )
  }, [design])

  const loadFile = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        setDesign(normalizeDesign(JSON.parse(String(r.result))))
        flash('Diseño cargado')
      } catch {
        flash('No se pudo leer el fichero')
      }
    }
    r.readAsText(file)
  }

  const exportCsv = () => {
    if (!view) return
    const rows: (string | number)[][] = [['Indicador', 'Valor', 'Unidad']]
    for (const m of METRICS) rows.push([m.label, Number(view.metrics[m.key].toFixed(5)), m.unit])
    rows.push([])
    rows.push(['Escora (°)', 'GZ (m)', 'Momento adrizante (N·m)'])
    for (const p of view.stability.curve) rows.push([p.phi, Number(p.GZ.toFixed(5)), Number(p.RM.toFixed(4))])
    downloadCsv(`${design.name || 'diseno'}_resultados.csv`, rows)
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>Diseño paramétrico del trimarán</b>
          <span>Micro Ruta de la Sal</span>
        </div>
        <input className="name" value={design.name} onChange={(e) => setDesign({ ...design, name: e.target.value })} aria-label="Nombre del diseño" />
        <div className="actions">
          <button className="btn" onClick={() => downloadJson(design)}>
            Guardar JSON
          </button>
          <label className="btn">
            Cargar JSON
            <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
          <button className="btn" onClick={shareLink}>
            Copiar enlace
          </button>
          <button className="btn" onClick={exportCsv} disabled={!view}>
            Exportar CSV
          </button>
          <button
            className="btn"
            onClick={() => {
              sweepWorker.current?.postMessage({ type: 'compare', id: 0, design })
              setTab('compare')
              flash('Añadido a la comparación')
            }}
          >
            Añadir a comparación
          </button>
          <button
            className="btn"
            onClick={() => {
              if (confirmReset()) setDesign(defaultDesign())
            }}
          >
            Restablecer
          </button>
        </div>
      </header>
      <main>
        <aside className="left">
          <ParamPanel design={design} onChange={setDesign} />
        </aside>
        <section className="center">
          {error && <pre className="error">{error}</pre>}
          {view ? (
            <>
              <div className="views">
                <PlanView v={view} />
                <div className="views-row">
                  <ProfileView v={view} />
                  <SectionView v={view} />
                </div>
              </div>
              <nav className="tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </nav>
              <div className="tab-body">
                {tab === 'forces' && <ForcesChart v={view} />}
                {tab === 'stability' && <StabilityChart v={view} />}
                {tab === 'sail' && <SailChart v={view} />}
                {tab === 'mass' && <MassChart v={view} />}
                {tab === 'sweep' && (
                  <SweepPanel
                    design={design}
                    result={sweep}
                    progress={sweepProgress}
                    onRun={(path, values) => {
                      sweepPath.current = path
                      setSweepProgress({ done: 0, total: values.length })
                      sweepWorker.current?.postMessage({ type: 'sweep', id: 1, design, path, values })
                    }}
                  />
                )}
                {tab === 'compare' && <ComparePanel items={compare} onRemove={(i) => setCompare(compare.filter((_, j) => j !== i))} />}
                {tab === 'about' && <About />}
              </div>
            </>
          ) : (
            <div className="loading">Calculando el primer diseño…</div>
          )}
        </section>
        <aside className="right">
          <Results v={view} busy={busy} />
        </aside>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function confirmReset() {
  return window.confirm('¿Restablecer el diseño de ejemplo? Se perderán los cambios no guardados.')
}

function About() {
  return (
    <div className="about">
      <p>
        La herramienta resuelve el equilibrio estacionario del trimarán en aguas tranquilas. Sistema de referencia: x hacia proa desde la popa del casco
        central, y positiva a estribor, z hacia arriba desde la quilla del casco central. El viento real entra por babor.
      </p>
      <ul>
        <li>
          <b>Vela y cola:</b> Vortex Lattice plano con las dos superficies juntas, plano imagen en el mar, en la cubierta o sin imagen, gradiente de viento y
          corrección viscosa por franjas. Con la cola, el ángulo de ataque es el que anula el momento respecto al eje.
        </li>
        <li>
          <b>Hidrostática:</b> integración directa por secciones del volumen sumergido de los tres cascos a cualquier escora, con equilibrio de hundimiento y
          asiento. La curva GZ se calcula hasta 90°. Quilla, timón y bulbo se consideran siempre sumergidos.
        </li>
        <li>
          <b>Deriva:</b> quilla, timón y casco como alas de alargamiento bajo (Helmbold, casco como plano imagen). El timón trabaja en el downwash de la quilla.
          Los patines no aportan fuerza lateral.
        </li>
        <li>
          <b>Resistencia:</b> ITTC-57 con factor de forma de Hoerner para cada casco y apéndice, olas con la integral de Michell por casco (sin interferencia) y
          resistencia inducida de quilla y timón. Factor de calibración editable.
        </li>
        <li>
          <b>Equilibrio:</b> se busca la velocidad que iguala propulsión y resistencia; en cada velocidad se iteran deriva, escora y ángulo de la vela.
        </li>
      </ul>
      <p>Hipótesis: régimen estacionario, sin olas ni dinámica, sólidos rígidos, timón a 0°, sin interferencia entre cascos. Fuera de Fn 0,5 el modelo de resistencia pierde validez.</p>
    </div>
  )
}
