import { useState } from 'react'
import type { AnalysisView } from '../core/view'
import { PlanView, ProfileView, SectionView } from './BoatViews'
import { Results } from './Results'
import { ForcesChart, HeelArmChart, MomentChart, SailCoefChart, SailTable, SpanLoadChart, TailCurveChart } from './Charts'

export function MainWindow({ view, busy, error }: { view: AnalysisView | null; busy: boolean; error: string | null }) {
  const [more, setMore] = useState(false)
  if (!view) return <div className="window">{error ? <pre className="error">{error}</pre> : <div className="loading">Calculando el primer diseño…</div>}</div>
  return (
    <div className="window">
      {error && <pre className="error">{error}</pre>}
      <div className="main-top">
        <div className="views">
          <PlanView v={view} />
          <div className="views-row">
            <ProfileView v={view} />
            <SectionView v={view} />
          </div>
        </div>
        <aside className="side">
          <Results v={view} busy={busy} />
        </aside>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Estabilidad: curva GZ y brazos escorantes</h2>
          <HeelArmChart v={view} />
        </section>
        <section className="card">
          <h2>Equilibrio de fuerzas</h2>
          <ForcesChart v={view} />
        </section>
      </div>
      <section className="card wide">
        <h2>Vela y cola en la condición actual</h2>
        <div className="grid3">
          <SailCoefChart v={view} which="CL" />
          <SailCoefChart v={view} which="CD" />
          <SpanLoadChart v={view} />
        </div>
        <button className="btn small" onClick={() => setMore(!more)}>
          {more ? 'Ocultar detalle de la vela' : 'Más detalle: momento en el eje y equilibrio vela-cola'}
        </button>
        {more && (
          <div className="grid3">
            <MomentChart v={view} />
            <TailCurveChart v={view} />
            <SailTable v={view} />
          </div>
        )}
      </section>
    </div>
  )
}
