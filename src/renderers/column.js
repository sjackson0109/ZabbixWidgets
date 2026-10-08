/**
 * C01 Vertical Column: current values as bars, grouped by host or by item
 * (see dimensions.js). A host without a given item leaves a gap; it is never
 * drawn as zero. "Bars" turns the chart on its side (categories down the
 * left, values along the bottom) without changing anything else.
 */
import { baseOption, categoryAxis, commonUnits, tooltipLine, valueAxis } from './common.js';
import { groupSeries } from './dimensions.js';
import { escapeHtml } from '../utils/escape.js';

export function buildColumnOption(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'value');
	const { categories, groups } = groupSeries(series, payload.config.group_by);
	const units = commonUnits(series) ?? '';

	const horizontal = payload.config.bar_orientation === 'horizontal';

	const base = baseOption(context);

	return {
		...base,
		grid: { left: 8, right: horizontal ? 16 : 8, top: 16, bottom: context.showLegend ? 32 : 8, containLabel: true },
		xAxis: horizontal ? valueAxis(context, units) : categoryAxis(context, categories),
		// Horizontal bars read top-down in the same order as columns read left to right.
		yAxis: horizontal ? { ...categoryAxis(context, categories), inverse: true } : valueAxis(context, units),
		tooltip: {
			...base.tooltip,
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			formatter: (params) => {
				const lines = params.map((param) => {
					const cell = groups[param.seriesIndex].cells[param.dataIndex];
					return cell === null ? null : tooltipLine(param.marker, param.seriesName, cell.value, cell.units, context.decimals);
				}).filter(Boolean);
				return [`<b>${escapeHtml(params[0]?.name ?? '')}</b>`, ...lines].join('<br>');
			}
		},
		series: groups.map((group) => ({
			type: 'bar',
			name: group.name,
			data: group.cells.map((cell) => (cell === null ? null : cell.value)),
			emphasis: { focus: 'series' }
		}))
	};
}

export default {
	id: 'column',
	buildOption: buildColumnOption
};
