import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { defaultDesign } from './core/defaults'
import type { Design } from './core/types'
import { METRICS, type AnalysisView } from './core/view'
import type { DesignCurves, ProfilePolars, Sensitivity } from './core/studies'
import { decodeDesign, downloadCsv, downloadJson, encodeDesign, normalizeDesign } from './ui/io'
import { useWorker, type WorkerMessage } from './ui/useWorker'
import { MainWindow } from './ui/MainWindow'
import { CurvesWindow, type TaskProgress } from './ui/CurvesWindow'
import { ParamsWindow } from './ui/ParamsWindow'
import { CGWindow } from './ui/CGWindow'
import { ResolutionWindow } from './ui/ResolutionWindow'
import { OptimizeWindow, useStudies } from './ui/OptimizeWindow'
import { TheoryWindow } from './ui/TheoryWindow'
import { GROUPS } from './ui/params'

type Win = 'main' | 'curves' | 'params' | 'cg' | 'resolution' | 'optimize' | 'theory'

const WINDOWS: { id: Win; label: string }[] = [
  { id: 'main', label: 'Principal' },
  { id: 'curves', label: 'Curvas de diseño' },
  { id: 'params', label: 'Parámetros' },
  { id: 'cg', label: 'Centro de gravedad' },
  { id: 'resolution', label: 'Resolución' },
  { id: 'optimize', label: 'Optimización' },
  { id: 'theory', label: 'Flujo y teoría' },
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

function initialWin(): Win {
  try {
    const w = localStorage.getItem('sailbot-window') as Win | null
    if (w && WINDOWS.some((x) => x.id === w)) return w
  } catch {
    /* ignorar */
  }
  return 'main'
}

const round05 = (x: number) => Math.max(0.5, Math.round(x * 2) / 2)
const designKey = (d: Design) => JSON.stringify({ ...d, name: '' })

/** Parámetros de diseño para la sensibilidad: todos los numéricos salvo el viento y las consignas. */
const SENS_FIELDS = GROUPS.filter((g) => g.id !== 'env').flatMap((g) => g.fields.filter((f) => f.kind === 'number').map((f) => ({ path: f.path, label: `${g.title}: ${f.label}` })))

export default function App() {
  const [design, setDesign] = useState<Design>(initialDesign)
  const [win, setWin] = useState<Win>(initialWin)
  const [view, setView] = useState<AnalysisView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const reqId = useRef(0)

  // ---------- análisis principal ----------
  const analysis = useWorker((m: WorkerMessage) => {
    if (m.id !== reqId.current) return
    if (m.type === 'analyze') {
      setView(m.view)
      setError(null)
      setBusy(false)
    } else if (m.type === 'error') {
      setError(m.error)
      setBusy(false)
    }
  })
  useEffect(() => {
    setBusy(true)
    const t = setTimeout(() => {
      reqId.current += 1
      analysis.post({ type: 'analyze', id: reqId.current, design })
    }, 200)
    try {
      localStorage.setItem('sailbot-design', JSON.stringify(design))
    } catch {
      /* ignorar */
    }
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design])

  useEffect(() => {
    try {
      localStorage.setItem('sailbot-window', win)
    } catch {
      /* ignorar */
    }
  }, [win])

  // ---------- curvas de diseño (se recalculan solas cuando la ventana está visible) ----------
  const [curves, setCurves] = useState<DesignCurves | null>(null)
  const [curvesKey, setCurvesKey] = useState('')
  const [curvesProgress, setCurvesProgress] = useState<TaskProgress | null>(null)
  const [twsText, setTwsText] = useState(() => {
    const t = design.env.tws
    return [round05(t * 0.6), t, round05(t * 1.4)].join(', ')
  })
  const curvesId = useRef(0)
  const runningKey = useRef('')
  const curvesW = useWorker((m: WorkerMessage) => {
    if (m.id !== curvesId.current) return
    if (m.type === 'progress') setCurvesProgress({ done: m.done, total: m.total, note: m.note })
    else if (m.type === 'curves') {
      setCurves(m.curves)
      setCurvesKey(runningKey.current)
      setCurvesProgress(null)
    } else if (m.type === 'error') {
      setError(m.error)
      setCurvesProgress(null)
    }
  })
  const twsList = useMemo(
    () =>
      twsText
        .split(/[,;\s]+/)
        .map(Number)
        .filter((x) => Number.isFinite(x) && x > 0)
        .slice(0, 5),
    [twsText],
  )
  const key = designKey(design) + '|' + twsList.join(',')
  const runCurves = useCallback(() => {
    curvesW.restart()
    curvesId.current += 1
    runningKey.current = key
    setCurvesProgress({ done: 0, total: 1 })
    curvesW.post({ type: 'curves', id: curvesId.current, design, twsList: twsList.length ? twsList : [design.env.tws] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    if (win !== 'curves' || key === curvesKey || key === runningKey.current) return
    const t = setTimeout(runCurves, 800)
    return () => clearTimeout(t)
  }, [win, key, curvesKey, runCurves])

  // ---------- polares del perfil y sensibilidad ----------
  const [profile, setProfile] = useState<ProfilePolars | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [sens, setSens] = useState<Sensitivity | null>(null)
  const [sensProgress, setSensProgress] = useState<TaskProgress | null>(null)
  const auxId = useRef({ profile: 0, sens: 0 })
  const aux = useWorker((m: WorkerMessage) => {
    if (m.type === 'profile' && m.id === auxId.current.profile) {
      setProfile(m.profile)
      setProfileBusy(false)
    } else if (m.type === 'progress' && m.task === 'sensitivity' && m.id === auxId.current.sens) setSensProgress({ done: m.done, total: m.total, note: m.note })
    else if (m.type === 'sensitivity' && m.id === auxId.current.sens) {
      setSens(m.sens)
      setSensProgress(null)
    } else if (m.type === 'error') {
      setError(m.error)
      setProfileBusy(false)
      setSensProgress(null)
    }
  })
  const profileKey = JSON.stringify([design.sailProfile, design.sailPolars, design.numeric, design.sail, design.tail.chord, design.env.tws])
  useEffect(() => {
    if (win !== 'resolution') return
    setProfileBusy(true)
    const t = setTimeout(() => {
      auxId.current.profile += 1
      aux.post({ type: 'profile', id: auxId.current.profile, design })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, profileKey])
  const runSens = (step: number) => {
    auxId.current.sens += 1
    setSensProgress({ done: 0, total: SENS_FIELDS.length * 2 + 1 })
    aux.post({ type: 'sensitivity', id: auxId.current.sens, design, fields: SENS_FIELDS, step })
  }

  // ---------- estudios ----------
  const studies = useStudies()

  // ---------- acciones ----------
  const flash = (s: string) => {
    setToast(s)
    setTimeout(() => setToast(''), 2500)
  }
  const shareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#d=${encodeDesign(design)}`
    window.history.replaceState(null, '', url)
    navigator.clipboard?.writeText(url).then(
      () => flash('Enlace copiado al portapapeles'),
      () => flash('Enlace en la barra de direcciones'),
    )
  }
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
    for (const m of METRICS) rows.push([m.label, Number((view.metrics[m.key] ?? NaN).toFixed(5)), m.unit])
    rows.push([])
    rows.push(['Partida', 'Masa (kg)', 'x (m)', 'y (m)', 'z (m)'])
    for (const it of view.massItems) rows.push([it.name, it.mass, it.x, it.y, it.z])
    rows.push(['Total y CG', view.mass, view.G.x, view.G.y, view.G.z])
    rows.push([])
    const ha = view.heelArms
    rows.push(['Escora (°)', 'GZ (m)', 'Momento adrizante (N·m)', ...(ha ? ha.cases.map((c) => `Brazo: ${c.label} (m)`) : [])])
    view.stability.curve.forEach((p, i) => rows.push([p.phi, Number(p.GZ.toFixed(5)), Number(p.RM.toFixed(4)), ...(ha ? ha.cases.map((c) => Number(c.arm[i].toFixed(5))) : [])]))
    downloadCsv(`${design.name || 'diseno'}_resultados.csv`, rows)
  }

  const curvesStale = !!curves && key !== curvesKey

  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>Diseño paramétrico del trimarán</b>
          <span>Micro Ruta de la Sal · v2</span>
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
              if (window.confirm('¿Restablecer el diseño de ejemplo? Se perderán los cambios no guardados.')) setDesign(defaultDesign())
            }}
          >
            Restablecer
          </button>
        </div>
      </header>
      <nav className="windows" aria-label="Ventanas">
        {WINDOWS.map((w) => (
          <button key={w.id} className={win === w.id ? 'active' : ''} onClick={() => setWin(w.id)} aria-current={win === w.id ? 'page' : undefined}>
            {w.label}
            {w.id === 'optimize' && studies.running && <span className="dot" title="Cálculo en marcha" />}
            {w.id === 'curves' && curvesProgress && <span className="dot" title="Cálculo en marcha" />}
          </button>
        ))}
        <span className={'status' + (busy ? ' busy' : '')}>{busy ? 'Calculando…' : view ? `Calculado en ${(view.timings.total ?? 0).toFixed(0)} ms` : ''}</span>
      </nav>
      <main>
        {win === 'main' && <MainWindow view={view} busy={busy} error={error} />}
        {win === 'curves' && (
          <CurvesWindow
            view={view}
            curves={curves}
            progress={curvesProgress}
            stale={curvesStale}
            twsText={twsText}
            setTwsText={setTwsText}
            onRun={runCurves}
            sens={sens}
            sensProgress={sensProgress}
            onSens={runSens}
          />
        )}
        {win === 'params' && <ParamsWindow design={design} onChange={setDesign} view={view} busy={busy} />}
        {win === 'cg' && <CGWindow design={design} onChange={setDesign} view={view} />}
        {win === 'resolution' && <ResolutionWindow design={design} onChange={setDesign} view={view} profile={profile} profileBusy={profileBusy} />}
        {win === 'optimize' && (
          <OptimizeWindow
            design={design}
            st={studies}
            onApply={(d) => {
              setDesign({ ...d, name: `${design.name} (óptimo)` })
              flash('Diseño óptimo aplicado')
              setWin('main')
            }}
          />
        )}
        {win === 'theory' && <TheoryWindow />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
