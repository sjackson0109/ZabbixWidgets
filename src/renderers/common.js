import { escapeHtml } from '../utils/escape.js';
import { displayUnits, formatValue } from '../data/units.js';

/** Base option shared by every renderer. */
export function baseOption(context) {
	const { theme } = context;
	return {
		color: theme.palette,
		backgroundColor: 'transparent',
		textStyle: { color: theme.text },
		aria: { enabled: true },
		animation: false,
		tooltip: {
			confine: true,
			backgroundColor: theme.tooltipBackground,
			borderColor: theme.axisLine,
			textStyle: { color: theme.text }
		},
		legend: context.showLegend
			? { show: true, type: 'scroll', bottom: 0, textStyle: { color: theme.text } }
			: { show: false }
	};
}

export function valueAxis(context, units) {
	return {
		type: 'value',
		axisLine: { lineStyle: { color: context.theme.axisLine } },
		splitLine: { lineStyle: { color: context.theme.splitLine } },
		axisLabel: { color: context.theme.mutedText, formatter: (value) => formatValue(value, units, context.decimals) }
	};
}

export function categoryAxis(context, categories) {
	return {
		type: 'category',
		data: categories,
		axisLine: { lineStyle: { color: context.theme.axisLine } },
		axisLabel: { color: context.theme.mutedText, hideOverlap: true }
	};
}

/** Units shared by every series, or null when they differ. */
export function commonUnits(series) {
	const units = [...new Set(series.map((entry) => displayUnits(entry.units)))];
	return units.length === 1 ? series[0].units : null;
}

/** One escaped tooltip line: marker, label and formatted value. */
export function tooltipLine(marker, label, value, units, decimals) {
	const formatted = value === null || value === undefined ? 'no data' : formatValue(value, units, decimals);
	return `${marker ?? ''}${escapeHtml(label)}: <b>${escapeHtml(formatted)}</b>`;
}

/**
 * Display labels for individual series, unique per item. A single host shows
 * item names, a single item key shows host names, anything else shows
 * "host: item". Labels that still collide gain the item key, then the item id.
 */
export function seriesLabels(series) {
	const hosts = new Set(series.map((entry) => entry.hostid));
	const keys = new Set(series.map((entry) => entry.key));
	const base = series.map((entry) => {
		if (hosts.size === 1) {
			return entry.name;
		}
		if (keys.size === 1) {
			return entry.host;
		}
		return `${entry.host}: ${entry.name}`;
	});
	return uniqueLabels(uniqueLabels(base, series, (entry) => entry.key), series, (entry) => entry.itemid);
}

function uniqueLabels(labels, series, detailOf) {
	const counts = new Map();
	for (const label of labels) {
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return labels.map((label, index) => (counts.get(label) > 1 ? `${label} (${detailOf(series[index])})` : label));
}

function dateParts(clock, timeZone) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(clock * 1000));
	return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "YYYY-MM-DD HH:mm[:ss]" (or just the date) in the dashboard user's time zone. */
export function formatClock(clock, timeZone, { time = true, seconds = false } = {}) {
	const p = dateParts(clock, timeZone);
	if (!time) {
		return `${p.year}-${p.month}-${p.day}`;
	}
	return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${seconds ? `:${p.second}` : ''}`;
}

/** Rounds up to 1, 2 or 5 times a power of ten, for readable axis ends. */
export { niceCeil } from '../data/scale.js';

/**
 * Continuous colour scale whose bounds are the configured values or, when not
 * configured, the smallest and largest values actually shown.
 */
export function colourScale(context, values, { min = null, max = null, units = '', bottom = 0 } = {}) {
	const finite = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
	const low = min ?? (finite.length ? Math.min(...finite) : 0);
	const high = max ?? (finite.length ? Math.max(...finite) : 0);
	const format = (value) => formatValue(value, units, context.decimals);
	return {
		type: 'continuous',
		min: low,
		// A single distinct value still needs a non-empty range to colour.
		max: high === low ? low + (Math.abs(low) || 1) : high,
		text: [format(high), format(low)],
		calculable: false,
		orient: 'horizontal',
		left: 'center',
		bottom,
		itemHeight: 120,
		textStyle: { color: context.theme.mutedText },
		inRange: { color: context.theme.mode === 'dark' ? ['#1d3b53', '#56B4E9', '#F0E442'] : ['#e8f1f8', '#0072B2', '#08306b'] }
	};
}

/**
 * Pie and doughnut radii: the user's inner and outer radius (percent of the
 * smaller side, 0 = the chart's own default) and an optional rose layout.
 * A rose draws a value as a radius ("radius") or keeps equal angles and
 * draws it as a radius ("area"); both are presentations, and slices of a
 * rose are harder to compare than plain slices.
 */
export function pieGeometry(config, [defaultInner, defaultOuter]) {
	const percent = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);
	const outer = percent(config.outer_radius, defaultOuter);
	const inner = Math.min(percent(config.inner_radius, defaultInner), Math.max(0, outer - 5));
	const rose = config.pie_rose === 'radius' || config.pie_rose === 'area' ? config.pie_rose : undefined;
	return { radius: [`${inner}%`, `${outer}%`], roseType: rose };
}
