import type { AnalysisView } from '../core/view'
import { DEG, KNOT } from '../core/math'
import { tailMarginText } from './Charts'

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—')

export function Results({ v, busy, compact }: { v: AnalysisView | null; busy: boolean; compact?: boolean }) {
  if (!v) return <div className="results">{busy ? 'Calculando…' : 'Sin resultados'}</div>
  const c = v.condition
  const d = v.design
  const share = v.upright.buoyancyShare
  return (
    <div className={'results' + (busy ? ' busy' : '')}>
      <div className="warnings">
        {v.warnings.length === 0 && <div className="warn ok">Sin avisos</div>}
        {v.warnings.map((w, i) => (
          <div key={i} className={'warn ' + w.level}>
            {w.text}
          </div>
        ))}
      </div>
      <h3>Navegación</h3>
      <div className="stats">
        <Stat label="Velocidad" value={f(c.V / KNOT)} unit="nudos" sub={`${f(c.V)} m/s`} />
        <Stat label="Escora" value={f(c.phi / DEG, 1)} unit="°" />
        <Stat label="Deriva" value={f(c.lambda / DEG, 1)} unit="°" />
        <Stat label="Ángulo de ataque" value={f(c.alpha, 1)} unit="°" sub={d.control.mode === 'alpha' ? 'impuesto' : `cola ${f(c.tail, 1)}°`} />
        <Stat label="Viento aparente" value={f(c.aws)} unit="m/s" sub={`${f(c.awa, 0)}° desde proa`} />
        <Stat label="Margen vela-cola" value={tailMarginText(c, d.control.mode)} />
      </div>
      {!compact && (
        <>
      <h3>Fuerzas</h3>
      <div className="stats">
        <Stat label="Propulsión" value={f(c.drive, 2)} unit="N" />
        <Stat label="Resistencia" value={f(c.resistance.hydroTotal, 2)} unit="N" />
        <Stat label="Fuerza lateral vela" value={f(c.sail.Fy, 2)} unit="N" />
        <Stat label="Momento escorante" value={f(c.heelMoment, 2)} unit="N·m" />
      </div>
        </>
      )}
      <h3>Estabilidad y flotación</h3>
      <div className="stats">
        <Stat label="Desplazamiento" value={f(v.mass, 2)} unit="kg" />
        <Stat label="Calado casco central" value={f(v.upright.draftMain * 100, 1)} unit="cm" sub={`francobordo ${f(v.upright.freeboardMain * 100, 1)} cm`} />
        <Stat label="Momento adrizante máx." value={f(v.stability.rmMax, 1)} unit="N·m" sub={`a ${v.stability.phiGzMax}°`} />
        <Stat label="GM inicial" value={f(v.stability.gm, 2)} unit="m" />
        <Stat label="Viento de vuelco" value={f(v.capsize.trimmed, 1)} unit="m/s" sub={`en bandera ${f(v.capsize.feathered, 0)} m/s`} />
        <Stat label="Reserva del patín" value={f(v.amaReserve, 0)} unit="%" />
        <Stat
          label="Reparto del empuje"
          value={`${f(share.main * 100, 0)} / ${f(share.amas * 100, 0)}`}
          unit="%"
          sub={`casco / patines; apéndices ${f(share.appendages * 100, 0)} %`}
        />
        <Stat label="Eslora total" value={f(v.loa.aligned, 2)} unit="m" sub={`girando ${f(v.loa.rotating, 2)} m`} />
      </div>
      <div className="timing">Cálculo: {f(v.timings.total ?? 0, 0)} ms</div>
    </div>
  )
}
