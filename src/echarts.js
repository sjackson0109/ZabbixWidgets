/**
 * Private ECharts instance for this module. Only the parts the renderers use
 * are registered, and nothing is exposed on window.
 */
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import {
	GridComponent, LegendComponent, TooltipComponent, TitleComponent, GraphicComponent, AriaComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, TitleComponent, GraphicComponent, AriaComponent, CanvasRenderer]);

export { echarts };
