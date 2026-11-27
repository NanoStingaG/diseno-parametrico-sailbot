import { useMemo } from 'react'
import { NumberField } from './NumberField'
import { PlanView, ProfileView, type MassDot } from './BoatViews'
import type { AnalysisView } from '../core/view'
import type { Design, MassItem } from '../core/types'
import { buildBoat } from '../core/boat'
import { applyFixed } from '../core/fixed'
import { setPath } from '../core/path'

/** Ventana del centro de gravedad: todas las partidas de peso; su resultado alimenta el resto de la herramienta. */
export function CGWindow({ design, onChange, view }: { design: Design; onChange: (d: Design) => void; view: AnalysisView | null }) {
  const m = design.mass
  const nUser = m.items.length
  // el CG se recalcula al instante (sin esperar al cálculo completo)
  const boat = useMemo(() => buildBoat(applyFixed(design)), [design])
  const dots: MassDot[] = boat.massItems.map((it, i) => ({ ...it, auto: i >= nUser }))
  const setItems = (items: MassItem[]) => onChange({ ...design, mass: { ...m, items } })
  const set = (path: string, v: number) => onChange(setPath(design, path, v))
  const G = boat.G
  const asm = boat.sailAssembly
  const vNow = view ? { ...view, G } : null
  return (
    <div className="window">
      <div className="cg-grid">
        <section className="card">
          <h2>Partidas de peso</h2>
          <p className="hint">
            Coordenadas: x hacia proa desde la popa del casco central, y positiva a estribor, z hacia arriba desde la quilla del casco central (m). El CG resultante es el que usan
            la hidrostática, la estabilidad y el equilibrio de la vela.
          </p>
          <table className="mass-table">
            <thead>
              <tr>
                <th>Partida</th>
                <th>kg</th>
                <th>x</th>
                <th>y</th>
                <th>z</th>
                <th>%</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {m.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <input aria-label="Nombre de la partida" value={it.name} onChange={(e) => setItems(m.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </td>
                  {(['mass', 'x', 'y', 'z'] as const).map((k) => (
                    <td key={k}>
                      <input
                        type="number"
                        aria-label={k}
                        step={k === 'mass' ? 0.05 : 0.01}
                        value={it[k]}
                        onChange={(e) => setItems(m.items.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))}
                      />
                    </td>
                  ))}
                  <td className="num">{((it.mass / Math.max(boat.mass, 1e-9)) * 100).toFixed(1)}</td>
                  <td>
                    <button className="btn tiny" title="Quitar" onClick={() => setItems(m.items.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {boat.massItems.slice(nUser).map((it) => (
                <tr key={it.name} className="auto">
                  <td>{it.name} (automática)</td>
                  <td className="num">{it.mass.toFixed(2)}</td>
                  <td className="num">{it.x.toFixed(3)}</td>
                  <td className="num">{it.y.toFixed(3)}</td>
                  <td className="num">{it.z.toFixed(3)}</td>
                  <td className="num">{((it.mass / Math.max(boat.mass, 1e-9)) * 100).toFixed(1)}</td>
                  <td />
                </tr>
              ))}
              <tr className="total">
                <td>Total y CG</td>
                <td className="num">{boat.mass.toFixed(2)}</td>
                <td className="num">{G.x.toFixed(3)}</td>
                <td className="num">{G.y.toFixed(3)}</td>
                <td className="num">{G.z.toFixed(3)}</td>
                <td className="num">100</td>
                <td />
              </tr>
            </tbody>
          </table>
          <button className="btn small" onClick={() => setItems([...m.items, { name: 'Nueva partida', mass: 0.5, x: design.hull.L / 2, y: 0, z: 0.2 }])}>
            Añadir partida
          </button>
        </section>
        <section className="card">
          <h2>Masas del conjunto vela-cola</h2>
          <p className="hint">La vela, la cola y el contrapeso se colocan solos con la geometría. El bulbo (su masa y longitud están en Parámetros) también se añade solo.</p>
          <NumberField label="Masa de la vela" unit="kg" value={design.sail.mass} min={0} max={10} step={0.05} onChange={(v) => set('sail.mass', v)} />
          <NumberField label="Altura del CG de la vela sobre cubierta" unit="m" value={design.sail.cgHeight} min={0} max={3} step={0.01} onChange={(v) => set('sail.cgHeight', v)} />
          <NumberField label="Masa de la cola" unit="kg" value={design.tail.mass} min={0} max={3} step={0.01} onChange={(v) => set('tail.mass', v)} />
          <NumberField label="Masa del contrapeso" unit="kg" value={design.tail.counterweight} min={0} max={5} step={0.01} onChange={(v) => set('tail.counterweight', v)} />
          <NumberField
            label="Distancia del contrapeso por delante del eje"
            unit="m"
            value={design.tail.counterweightArm}
            min={0}
            max={1.5}
            step={0.01}
            onChange={(v) => set('tail.counterweightArm', v)}
          />
          <table className="table compact">
            <tbody>
              <tr>
                <td>Masa del conjunto que gira</td>
                <td>{asm.mass.toFixed(2)} kg</td>
              </tr>
              <tr>
                <td>Su CG respecto al eje (+ hacia la cola)</td>
                <td>{(asm.offset * 100).toFixed(1)} cm</td>
              </tr>
              <tr>
                <td>Contrapeso que lo equilibra</td>
                <td>
                  {design.tail.counterweightArm > 0
                    ? `${Math.max(0, design.tail.counterweight + (asm.offset * asm.mass) / design.tail.counterweightArm).toFixed(3)} kg`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          <h2>Resumen</h2>
          <table className="table compact">
            <tbody>
              <tr>
                <td>Desplazamiento</td>
                <td>{boat.mass.toFixed(2)} kg</td>
              </tr>
              <tr>
                <td>CG longitudinal respecto a media eslora</td>
                <td>{((G.x - design.hull.L / 2) * 100).toFixed(1)} cm</td>
              </tr>
              <tr>
                <td>Altura del CG sobre la quilla</td>
                <td>{(G.z * 100).toFixed(1)} cm</td>
              </tr>
              <tr>
                <td>CG transversal (debe ser ≈ 0)</td>
                <td>{(G.y * 1000).toFixed(1)} mm</td>
              </tr>
              {view && (
                <tr>
                  <td>GM inicial con este CG</td>
                  <td>{view.stability.gm.toFixed(3)} m</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      {vNow ? (
        <div className="cg-views">
          <ProfileView v={vNow} masses={dots} />
          <PlanView v={vNow} masses={dots} />
          <div className="hint">Azul: partidas introducidas; naranja: partidas automáticas. Pasa el ratón por un punto para ver su masa y posición.</div>
        </div>
      ) : (
        <div className="loading">Calculando…</div>
      )}
    </div>
  )
}
