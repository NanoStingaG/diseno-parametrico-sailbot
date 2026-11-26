import { useEffect, useState } from 'react'

export function NumberField(props: {
  label: string
  unit?: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  help?: string
  onChange: (v: number) => void
}) {
  const { label, unit, value, min, max, step, disabled, help, onChange } = props
  const [text, setText] = useState(fmt(value, step))
  useEffect(() => setText(fmt(value, step)), [value, step])
  const commit = (s: string) => {
    const v = Number(s.replace(',', '.'))
    if (Number.isFinite(v)) onChange(v)
    else setText(fmt(value, step))
  }
  return (
    <label className={'field' + (disabled ? ' disabled' : '')} title={help}>
      <span className="field-label">
        {label}
        {unit ? <span className="unit"> ({unit})</span> : null}
      </span>
      <div className="field-inputs">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          }}
        />
      </div>
    </label>
  )
}

function fmt(v: number, step: number) {
  if (!Number.isFinite(v)) return ''
  const dec = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step))))
  return v.toFixed(dec)
}
