/**
 * C01 Vertical Column: current values as vertical bars, grouped by host or by
 * item. A host without a given item leaves a gap; it is never drawn as zero.
 */
import { baseOption, categoryAxis, commonUnits, tooltipLine, valueAxis } from './common.js';
import { escapeHtml } from '../utils/escape.js';

export function groupSeries(series, groupBy) {
	const byHost = groupBy !== 'item';
	const categoryOf = (entry) => (byHost ? entry.host : entry.name);
	const seriesOf = (entry) => (byHost ? entry.name : entry.host);

	const categories = [...new Set(series.map(categoryOf))];
	const names = [...new Set(series.map(seriesOf))];

	const groups = names.map((name) => {
		const cells = categories.map((category) => series.find((entry) => seriesOf(entry) === name && categoryOf(entry) === category) ?? null);
		return { name, cells };
	});

	return { categories, groups };
}

export function buildColumnOption(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'value');
	const { categories, groups } = groupSeries(series, payload.config.group_by);
	const units = commonUnits(series) ?? '';

	return {
		...baseOption(context),
		grid: { left: 8, right: 8, top: 16, bottom: context.showLegend ? 32 : 8, containLabel: true },
		xAxis: categoryAxis(context, categories),
		yAxis: valueAxis(context, units),
		tooltip: {
			...baseOption(context).tooltip,
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
