import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import type { Data, Layout } from 'plotly.js'

const BASE: Partial<Layout> = {
  margin: { l: 56, r: 16, t: 36, b: 84 },
  font: { family: 'system-ui, sans-serif', size: 12, color: '#1f2933' },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  legend: { orientation: 'h', y: -0.3, yanchor: 'top', x: 0, xanchor: 'left' },
  xaxis: { gridcolor: '#e4e7eb', zerolinecolor: '#9aa5b1' },
  yaxis: { gridcolor: '#e4e7eb', zerolinecolor: '#9aa5b1' },
}

export function Plot({ data, layout, height = 340 }: { data: Data[]; layout?: Partial<Layout>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const l = {
      ...BASE,
      ...layout,
      height,
      margin: { ...BASE.margin, ...(layout?.yaxis2 ? { r: 64 } : {}), ...(layout?.margin ?? {}) },
      xaxis: { ...BASE.xaxis, ...(layout?.xaxis ?? {}) },
      yaxis: { ...BASE.yaxis, ...(layout?.yaxis ?? {}) },
    } as Partial<Layout>
    Plotly.react(ref.current, data, l, { responsive: true, displaylogo: false, displayModeBar: false })
  }, [data, layout, height])
  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) Plotly.purge(el)
    }
  }, [])
  return <div ref={ref} style={{ width: '100%' }} />
}
