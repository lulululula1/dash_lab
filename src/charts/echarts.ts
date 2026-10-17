import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

// 필요한 모듈만 등록해 번들 크기를 줄인다.
echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

export { echarts }
export type { EChartsCoreOption as ChartOption } from 'echarts/core'

export const PALETTE = ['#22d3ee', '#a78bfa', '#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#818cf8', '#2dd4bf', '#fb923c', '#c084fc']
