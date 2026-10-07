/**
 * C01 Vertical Column: current values as vertical bars, grouped by host or by
 * item. A host without a given item leaves a gap; it is never drawn as zero.
 *
 * Grouping uses identities, not display names: hosts by hostid and items by
 * item key, which Zabbix keeps unique per host. Labels are disambiguated when
 * two identities share a display name, so distinct items never collapse.
 */
import { baseOption, categoryAxis, commonUnits, tooltipLine, valueAxis } from './common.js';
import { escapeHtml } from '../utils/escape.js';

export function hostDimension(entry) {
	return { id: `host:${entry.hostid}`, label: entry.host, detail: entry.hostid };
}

export function itemDimension(entry) {
	return { id: `item:${entry.key}`, label: entry.name, detail: entry.key };
}

/** Distinct dimensions in first-seen order, with labels made unique. */
export function distinct(series, dimensionOf) {
	const byId = new Map();
	for (const entry of series) {
		const dimension = dimensionOf(entry);
		if (!byId.has(dimension.id)) {
			byId.set(dimension.id, dimension);
		}
	}
	const dimensions = [...byId.values()];
	const labelCounts = new Map();
	for (const dimension of dimensions) {
		labelCounts.set(dimension.label, (labelCounts.get(dimension.label) ?? 0) + 1);
	}
	return dimensions.map((dimension) => ({
		...dimension,
		label: labelCounts.get(dimension.label) > 1 ? `${dimension.label} (${dimension.detail})` : dimension.label
	}));
}

export function groupSeries(series, groupBy) {
	const byHost = groupBy !== 'item';
	const categoryOf = byHost ? hostDimension : itemDimension;
	const seriesOf = byHost ? itemDimension : hostDimension;

	const categories = distinct(series, categoryOf);
	const groupDimensions = distinct(series, seriesOf);

	const cells = new Map();
	for (const entry of series) {
		cells.set(`${seriesOf(entry).id}|${categoryOf(entry).id}`, entry);
	}

	const groups = groupDimensions.map((dimension) => ({
		name: dimension.label,
		cells: categories.map((category) => cells.get(`${dimension.id}|${category.id}`) ?? null)
	}));

	return { categories: categories.map((category) => category.label), groups };
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
