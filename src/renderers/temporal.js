/**
 * Option builder shared by the time-series charts (C21 line, C22 area,
 * C26 threshold band). It draws real samples only (see data/temporal.js),
 * puts each distinct unit on its own value axis, follows the dashboard time
 * period and time zone, and gives every chart the same crosshair tooltip.
 */
import { baseOption, formatClock, valueAxis } from './common.js';
import { alignForStack, lineData, parseGap, sampleAt, temporalSeries, unitGroups, valueExtent } from '../data/temporal.js';
import { bandColours, sharedScale } from '../data/thresholds.js';
import { formatValue, displayUnits } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';
import { withAlpha } from '../utils/colour.js';

const DAY = 86400;

/** Axis label for a tick, in the dashboard user's time zone, as detailed as the period needs. */
export function timeLabel(ms, span, timeZone) {
	const clock = ms / 1000;
	const full = formatClock(clock, timeZone);
	if (span <= 2 * DAY) {
		return full.slice(11);
	}
	if (span <= 60 * DAY) {
		return `${full.slice(5, 10)} ${full.slice(11)}`;
	}
	return full.slice(0, 10);
}

/**
 * Tooltip content at a pointer position (milliseconds): the sample time
 * nearest the pointer across the visible series, then each visible series'
 * own nearest sample, in legend order. A series with no sample close enough
 * shows "no data"; one whose nearest sample is at another time shows that
 * time. Nothing is interpolated.
 */
export function tooltipRows(list, pointerMs, visible = () => true) {
	const shown = list.filter((series) => visible(series.label));
	const pointer = pointerMs / 1000;
	const samples = shown.map((series) => sampleAt(series, pointer));
	const nearest = samples.filter(Boolean).reduce((best, point) => (best === null || Math.abs(point.clock - pointer) < Math.abs(best - pointer) ? point.clock : best), null);
	const at = nearest ?? pointer;
	return {
		clock: at,
		rows: shown.map((series) => ({ series, sample: sampleAt(series, at) }))
	};
}

function sampleText(sample, units, decimals) {
	const value = formatValue(sample.value, units, decimals);
	return sample.num === undefined
		? value
		: `${value} (hourly average; ${formatValue(sample.min, units, decimals)} – ${formatValue(sample.max, units, decimals)})`;
}

export function tooltipHtml(list, pointerMs, context, visible) {
	const { clock, rows } = tooltipRows(list, pointerMs, visible);
	if (rows.length === 0) {
		return '';
	}
	const lines = rows.map(({ series, sample }) => {
		const marker = `<span style="display:inline-block;margin-right:4px;border-radius:5px;width:9px;height:9px;background-color:${series.colour};"></span>`;
		const name = `${escapeHtml(series.entry.host)}: ${escapeHtml(series.entry.name)}`;
		if (sample === null) {
			return `${marker}${name}: <span style="opacity:0.7">no data</span>`;
		}
		const elsewhere = sample.clock === clock ? '' : ` <span style="opacity:0.7">at ${escapeHtml(formatClock(sample.clock, context.timeZone, { seconds: true }))}</span>`;
		return `${marker}${name}: <b>${escapeHtml(sampleText(sample, series.units, context.decimals))}</b>${elsewhere}`;
	});
	return [`<b>${escapeHtml(formatClock(clock, context.timeZone, { seconds: true }))}</b>`, ...lines].join('<br>');
}

/** Lower and upper ends of the value axis for the bands chart: data, thresholds and target all fit. */
export function bandExtent(list, scale, fixed) {
	const extent = valueExtent(list) ?? { min: 0, max: 1 };
	const values = [extent.min, extent.max, ...scale.thresholds, ...(scale.target === null ? [] : [scale.target])];
	const low = fixed.min ?? Math.min(...values);
	let high = fixed.max ?? Math.max(...values);
	if (high <= low) {
		high = low + (Math.abs(low) || 1);
	}
	const pad = (high - low) * 0.05;
	return { min: fixed.min ?? low - pad, max: fixed.max ?? high + pad };
}

/**
 * Builds the option. kind is "line", "area" or "bands".
 */
