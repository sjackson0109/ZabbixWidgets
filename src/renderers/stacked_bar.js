/**
 * C02 Stacked Bar: current values as horizontal bars stacked per category.
 * The grouping dimension is explicit (host or item, as for C01) and every
 * stack shares one unit, which validation enforces. Positive and negative
 * values stack on their own sides of zero, as ECharts does by default.
 */
import { baseOption, categoryAxis, commonUnits, tooltipLine, valueAxis } from './common.js';
import { groupSeries } from './column.js';
import { escapeHtml } from '../utils/escape.js';
import { formatValue } from '../data/units.js';

export function buildStackedBarOption(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'value');
	const { categories, groups } = groupSeries(series, payload.config.group_by);
	const units = commonUnits(series) ?? '';

	return {
		...baseOption(context),
		grid: { left: 8, right: 16, top: 8, bottom: context.showLegend ? 32 : 8, containLabel: true },
		xAxis: valueAxis(context, units),
		yAxis: { ...categoryAxis(context, categories), inverse: true },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			formatter: (params) => {
				const cells = params
					.map((param) => ({ param, cell: groups[param.seriesIndex].cells[param.dataIndex] }))
					.filter(({ cell }) => cell !== null);
				const lines = cells.map(({ param, cell }) => tooltipLine(param.marker, param.seriesName, cell.value, cell.units, context.decimals));
				const total = cells.reduce((sum, { cell }) => sum + (cell.value ?? 0), 0);
				return [
					`<b>${escapeHtml(params[0]?.name ?? '')}</b>`,
					...lines,
					`Total: <b>${escapeHtml(formatValue(total, units, context.decimals))}</b>`
				].join('<br>');
			}
		},
		series: groups.map((group) => ({
			type: 'bar',
			name: group.name,
			stack: 'total',
			data: group.cells.map((cell) => (cell === null ? null : cell.value)),
			emphasis: { focus: 'series' }
		}))
	};
}

export default {
	id: 'stacked_bar',
	buildOption: buildStackedBarOption
};
