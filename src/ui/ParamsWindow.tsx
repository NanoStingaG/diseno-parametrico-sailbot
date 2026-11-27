import { useState } from 'react'
import { GROUPS } from './params'
import { GroupCard } from './Fields'
import { Results } from './Results'
import type { AnalysisView } from '../core/view'
import type { Design, Polar2D } from '../core/types'
import { nacaSymmetric, parsePolarCsv, parseSelig } from '../core/profile'

export function ParamsWindow({ design, onChange, view, busy }: { design: Design; onChange: (d: Design) => void; view: AnalysisView | null; busy: boolean }) {
  return (
    <div className="window with-side">
      <div className="cards">
        {GROUPS.map((g) => (
          <GroupCard key={g.id} g={g} design={design} onChange={onChange}>
            {g.id === 'sail' && <ProfileLoader design={design} onChange={onChange} />}
          </GroupCard>
        ))}
      </div>
      <aside className="side">
        <Results v={view} busy={busy} compact />
      </aside>
    </div>
  )
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })

export function ProfileLoader({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  const [msg, setMsg] = useState('')
  const polars = design.sailPolars ?? []
  const setPolars = (p: Polar2D[]) => onChange({ ...design, sailPolars: p.length ? p : undefined })
  return (
    <div className="loader">
      <div className="loader-row">
        <span>
          Perfil: <b>{design.sail.profileName}</b> (t/c {(design.sail.thickness * 100).toFixed(1)} %)
        </span>
      </div>
      <div className="loader-row">
        <label className="btn small">
          Cargar perfil .dat
          <input
            type="file"
            accept=".dat,.txt"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const p = parseSelig(await readFile(f))
              if (!p) return setMsg('No se pudo leer el fichero de coordenadas (formato Selig o Lednicer).')
              onChange({ ...design, sail: { ...design.sail, profileName: p.name || f.name, thickness: p.thickness }, sailProfile: p.points })
              setMsg(`Perfil cargado: espesor ${(p.thickness * 100).toFixed(1)} %. Sus polares se calculan con el método de paneles 2D si no cargas polares.`)
            }}
          />
        </label>
        <button
          className="btn small"
          onClick={() => {
            onChange({ ...design, sail: { ...design.sail, profileName: 'NACA 0012', thickness: 0.12 }, sailProfile: nacaSymmetric(0.12) })
            setMsg('Perfil NACA 0012: se usa la tabla de polares de XFOIL incluida.')
          }}
        >
          NACA 0012
        </button>
      </div>
      <div className="loader-row">
        <label className="btn small">
          Cargar polares XFOIL / CSV
          <input
            type="file"
            accept=".csv,.txt,.dat,.pol"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              const added: Polar2D[] = []
              const bad: string[] = []
              for (const f of files) {
                const p = parsePolarCsv(await readFile(f), f.name)
                if (p) added.push(p)
                else bad.push(f.name)
              }
              if (added.length) setPolars([...polars, ...added])
              setMsg(
                `${added.length} polar(es) cargada(s).` +
                  (added.some((p) => !p.reynolds) ? ' Indica el Reynolds de las que no lo traen.' : '') +
                  (bad.length ? ` No se pudieron leer: ${bad.join(', ')} (hacen falta columnas alpha, CL, CD).` : ''),
              )
            }}
          />
        </label>
        {polars.length > 0 && (
          <button className="btn small" onClick={() => setPolars([])}>
            Quitar todas
          </button>
        )}
      </div>
      {polars.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Polar</th>
              <th>Reynolds</th>
              <th>Puntos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {polars.map((p, i) => (
              <tr key={i}>
                <td>{p.name ?? `Polar ${i + 1}`}</td>
                <td>
                  <input
                    className="re-input"
                    type="number"
                    step={1000}
                    value={p.reynolds ?? ''}
                    placeholder="Re"
                    onChange={(e) => setPolars(polars.map((q, j) => (j === i ? { ...q, reynolds: Number(e.target.value) || undefined } : q)))}
                  />
                </td>
                <td>{p.points.length}</td>
                <td>
                  <button className="btn tiny" title="Quitar" onClick={() => setPolars(polars.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="hint">
        {polars.length > 0
          ? 'Se usan las polares cargadas, interpoladas en log(Re) para el Reynolds de cada franja.'
          : /naca\s*0012/i.test(design.sail.profileName)
            ? 'Sin polares cargadas: tabla XFOIL del NACA 0012 (10 Reynolds, Ncrit 9).'
            : 'Sin polares cargadas: polares calculadas con el método de paneles 2D con capa límite.'}{' '}
        {design.numeric.polarSource === 'panel' && 'La ventana Resolución fuerza ahora el método de paneles 2D.'} {msg}
      </div>
    </div>
  )
}
