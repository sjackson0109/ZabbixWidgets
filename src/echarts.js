/**
 * Private ECharts instance for this module. Only the parts the renderers use
 * are registered, and nothing is exposed on window.
 */
import * as echarts from 'echarts/core';
import {
	BarChart, BoxplotChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GaugeChart, GraphChart, HeatmapChart, LineChart, LinesChart,
	ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, TreeChart, TreemapChart
} from 'echarts/charts';
import {
	AriaComponent, CalendarComponent, DataZoomInsideComponent, DataZoomSliderComponent, GeoComponent, GraphicComponent, GridComponent, LegendComponent,
	MarkAreaComponent, MarkLineComponent, ParallelComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
	BarChart, BoxplotChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GaugeChart, GraphChart, HeatmapChart, LineChart, LinesChart,
	ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, TreeChart, TreemapChart,
	AriaComponent, CalendarComponent, DataZoomInsideComponent, DataZoomSliderComponent, GeoComponent, GraphicComponent, GridComponent, LegendComponent,
	MarkAreaComponent, MarkLineComponent, ParallelComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent,
	CanvasRenderer
]);

export { echarts };
