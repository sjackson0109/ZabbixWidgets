/**
 * Private ECharts instance for this module. Only the parts the renderers use
 * are registered, and nothing is exposed on window.
 */
import * as echarts from 'echarts/core';
import {
	BarChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GraphChart, HeatmapChart, PieChart, RadarChart, ScatterChart, SunburstChart,
	TreeChart, TreemapChart
} from 'echarts/charts';
import {
	AriaComponent, CalendarComponent, GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, RadarComponent,
	TitleComponent, TooltipComponent, VisualMapContinuousComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
	BarChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GraphChart, HeatmapChart, PieChart, RadarChart, ScatterChart, SunburstChart,
	TreeChart, TreemapChart,
	AriaComponent, CalendarComponent, GraphicComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, RadarComponent,
	TitleComponent, TooltipComponent, VisualMapContinuousComponent,
	CanvasRenderer
]);

export { echarts };
