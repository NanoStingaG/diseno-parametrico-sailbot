import type { ReactNode } from 'react'
import type { Field, Group } from './params'
import { NumberField } from './NumberField'
import { getPath, setPath } from '../core/path'
import type { Design } from '../core/types'

/** Campos que no aplican con el estado actual del diseño. */
function isDisabled(d: Design, path: string) {
  return path.startsWith('bulb.') && path !== 'bulb.enabled' && !d.bulb.enabled
}

/** Campos que se ocultan (consigna del modo de manejo que no está activo). */
function isHidden(d: Design, path: string) {
  return (path === 'control.alpha' && d.control.mode !== 'alpha') || (path === 'tail.angle' && d.control.mode !== 'tail')
}

export function FieldView({ f, design, onChange }: { f: Field; design: Design; onChange: (d: Design) => void }) {
  const set = (v: unknown) => onChange(setPath(design, f.path, v))
  if (isHidden(design, f.path)) return null
  if (f.kind === 'number')
    return (
      <NumberField
        label={f.label}
        unit={f.unit}
        value={Number(getPath(design, f.path))}
        min={f.min}
        max={f.max}
        step={f.step}
        help={f.help}
        disabled={isDisabled(design, f.path)}
        onChange={set}
      />
    )
  if (f.kind === 'bool')
    return (
      <label className="field check" title={f.help}>
        <input type="checkbox" checked={Boolean(getPath(design, f.path))} onChange={(e) => set(e.target.checked)} />
        <span>{f.label}</span>
      </label>
    )
  return (
    <label className="field" title={f.help}>
      <span className="field-label">{f.label}</span>
      <select value={String(getPath(design, f.path))} onChange={(e) => set(e.target.value)}>
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function GroupCard({ g, design, onChange, children }: { g: Group; design: Design; onChange: (d: Design) => void; children?: ReactNode }) {
  return (
    <section className="card">
      <h2>{g.title}</h2>
      {g.note && <p className="hint">{g.note}</p>}
      {g.fields.map((f) => (
        <FieldView key={f.path} f={f} design={design} onChange={onChange} />
      ))}
      {children}
    </section>
  )
}
