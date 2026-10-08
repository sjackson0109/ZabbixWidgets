/**
 * C28 Mixed Line and Bar: one time axis with two explicit kinds of series.
 *
 * - Bar items are aggregated into buckets of the "Period length" (average,
 *   sum, minimum, maximum or count of their samples, see data/buckets.js).
 *   A bucket with no samples has no bar; it is never drawn as zero.
 * - Line items are drawn from their real samples exactly as the Temporal
 *   Line draws them: broken at gaps, optionally stepped, never interpolated.
 *
 * Both follow the dashboard time period. Each distinct unit (a count of
 * samples has none) gets its own value axis, at most two. Over periods
 * longer than two days, Zabbix's hourly trends stand in for history; bars
 * then weight each trend hour by its number of samples.
 */
import { baseOption, formatClock, valueAxis } from './common.js';
import { timeLabel } from './temporal.js';
import { barBuckets } from '../data/buckets.js';
import { parseBucket } from '../data/aggregate.js';
import { echartsStep, heldSampleAt, lineData, sampleAt, temporalSeries } from '../data/temporal.js';
import { sharedScale } from '../data/thresholds.js';
import { displayUnits, formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const DAY = 86400;
const AGGREGATION_NAMES = { avg: 'average', sum: 'sum', min: 'minimum', max: 'maximum', count: 'samples' };

/** Units a bar shows: the item's own, except a count of samples, which has none. */
export function barUnits(entry, aggregation) {
	return aggregation === 'count' ? '' : entry.units;
}

/** Bar and line series ready to draw, each with its axis unit. */
export function mixedSeries(payload, context) {
	const { config } = payload;
	const aggregation = config.aggregation ?? 'avg';
	const bucket = parseBucket(config.bucket) ?? 3600;
	const bars = temporalSeries(payload, { role: 'bar' }).map((series) => ({
		...series,
		kind: 'bar',
		axisUnits: displayUnits(barUnits(series.entry, aggregation)),
		buckets: barBuckets(series.points, bucket, aggregation, context.timeZone ?? 'UTC')
	}));
	const lines = temporalSeries(payload, { role: 'line' }).map((series) => ({ ...series, kind: 'line', axisUnits: displayUnits(series.units) }));
	// Labels are unique within a role; a name used in both roles says which one it is.
	const barNames = new Set(bars.map((series) => series.label));
	for (const line of lines) {
		if (barNames.has(line.label)) {
			line.label = `${line.label} (line)`;
		}
	}
	return { bars, lines, aggregation, bucket };
}

/** The bucket of one bar series that holds a clock, or null. */
export function bucketAt(series, clock) {
	return series.buckets.find((entry) => clock >= entry.start && clock < entry.end) ?? null;
}

export function buildMixedOption(payload, context) {
	const { config } = payload;
	const { theme } = context;
	const { bars, lines, aggregation } = mixedSeries(payload, context);
	const all = [...bars, ...lines].map((series, index) => ({ ...series, colour: theme.palette[index % theme.palette.length] }));
	const units = [...new Set(all.map((series) => series.axisUnits))];
	const axisOf = (series) => Math.max(0, units.indexOf(series.axisUnits));
	const period = payload.timePeriod;
	const span = period ? period.to - period.from : DAY;
	const step = echartsStep(config.line_step);
	const visible = (name) => context.state?.legendSelected?.[name] !== false;
	const hostids = new Set(payload.series.map((entry) => entry.hostid));
	const { scale } = sharedScale({ scale_min: config.y_min, scale_max: config.y_max }, payload.hosts.filter((host) => hostids.has(host.hostid)));

	const tooltip = (pointerMs) => {
		const clock = pointerMs / 1000;
		const rows = all.filter((series) => visible(series.label)).map((series) => {
			const marker = `<span style="display:inline-block;margin-right:4px;border-radius:2px;width:9px;height:9px;background-color:${series.colour};"></span>`;
			const name = `${escapeHtml(series.entry.host)}: ${escapeHtml(series.entry.name)}`;
			if (series.kind === 'bar') {
				const found = bucketAt(series, clock);
				if (found === null) {
					return `${marker}${name}: <span style="opacity:0.7">no data</span>`;
				}
				const range = `${formatClock(found.start, context.timeZone)} – ${formatClock(found.end, context.timeZone)}`;
				return `${marker}${name}: <b>${escapeHtml(formatValue(found.value, barUnits(series.entry, aggregation), context.decimals))}</b> `
					+ `<span style="opacity:0.7">${escapeHtml(AGGREGATION_NAMES[aggregation] ?? aggregation)} of ${found.count} sample${found.count === 1 ? '' : 's'}, ${escapeHtml(range)}</span>`;
			}
			const sample = step === false ? sampleAt(series, clock) : heldSampleAt(series, clock, config.line_step);
			if (sample === null) {
				return `${marker}${name}: <span style="opacity:0.7">no data</span>`;
			}
			const at = sample.clock === Math.round(clock) ? '' : ` <span style="opacity:0.7">at ${escapeHtml(formatClock(sample.clock, context.timeZone, { seconds: true }))}</span>`;
			return `${marker}${name}: <b>${escapeHtml(formatValue(sample.value, series.units, context.decimals))}</b>${at}`;
		});
		return [`<b>${escapeHtml(formatClock(clock, context.timeZone, { seconds: true }))}</b>`, ...rows].join('<br>');
	};

	const base = baseOption(context);
	const legendHeight = context.showLegend ? 24 : 0;

	return {
		...base,
		legend: context.showLegend ? { ...base.legend, data: all.map((series) => series.label) } : { show: false },
		grid: { left: 8, right: units.length > 1 ? 8 : 16, top: 16, bottom: 30 + legendHeight, containLabel: true },
		xAxis: {
			type: 'time',
			min: period ? period.from * 1000 : undefined,
			max: period ? period.to * 1000 : undefined,
			axisLine: { lineStyle: { color: theme.axisLine } },
			splitLine: { show: false },
			axisLabel: { color: theme.mutedText, hideOverlap: true, formatter: (ms) => timeLabel(ms, span, context.timeZone) }
		},
		yAxis: (units.length === 0 ? [''] : units).map((unit, index) => ({
			...valueAxis(context, unit),
			position: index === 0 ? 'left' : 'right',
			// Bars start at zero; a line-only axis may follow the data unless the baseline is asked for.
			scale: config.zero_baseline !== true && !bars.some((series) => series.axisUnits === unit),
			min: index === 0 ? scale.min ?? undefined : undefined,
			max: index === 0 ? scale.max ?? undefined : undefined,
			splitLine: { show: index === 0, lineStyle: { color: theme.splitLine } }
		})),
		dataZoom: [
			{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseWheel: false, moveOnMouseMove: true },
			{
				type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 14, bottom: 6 + legendHeight, showDetail: false, brushSelect: false,
				borderColor: theme.splitLine, textStyle: { color: theme.mutedText }
			}
		],
		tooltip: {
			...base.tooltip,
			trigger: 'axis',
			axisPointer: { type: 'line', snap: false, lineStyle: { color: theme.mutedText, type: 'dashed' } },
			formatter: (params) => {
				const pointer = Array.isArray(params) ? params[0]?.axisValue : params?.axisValue;
				return pointer === undefined ? '' : tooltip(pointer);
			}
		},
		series: all.map((series) => (series.kind === 'bar'
			? {
				type: 'bar',
				name: series.label,
				yAxisIndex: axisOf(series),
				color: series.colour,
				barMaxWidth: 28,
				// Each bar stands at the middle of its bucket, so it lines up with the samples it summarises.
				data: series.buckets.map((entry) => [((entry.start + entry.end) / 2) * 1000, entry.value]),
				emphasis: { focus: 'series' }
			}
			: {
				type: 'line',
				name: series.label,
				yAxisIndex: axisOf(series),
				color: series.colour,
				data: lineData(series.points, series.threshold),
				connectNulls: false,
				showSymbol: config.show_points === true,
				symbolSize: 4,
				step,
				smooth: config.smooth === true && step === false ? 0.3 : false,
				lineStyle: { width: 1.5 },
				z: 3,
				emphasis: { focus: 'series' }
			}))
	};
}

export default {
	id: 'mixed',
	buildOption: buildMixedOption
};
