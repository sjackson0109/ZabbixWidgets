/**
 * C29 Distribution: how the raw samples of each item in the time period are
 * spread, as boxplots or as a histogram (see data/distribution.js for the
 * quartile, whisker, outlier and binning rules).
 *
 * - Boxplot: one box per item: quartiles, median, whiskers to the furthest
 *   samples within 1.5 interquartile ranges, and the samples beyond them as
 *   outliers (which can be hidden).
 * - Histogram: the number of samples in each value range, every item on the
 *   same bins so their shapes compare.
 *
 * All items share one unit; validation enforces it.
 */
import { baseOption, categoryAxis, commonUnits, seriesLabels, valueAxis } from './common.js';
import { boxStats, histogram } from '../data/distribution.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const NOTE = 'Each sample counts once, however long it held.';

export function distributionData(payload) {
	const series = payload.series.filter((entry) => entry.role === 'value' && entry.history.length > 0);
	const labels = seriesLabels(series);
	return series.map((entry, index) => ({
		entry,
		label: labels[index],
		values: entry.history.map((point) => point.value).filter((value) => typeof value === 'number')
	}));
}

function buildBoxplot(payload, context, list, units) {
	const stats = list.map((item) => boxStats(item.values));
	const showOutliers = payload.config.show_outliers !== false;
	const format = (value) => formatValue(value, units, context.decimals);
	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
		xAxis: { ...categoryAxis(context, list.map((item) => item.label)), axisLabel: { color: context.theme.mutedText, interval: 0, overflow: 'truncate', width: 120 } },
		yAxis: { ...valueAxis(context, units), scale: true },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.seriesType === 'scatter') {
					return `<b>${escapeHtml(list[param.value[0]].label)}</b><br>Outlier: <b>${escapeHtml(format(param.value[1]))}</b>`;
				}
				const item = list[param.dataIndex];
				const stat = stats[param.dataIndex];
				return [
					`<b>${escapeHtml(item.label)}</b>`,
					`Samples: ${stat.count}`,
					`Upper whisker: ${escapeHtml(format(stat.highWhisker))}`,
					`Third quartile: ${escapeHtml(format(stat.q3))}`,
					`Median: <b>${escapeHtml(format(stat.median))}</b>`,
					`First quartile: ${escapeHtml(format(stat.q1))}`,
					`Lower whisker: ${escapeHtml(format(stat.lowWhisker))}`,
					`Outliers: ${stat.outliers.length}`,
					`<span style="opacity:0.7">${escapeHtml(NOTE)}</span>`
				].join('<br>');
			}
		},
		series: [
			{
				type: 'boxplot',
				name: 'Distribution',
				itemStyle: { color: context.theme.mode === 'dark' ? 'rgba(86, 180, 233, 0.25)' : 'rgba(0, 114, 178, 0.15)', borderColor: context.theme.palette[0] },
				data: stats.map((stat) => [stat.lowWhisker, stat.q1, stat.median, stat.q3, stat.highWhisker])
			},
			{
				type: 'scatter',
				name: 'Outliers',
				symbolSize: 5,
				itemStyle: { color: context.theme.palette[5] },
				data: showOutliers ? stats.flatMap((stat, index) => stat.outliers.map((value) => [index, value])) : []
			}
		]
	};
}

function buildHistogram(payload, context, list, units) {
	const result = histogram(list.map((item) => item.values), Number(payload.config.hist_bins) || 0);
	const { edges, counts } = result ?? { edges: [0, 1], counts: list.map(() => [0]) };
	const format = (value) => formatValue(value, units, context.decimals);
	const base = baseOption(context);

	return {
		...base,
		legend: context.showLegend && list.length > 1 ? { ...base.legend, data: list.map((item) => item.label) } : { show: false },
		grid: { left: 8, right: 16, top: 32, bottom: context.showLegend && list.length > 1 ? 32 : 8, containLabel: true },
		xAxis: { ...valueAxis(context, units), min: edges[0], max: edges[edges.length - 1], scale: true },
		yAxis: { ...valueAxis(context, ''), minInterval: 1, name: 'Samples', nameTextStyle: { color: context.theme.mutedText } },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const [, , count, bin] = param.value;
				return [
					`${param.marker}<b>${escapeHtml(param.seriesName)}</b>`,
					`${escapeHtml(format(edges[bin]))} to ${escapeHtml(format(edges[bin + 1]))}${bin === edges.length - 2 ? ' (inclusive)' : ''}`,
					`Samples: <b>${count}</b>`,
					`<span style="opacity:0.7">${escapeHtml(NOTE)}</span>`
				].join('<br>');
			}
		},
		// Bins drawn as rectangles from edge to edge, overlaid with transparency when several items share them.
		series: list.map((item, index) => ({
			type: 'custom',
			name: item.label,
			color: context.theme.palette[index % context.theme.palette.length],
			renderItem: (params, api) => {
				const start = api.coord([api.value(0), api.value(2)]);
				const end = api.coord([api.value(1), 0]);
				return {
					type: 'rect',
					shape: { x: start[0], y: start[1], width: Math.max(1, end[0] - start[0] - 1), height: end[1] - start[1] },
					style: { fill: api.visual('color'), opacity: list.length > 1 ? 0.55 : 0.85 }
				};
			},
			encode: { x: [0, 1], y: 2 },
			data: counts[index].map((count, bin) => [edges[bin], edges[bin + 1], count, bin]).filter(([, , count]) => count > 0)
		}))
	};
}

export function buildDistributionOption(payload, context) {
	const list = distributionData(payload);
	const units = commonUnits(list.map((item) => item.entry)) ?? '';
	return payload.config.dist_view === 'histogram'
		? buildHistogram(payload, context, list, units)
		: buildBoxplot(payload, context, list, units);
}

export default {
	id: 'distribution',
	buildOption: buildDistributionOption
};
