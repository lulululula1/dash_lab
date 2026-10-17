import { useEffect, useRef } from 'react'
import { echarts, type ChartOption } from '../charts/echarts'
import { useMotionScale } from '../hooks/useMotion'

export interface ChartClick {
  name: string
  seriesName?: string
  dataIndex: number
  data?: unknown
}

interface EChartProps {
  option: ChartOption
  className?: string
  onClick?: (e: ChartClick) => void
  ariaLabel: string
}

export function EChart({ option, className = '', onClick, ariaLabel }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null)
  const clickRef = useRef(onClick)
  useEffect(() => {
    clickRef.current = onClick
  }, [onClick])
  const scale = useMotionScale()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const inst = echarts.init(el, undefined, { renderer: 'canvas' })
    chart.current = inst
    inst.on('click', (p) => {
      const params = p as unknown as ChartClick
      clickRef.current?.({ name: params.name, seriesName: params.seriesName, dataIndex: params.dataIndex, data: params.data })
    })
    const ro = new ResizeObserver(() => inst.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      inst.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(
      { animation: scale > 0, animationDuration: 900 * scale, animationDurationUpdate: 500 * scale, ...option },
      { notMerge: true },
    )
  }, [option, scale])

  return <div ref={ref} className={className} role="img" aria-label={ariaLabel} />
}
