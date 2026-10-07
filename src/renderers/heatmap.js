/**
 * C06 Heat Map: values on an explicit X x Y grid.
 *
 * - host x item (or item x host): each cell is the latest value of that item
 *   on that host. Hosts are identified by host id and items by item key.
 * - time x item or time x host: each row collects the history of its items
 *   and each column is one epoch-aligned bucket, aggregated with the chosen
 *   function. Buckets without samples stay empty.
 *
 * The colour scale uses the configured bounds or, where none are set, the
 * smallest and largest values shown.
 */
import { baseOption, colourScale, commonUnits, formatClock, categoryAxis } from './common.js';
import { distinct, hostDimension, itemDimension } from './dimensions.js';
import { aggregateBuckets, parseBucket, periodBuckets } from '../data/aggregate.js';
import { toNumber } from '../data/normalise.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const DIMENSIONS = { host: hostDimension, item: itemDimension };

function latestGrid(series, xOf, yOf) {
	const xs = distinct(series, xOf);
	const ys = distinct(series, yOf);
	const xIndex = new Map(xs.map((dimension, index) => [dimension.id, index]));
	const yIndex = new Map(ys.map((dimension, index) => [dimension.id, index]));
	const cells = series
		.filter((entry) => typeof entry.value === 'number')
		.map((entry) => ({ x: xIndex.get(xOf(entry).id), y: yIndex.get(yOf(entry).id), value: entry.value, count: 1 }));
	return { xLabels: xs.map((dimension) => dimension.label), yLabels: ys.map((dimension) => dimension.label), cells };
}

function timeGrid(series, yOf, payload, context) {
	const bucket = parseBucket(payload.config.bucket);
	const fn = payload.config.aggregation ?? 'avg';
	const starts = periodBuckets(payload.timePeriod, bucket);
	const xIndex = new Map(starts.map((start, index) => [start, index]));
	const ys = distinct(series, yOf);

	const cells = [];
	ys.forEach((row, y) => {
		const samples = series
			.filter((entry) => yOf(entry).id === row.id)
			.flatMap((entry) => entry.history)
			.sort((a, b) => a.clock - b.clock);
		for (const { start, value, count } of aggregateBuckets(samples, bucket, fn)) {
			if (xIndex.has(start) && value !== null) {
				cells.push({ x: xIndex.get(start), y, value, count });
			}
		}
	});

	const withTime = bucket < 86400;
	return {
		xLabels: starts.map((start) => formatClock(start, context.timeZone, { time: withTime })),
		yLabels: ys.map((dimension) => dimension.label),
		cells
	};
}

export function heatmapGrid(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'value');
	const { heat_x: x, heat_y: y } = payload.config;
	const yOf = DIMENSIONS[y] ?? itemDimension;
	return x === 'time' ? timeGrid(series, yOf, payload, context) : latestGrid(series, DIMENSIONS[x] ?? hostDimension, yOf);
}

export function buildHeatmapOption(payload, context) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const grid = heatmapGrid(payload, context);
	const countOnly = config.heat_x === 'time' && config.aggregation === 'count';
	const units = countOnly ? '' : (commonUnits(series) ?? '');
	const bound = (text) => (text === undefined || text === '' ? null : toNumber(String(text)));

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
		xAxis: { ...categoryAxis(context, grid.xLabels), splitArea: { show: true } },
		yAxis: { ...categoryAxis(context, grid.yLabels), inverse: true, splitArea: { show: true } },
		visualMap: colourScale(context, grid.cells.map((cell) => cell.value), {
			min: bound(config.colour_min),
			max: bound(config.colour_max),
			units
		}),
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const [x, y, value] = param.value;
				return `${escapeHtml(grid.yLabels[y])}<br>${escapeHtml(grid.xLabels[x])}: <b>${escapeHtml(formatValue(value, units, context.decimals))}</b>`;
			}
		},
		series: [{
			type: 'heatmap',
			data: grid.cells.map((cell) => [cell.x, cell.y, cell.value]),
			emphasis: { itemStyle: { borderColor: context.theme.text, borderWidth: 1 } }
		}]
	};
}

export default {
	id: 'heatmap',
	buildOption: buildHeatmapOption
};