export function buildTemporalOption(payload, context, { kind = 'line' } = {}) {
	const { config } = payload;
	const { theme } = context;
	const hostids = new Set(payload.series.map((entry) => entry.hostid));
	const { scale } = sharedScale({
		scale_min: config.y_min, scale_max: config.y_max, target_value: config.target_value, thresholds: config.thresholds
	}, payload.hosts.filter((host) => hostids.has(host.hostid)));
	const list = temporalSeries(payload).map((series, index) => ({ ...series, colour: theme.palette[index % theme.palette.length] }));
	const units = unitGroups(list.map((series) => series.entry));
	const axisOf = (series) => units.indexOf(displayUnits(series.units));
	const period = payload.timePeriod;
	const span = period ? period.to - period.from : DAY;
	const stacked = kind === 'area' && config.area_mode === 'stacked';
	const opacity = Math.min(100, Math.max(0, Number.isFinite(Number(config.area_opacity)) ? Number(config.area_opacity) : 30)) / 100;
	const visible = (name) => context.state?.legendSelected?.[name] !== false;

	let data = list.map((series) => lineData(series.points, series.threshold));
	if (stacked && list.length > 0) {
		data = stackData(list, parseGap(config.max_gap));
	}

	const bands = kind === 'bands' ? scale.thresholds : [];
	const extent = kind === 'bands' ? bandExtent(list, scale, { min: scale.min, max: scale.max }) : null;
	const bandColoursList = kind === 'bands' ? bandColours(bands.length + 1, config.threshold_order) : [];

	const yAxes = (units.length === 0 ? [''] : units).map((unit, index) => ({
		...valueAxis(context, unit),
		position: index === 0 ? 'left' : 'right',
		scale: config.zero_baseline !== true,
		// Without scale, ECharts keeps zero on the axis.
		min: extent?.min ?? scale.min ?? undefined,
		max: extent?.max ?? scale.max ?? undefined,
		splitLine: { show: index === 0, lineStyle: { color: theme.splitLine } },
		axisPointer: { label: { formatter: (param) => formatValue(param.value, unit, context.decimals) } }
	}));

	const base = baseOption(context);
	const legendHeight = context.showLegend ? 24 : 0;

	return {
		...base,
		legend: context.showLegend ? { ...base.legend, data: list.map((series) => series.label) } : { show: false },
		grid: { left: 8, right: units.length > 1 ? 8 : 16, top: 16, bottom: 30 + legendHeight, containLabel: true },
		xAxis: {
			type: 'time',
			min: period ? period.from * 1000 : undefined,
			max: period ? period.to * 1000 : undefined,
			axisLine: { lineStyle: { color: theme.axisLine } },
			splitLine: { show: false },
			axisLabel: { color: theme.mutedText, hideOverlap: true, formatter: (ms) => timeLabel(ms, span, context.timeZone) },
			axisPointer: { label: { formatter: (param) => formatClock(param.value / 1000, context.timeZone, { seconds: true }) } }
		},
		yAxis: yAxes,
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
			axisPointer: {
				type: 'cross',
				snap: false,
				lineStyle: { color: theme.mutedText, type: 'dashed' },
				crossStyle: { color: theme.mutedText },
				label: { backgroundColor: theme.mutedText, color: theme.tooltipBackground }
			},
			formatter: (params) => {
				const pointer = Array.isArray(params) ? params[0]?.axisValue : params?.axisValue;
				return pointer === undefined ? '' : tooltipHtml(list, pointer, context, visible);
			}
		},
		series: list.map((series, index) => ({
			type: 'line',
			name: series.label,
			yAxisIndex: Math.max(0, axisOf(series)),
			color: series.colour,
			data: data[index],
			connectNulls: false,
			showSymbol: config.show_points === true,
			symbolSize: 4,
			smooth: config.smooth === true ? 0.3 : false,
			sampling: stacked ? undefined : 'lttb',
			lineStyle: { width: 1.5 },
			emphasis: { focus: 'series' },
			stack: stacked ? 'total' : undefined,
			areaStyle: kind === 'area' ? areaStyle(series.colour, opacity, config.area_gradient === true) : undefined,
			markArea: index === 0 && bands.length > 0 ? {
				silent: true,
				data: [extent.min, ...bands, extent.max].slice(1).map((end, band, ends) => [
					{ yAxis: band === 0 ? extent.min : ends[band - 1], itemStyle: { color: bandColoursList[band], opacity: 0.14 } },
					{ yAxis: end }
				])
			} : undefined,
			markLine: index === 0 && kind === 'bands' && (scale.target !== null || bands.length > 0) ? {
				silent: true,
				symbol: 'none',
				label: { color: theme.mutedText, position: 'insideEndTop', formatter: (param) => `${param.name} ${formatValue(param.value, series.units, context.decimals)}` },
				data: [
					...bands.map((value) => ({ name: '', yAxis: value, lineStyle: { color: theme.axisLine, type: 'dotted' } })),
					...(scale.target === null ? [] : [{ name: 'Target', yAxis: scale.target, lineStyle: { color: theme.text, type: 'dashed', width: 1.5 } }])
				]
			} : undefined
		}))
	};
}

/**
 * Stacked series on shared buckets (see alignForStack). An empty bucket is a
 * null, which breaks every line of the stack there; so does a jump between
 * buckets longer than the gap threshold.
 */
export function stackData(list, gap) {
	const { bucket, starts, values } = alignForStack(list);
	const threshold = gap.mode === 'auto' ? bucket * 2.5 : gap.seconds;
	return values.map((row) => {
		const out = [];
		starts.forEach((start, index) => {
			if (index > 0 && start - starts[index - 1] > threshold) {
				out.push([((start + starts[index - 1]) / 2) * 1000, null]);
			}
			out.push([start * 1000, row[index]]);
		});
		return out;
	});
}

function areaStyle(colour, opacity, gradient) {
	if (!gradient) {
		return { opacity };
	}
	return {
		opacity: 1,
		color: {
			type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
			colorStops: [{ offset: 0, color: withAlpha(colour, opacity) }, { offset: 1, color: withAlpha(colour, 0) }]
		}
	};
}
