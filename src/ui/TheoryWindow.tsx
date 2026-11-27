import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { BLOCKS, EDGES, type TheoryBlock } from './theory'

const BW = 168
const BH = 50
const CW = 196
const RH = 78
const PAD = 16

const pos = (b: TheoryBlock) => ({ x: PAD + b.col * CW, y: PAD + b.row * RH })

/** Texto con fórmulas: $…$ en línea y $$…$$ en bloque. */
function renderMath(text: string) {
  const out: string[] = []
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g
  let last = 0
  let m: RegExpExecArray | null
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  while ((m = re.exec(text))) {
    out.push(esc(text.slice(last, m.index)))
    const display = m[1] !== undefined
    out.push(katex.renderToString(display ? m[1] : m[2], { displayMode: display, throwOnError: false, strict: false }))
    last = m.index + m[0].length
  }
  out.push(esc(text.slice(last)))
  return out.join('')
}

function Body({ text }: { text: string }) {
  const html = useMemo(() => {
    return text
      .split(/\n\s*\n/)
      .map((para) => {
        const lines = para.split('\n')
        if (lines.every((l) => l.trim().startsWith('- '))) return `<ul>${lines.map((l) => `<li>${renderMath(l.trim().slice(2))}</li>`).join('')}</ul>`
        // párrafo seguido de lista
        const i = lines.findIndex((l) => l.trim().startsWith('- '))
        if (i > 0)
          return `<p>${renderMath(lines.slice(0, i).join(' '))}</p><ul>${lines
            .slice(i)
            .map((l) => `<li>${renderMath(l.trim().replace(/^- /, ''))}</li>`)
            .join('')}</ul>`
        return `<p>${renderMath(para)}</p>`
      })
      .join('')
  }, [text])
  return <div className="theory-body" dangerouslySetInnerHTML={{ __html: html }} />
}

export function TheoryWindow() {
  const [sel, setSel] = useState('vlm')
  const block = BLOCKS.find((b) => b.id === sel) ?? BLOCKS[0]
  const W = PAD * 2 + 5 * CW + BW
  const H = PAD * 2 + Math.max(...BLOCKS.map((b) => b.row)) * RH + BH
  const byId = Object.fromEntries(BLOCKS.map((b) => [b.id, b]))
  const related = new Set(EDGES.filter(([a, b]) => a === sel || b === sel).flat())
  return (
    <div className="window">
      <section className="card wide">
        <h2>Flujo de cálculo</h2>
        <p className="hint">Pulsa un bloque para ver su base teórica. Las flechas indican qué resultados alimentan a cada bloque.</p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="flow" role="group" aria-label="Diagrama del flujo de cálculo">
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#9aa5b1" />
            </marker>
            <marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#257de0" />
            </marker>
          </defs>
          {EDGES.map(([a, b]) => {
            const pa = pos(byId[a])
            const pb = pos(byId[b])
            const [x1, y1, x2, y2] = clip(pa.x + BW / 2, pa.y + BH / 2, pb.x + BW / 2, pb.y + BH / 2)
            const on = a === sel || b === sel
            return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? '#257de0' : '#cbd2d9'} strokeWidth={on ? 2 : 1.3} markerEnd={on ? 'url(#ahs)' : 'url(#ah)'} />
          })}
          {BLOCKS.map((b) => {
            const p = pos(b)
            const active = b.id === sel
            return (
              <g
                key={b.id}
                className="flow-node"
                tabIndex={0}
                role="button"
                aria-pressed={active}
                aria-label={b.title}
                onClick={() => setSel(b.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(b.id)}
              >
                <rect x={p.x} y={p.y} width={BW} height={BH} rx={8} fill={active ? '#257de0' : related.has(b.id) ? '#e6f0fc' : '#fff'} stroke={active ? '#1757ac' : '#9aa5b1'} strokeWidth={1.5} />
                <foreignObject x={p.x + 4} y={p.y + 2} width={BW - 8} height={BH - 4}>
                  <div className={'flow-label' + (active ? ' active' : '')}>{b.title}</div>
                </foreignObject>
                <title>{b.summary}</title>
              </g>
            )
          })}
        </svg>
      </section>
      <section className="card wide theory">
        <h2>{block.title}</h2>
        <p className="lead">{block.summary}</p>
        {block.sections.map((s) => (
          <div key={s.h}>
            <h3>{s.h}</h3>
            <Body text={s.body} />
          </div>
        ))}
        <h3>Comprobación</h3>
        <Body text={block.validation} />
        <h3>Referencias</h3>
        <ol className="refs">
          {block.refs.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}

/** Recorta la línea entre centros a los bordes de las cajas. */
function clip(x1: number, y1: number, x2: number, y2: number): [number, number, number, number] {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = (hx: number, hy: number) => Math.min(Math.abs(dx) > 1e-9 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hy / Math.abs(dy) : Infinity)
  const k = t(BW / 2 + 2, BH / 2 + 2)
  return [x1 + dx * k, y1 + dy * k, x2 - dx * (k + 0.01), y2 - dy * (k + 0.01)]
}
