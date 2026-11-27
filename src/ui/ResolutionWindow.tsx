import { RESOLUTION } from './params'
import { GroupCard } from './Fields'
import { ProfilePolarCharts } from './ProfileCharts'
import type { AnalysisView } from '../core/view'
import type { Design } from '../core/types'
import type { ProfilePolars } from '../core/studies'

const TIMINGS: [string, string, string][] = [
  ['hydrostatics', 'Hidrostática y curva GZ', 'ms'],
  ['vlm', 'Malla VLM y polares', 'ms'],
  ['michell', 'Tablas de Michell', 'ms'],
  ['vpp', 'Equilibrio (VPP)', 'ms'],
  ['curves', 'Curvas de la vela', 'ms'],
  ['heelArms', 'Vuelco y brazos escorantes', 'ms'],
  ['total', 'Total', 'ms'],
  ['sailEvals', 'Evaluaciones de la vela', ''],
  ['sailIters', 'Iteraciones del VLM no lineal', ''],
  ['eq', 'Equilibrios vela-cola', ''],
]

export function ResolutionWindow(props: {
  design: Design
  onChange: (d: Design) => void
  view: AnalysisView | null
  profile: ProfilePolars | null
  profileBusy: boolean
}) {
  const { design, onChange, view, profile, profileBusy } = props
  return (
    <div className="window">
      <div className="cards">
        {RESOLUTION.map((g) => (
          <GroupCard key={g.id} g={g} design={design} onChange={onChange}>
            {g.id === 'vlm' && (
              <p className="hint">
                <b>Plano imagen:</b> el VLM supone aire en todas direcciones. Para que el aire no atraviese la superficie del mar se añade una vela «reflejada» bajo el agua (método de las
                imágenes): equivale a que el mar sea una pared. Con la imagen en el mar el pie de la vela pierde poca carga (el hueco de francobordo deja escapar algo); en la cubierta,
                el pie queda sellado (cota optimista); sin imagen, el pie se comporta como una punta libre (cota pesimista).
              </p>
            )}
            {g.id === 'foil' && (
              <p className="hint">
                Fuente activa de la vela: <b>{profile?.sailLabel ?? '…'}</b>. Cola: <b>{profile?.tailLabel ?? '…'}</b>. Más paneles e iteraciones mejoran el método 2D a costa de
                tiempo; las polares se calculan una vez por perfil y se guardan.
              </p>
            )}
            {g.id === 'hydro' && <p className="hint">Secciones transversales por casco para integrar volumen, centro de carena y superficie mojada. 60 es suficiente; 120 para comprobar.</p>}
          </GroupCard>
        ))}
        <section className="card">
          <h2>Malla de la vela y la cola</h2>
          <MeshPreview design={design} view={view} />
        </section>
        <section className="card">
          <h2>Tiempos del último cálculo</h2>
          {view ? (
            <table className="table compact">
              <tbody>
                {TIMINGS.filter(([k]) => view.timings[k] !== undefined).map(([k, label, unit]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="num">
                      {view.timings[k].toFixed(0)} {unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="hint">Calculando…</div>
          )}
        </section>
      </div>
      <section className="card wide">
        <h2>Polares 2D a los Reynolds de trabajo</h2>
        <p className="hint">
          Las líneas discontinuas son el método de paneles 2D con capa límite calculado aquí, para compararlo con la tabla XFOIL o las polares cargadas.
          {profile && ` Reynolds de la cuerda media de la vela ≈ ${(profile.sailRe / 1000).toFixed(0)}k; de la cola ≈ ${(profile.tailRe / 1000).toFixed(0)}k.`}
        </p>
        {profile ? <ProfilePolarCharts p={profile} /> : <div className="hint">{profileBusy ? 'Calculando polares…' : 'Sin datos'}</div>}
      </section>
    </div>
  )
}

/** Paneles del VLM en el plano de la vela (cosenoidal en altura, uniforme en cuerda) y el plano imagen. */
function MeshPreview({ design, view }: { design: Design; view: AnalysisView | null }) {
  const s = design.sail
  const t = design.tail
  const n = design.numeric
  const fb = view?.upright.freeboardMast ?? 0.1
  const x0 = -s.pivot * s.rootChord
  const xLeTip = x0 + s.pivot * (s.rootChord - s.tipChord)
  const xMin = Math.min(x0, xLeTip) - 0.05
  const xMax = Math.max(t.arm + 0.75 * t.chord, x0 + s.rootChord, xLeTip + s.tipChord) + 0.05
  const zMin = n.imagePlane === 'sea' ? -fb - 0.05 : -0.08
  const zMax = s.height + 0.05
  const W = 360
  const k = (W - 20) / (xMax - xMin)
  const H = (zMax - zMin) * k + 20
  const X = (x: number) => 10 + (x - xMin) * k
  const Z = (z: number) => 10 + (zMax - z) * k
  const lines: string[] = []
  const quad = (le0: number, le1: number, c0: number, c1: number, z0: number, z1: number, ns: number, nc: number) => {
    for (let j = 0; j <= ns; j++) {
      const f = 0.5 * (1 - Math.cos((Math.PI * j) / ns))
      const z = z0 + f * (z1 - z0)
      const le = le0 + f * (le1 - le0)
      const c = c0 + f * (c1 - c0)
      lines.push(`M${X(le)},${Z(z)}H${X(le + c)}`)
    }
    for (let i = 0; i <= nc; i++) {
      const g = i / nc
      lines.push(`M${X(le0 + g * c0)},${Z(z0)}L${X(le1 + g * c1)},${Z(z1)}`)
    }
  }
  quad(x0, xLeTip, s.rootChord, s.tipChord, 0, s.height, n.sailSpan, n.sailChord)
  const tLe = t.arm - 0.25 * t.chord
  quad(tLe, tLe, t.chord, t.chord, t.height, t.height + t.span, n.tailSpan, n.tailChord)
  const zImg = n.imagePlane === 'sea' ? -fb : n.imagePlane === 'deck' ? 0 : null
  return (
    <figure className="view">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 380 }} role="img" aria-label="Malla del VLM">
        <path d={lines.join('')} stroke="#2680c2" strokeWidth={0.8} fill="none" />
        <line x1={0} x2={W} y1={Z(0)} y2={Z(0)} stroke="#9aa5b1" strokeDasharray="3 3" />
        <text x={W - 4} y={Z(0) - 3} fontSize={10} textAnchor="end" fill="#52606d">
          cubierta
        </text>
        {zImg !== null && (
          <>
            <line x1={0} x2={W} y1={Z(zImg)} y2={Z(zImg)} stroke="#257de0" strokeWidth={2} />
            <text x={4} y={Z(zImg) - 4} fontSize={10} fill="#257de0">
              plano imagen ({n.imagePlane === 'sea' ? 'mar' : 'cubierta'})
            </text>
          </>
        )}
      </svg>
      <figcaption>
        {n.sailSpan}×{n.sailChord} paneles en la vela y {n.tailSpan}×{n.tailChord} en la cola ({n.sailSpan * n.sailChord + n.tailSpan * n.tailChord} vórtices de herradura). Vista lateral,
        borde de ataque a la izquierda.
      </figcaption>
    </figure>
  )
}
