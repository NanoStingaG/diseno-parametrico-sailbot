import { useState } from 'react'
import { GROUPS, type Field } from './params'
import { NumberField } from './NumberField'
import { getPath, setPath } from '../core/path'
import type { Design, MassItem } from '../core/types'
import { parseSelig, parsePolarCsv, nacaSymmetric } from '../core/profile'

export function ParamPanel({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ hull: true, sail: true, env: true })
  const set = (path: string, v: unknown) => onChange(setPath(design, path, v))

  const renderField = (f: Field) => {
    const disabled =
      (/\.(B|T|D)\.q3$/.test(f.path) && Boolean(getPath(design, f.path.split('.')[0] + '.symmetric'))) ||
      (f.path === 'ama.targetVolume' && !design.ama.volumeMode) ||
      (/^ama\.(B|T)\./.test(f.path) && design.ama.volumeMode) ||
      (f.path.startsWith('bulb.') && f.path !== 'bulb.enabled' && !design.bulb.enabled) ||
      (f.path === 'control.alpha' && design.control.mode !== 'alpha') ||
      (f.path === 'tail.angle' && design.control.mode !== 'tail') ||
      (f.path === 'control.maxHeel' && design.control.mode !== 'optimize') ||
      (f.path.startsWith('env.z') && !design.env.gradient)
    if (f.kind === 'number') {
      let value = Number(getPath(design, f.path))
      if (disabled && /\.q3$/.test(f.path)) value = Number(getPath(design, f.path.replace('q3', 'q1')))
      return (
        <NumberField
          key={f.path}
          label={f.label}
          unit={f.unit}
          value={value}
          min={f.min}
          max={f.max}
          step={f.step}
          help={f.help}
          disabled={disabled}
          onChange={(v) => set(f.path, v)}
        />
      )
    }
    if (f.kind === 'bool')
      return (
        <label key={f.path} className="field check" title={f.help}>
          <input type="checkbox" checked={Boolean(getPath(design, f.path))} onChange={(e) => set(f.path, e.target.checked)} />
          <span>{f.label}</span>
        </label>
      )
    return (
      <label key={f.path} className="field" title={f.help}>
        <span className="field-label">{f.label}</span>
        <select value={String(getPath(design, f.path))} onChange={(e) => set(f.path, e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="params">
      {GROUPS.map((g) => (
        <section key={g.id} className="group">
          <button className="group-title" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
            <span>{open[g.id] ? '▾' : '▸'}</span> {g.title}
          </button>
          {open[g.id] && (
            <div className="group-body">
              {g.fields.map(renderField)}
              {g.id === 'sail' && <ProfileLoader design={design} onChange={onChange} />}
            </div>
          )}
        </section>
      ))}
      <section className="group">
        <button className="group-title" onClick={() => setOpen({ ...open, mass: !open.mass })}>
          <span>{open.mass ? '▾' : '▸'}</span> Masas
        </button>
        {open.mass && (
          <div className="group-body">
            <MassEditor design={design} onChange={onChange} />
          </div>
        )}
      </section>
    </div>
  )
}

function ProfileLoader({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  const [msg, setMsg] = useState('')
  const readFile = (file: File, cb: (text: string) => void) => {
    const r = new FileReader()
    r.onload = () => cb(String(r.result))
    r.readAsText(file)
  }
  return (
    <div className="loader">
      <div className="loader-row">
        <span>
          Perfil: <b>{design.sail.profileName}</b> (t/c = {(design.sail.thickness * 100).toFixed(1)} %)
        </span>
      </div>
      <div className="loader-row">
        <label className="btn small">
          Cargar perfil .dat
          <input
            type="file"
            accept=".dat,.txt"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              readFile(f, (t) => {
                const p = parseSelig(t)
                if (!p) return setMsg('No se pudo leer el fichero de coordenadas')
                onChange({
                  ...design,
                  sail: { ...design.sail, profileName: p.name || f.name, thickness: p.thickness },
                  sailProfile: p.points,
                })
                setMsg(`Perfil cargado: espesor ${(p.thickness * 100).toFixed(1)} %`)
              })
            }}
          />
        </label>
        <button
          className="btn small"
          onClick={() => {
            onChange({ ...design, sail: { ...design.sail, profileName: 'NACA 0012', thickness: 0.12 }, sailProfile: nacaSymmetric(0.12) })
            setMsg('Perfil NACA 0012')
          }}
        >
          NACA 0012
        </button>
      </div>
      <div className="loader-row">
        <label className="btn small">
          Cargar polar 2D (CSV)
          <input
            type="file"
            accept=".csv,.txt,.dat"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              readFile(f, (t) => {
                const p = parsePolarCsv(t)
                if (!p) return setMsg('No se pudo leer la polar: columnas alfa, cl, cd')
                onChange({ ...design, sailPolar: p })
                setMsg(`Polar cargada: ${p.points.length} puntos`)
              })
            }}
          />
        </label>
        {design.sailPolar && (
          <button className="btn small" onClick={() => onChange({ ...design, sailPolar: undefined })}>
            Quitar polar
          </button>
        )}
      </div>
      <div className="hint">
        {design.sailPolar ? `Polar activa (${design.sailPolar.points.length} puntos).` : 'Sin polar: resistencia de perfil con placa plana y factor de espesor.'}{' '}
        {msg}
      </div>
    </div>
  )
}

function MassEditor({ design, onChange }: { design: Design; onChange: (d: Design) => void }) {
  const m = design.mass
  const setItems = (items: MassItem[]) => onChange({ ...design, mass: { ...m, items } })
  return (
    <div>
      <label className="field check">
        <input type="checkbox" checked={m.simple} onChange={(e) => onChange({ ...design, mass: { ...m, simple: e.target.checked } })} />
        <span>Modo simple (masa total y CG)</span>
      </label>
      {m.simple ? (
        <>
          <NumberField label="Masa total" unit="kg" value={m.total} min={1} max={60} step={0.1} onChange={(v) => onChange({ ...design, mass: { ...m, total: v } })} />
          {(['x', 'y', 'z'] as const).map((k) => (
            <NumberField
              key={k}
              label={`CG ${k}`}
              unit="m"
              value={m.cg[k]}
              min={k === 'x' ? 0 : -1}
              max={k === 'x' ? 3 : 1}
              step={0.005}
              onChange={(v) => onChange({ ...design, mass: { ...m, cg: { ...m.cg, [k]: v } } })}
            />
          ))}
        </>
      ) : (
        <>
          <table className="mass-table">
            <thead>
              <tr>
                <th>Partida</th>
                <th>kg</th>
                <th>x</th>
                <th>y</th>
                <th>z</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {m.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <input value={it.name} onChange={(e) => setItems(m.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </td>
                  {(['mass', 'x', 'y', 'z'] as const).map((k) => (
                    <td key={k}>
                      <input
                        type="number"
                        step={k === 'mass' ? 0.05 : 0.01}
                        value={it[k]}
                        onChange={(e) => setItems(m.items.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))}
                      />
                    </td>
                  ))}
                  <td>
                    <button className="btn tiny" title="Quitar" onClick={() => setItems(m.items.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn small" onClick={() => setItems([...m.items, { name: 'Nueva partida', mass: 0.5, x: 1.2, y: 0, z: 0.2 }])}>
            Añadir partida
          </button>
          <div className="hint">Vela, cola, contrapeso y bulbo se añaden solos a partir de sus parámetros. y positiva a estribor.</div>
        </>
      )}
    </div>
  )
}
