/**
 * Shared time-series layer for C21 Temporal Line, C22 Temporal Area,
 * C24 State Timeline, C25 Sparkline Grid and C26 Threshold Band.
 *
 * Samples are drawn where Zabbix recorded them. A gap longer than the
 * series' gap threshold breaks the line instead of being bridged; nothing
 * is filled in or set to zero. The threshold is the user's "Maximum gap"
 * or, when that is empty, two and a half update intervals (the item's own
 * interval when Zabbix stores a plain one, otherwise the median spacing of
 * its samples). Hourly trend points use a two-hour threshold.
 */
import { displayUnits } from './units.js';
import { parseBucket } from './aggregate.js';
import { seriesLabels } from '../renderers/common.js';

const AUTO_GAP_FACTOR = 2.5;
const TREND_GAP = 2 * 3600;

/** "" is automatic, "0" never breaks, anything else is a duration such as "10m". Returns { mode, seconds, error }. */
export function parseGap(text) {
	const trimmed = String(text ?? '').trim();
	if (trimmed === '') {
		return { mode: 'auto', seconds: null, error: null };
	}
	if (trimmed === '0') {
		return { mode: 'never', seconds: Infinity, error: null };
	}
	const seconds = parseBucket(trimmed);
	return seconds === null
		? { mode: 'auto', seconds: null, error: 'Maximum gap must look like 90s, 10m or 2h, or be 0 to never break lines.' }
		: { mode: 'fixed', seconds, error: null };
}

/** Median spacing between consecutive samples, in seconds, or null with fewer than two. */
export function medianInterval(points) {
	if (points.length < 2) {
		return null;
	}
	const steps = points.slice(1).map((point, index) => point.clock - points[index].clock).filter((step) => step > 0).sort((a, b) => a - b);
	if (steps.length === 0) {
		return null;
	}
	const middle = Math.floor(steps.length / 2);
	return steps.length % 2 === 1 ? steps[middle] : (steps[middle - 1] + steps[middle]) / 2;
}

/** The typical spacing of a series: its plain update interval, else its median sample spacing. */
export function typicalInterval(entry, points = entry.history) {
	return entry.delay ?? medianInterval(points);
}

/** Longest spacing still drawn as continuous for one series. */
export function gapThreshold(entry, gap, points = entry.history) {
	if (gap.mode === 'never') {
		return Infinity;
	}
	if (gap.mode === 'fixed') {
		return gap.seconds;
	}
	if (points.some((point) => point.num !== undefined)) {
		return Math.max(TREND_GAP, AUTO_GAP_FACTOR * (typicalInterval(entry, points.filter((point) => point.num === undefined)) ?? 0));
	}
	const interval = typicalInterval(entry, points);
	return interval === null ? Infinity : AUTO_GAP_FACTOR * interval;
}

/**
 * Time series ready for drawing: [{ entry, label, units, points, threshold }].
 * Series without numeric history are kept (with no points) so they appear
 * in the legend and in validation warnings.
 */
export function temporalSeries(payload, { role = 'value' } = {}) {
	const series = payload.series.filter((entry) => entry.role === role);
	const labels = seriesLabels(series);
	const gap = parseGap(payload.config.max_gap);
	return series.map((entry, index) => ({
		entry,
		label: labels[index],
		units: entry.units,
		points: entry.history,
		threshold: gapThreshold(entry, gap)
	}));
}

/**
 * [milliseconds, value] pairs for ECharts, with a null between two samples
 * further apart than the threshold so the line breaks there.
 */
export function lineData(points, threshold) {
	const data = [];
	points.forEach((point, index) => {
		const previous = points[index - 1];
		if (previous !== undefined && point.clock - previous.clock > threshold) {
			data.push([((previous.clock + point.clock) / 2) * 1000, null]);
		}
		data.push([point.clock * 1000, point.value]);
	});
	return data;
}

/** Index of the sample nearest to a clock (seconds), by binary search; -1 for no samples. */
export function nearestIndex(points, clock) {
	if (points.length === 0) {
		return -1;
	}
	let low = 0;
	let high = points.length - 1;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (points[middle].clock < clock) {
			low = middle + 1;
		}
		else {
			high = middle;
		}
	}
	if (low > 0 && clock - points[low - 1].clock <= points[low].clock - clock) {
		return low - 1;
	}
	return low;
}

/**
 * The sample a tooltip shows for one series at a clock: the nearest real
 * sample, if it lies within half the series' gap threshold (or within the
 * period, for series that never break). Otherwise null: no data there.
 */
export function sampleAt(series, clock) {
	const index = nearestIndex(series.points, clock);
	if (index === -1) {
		return null;
	}
	const point = series.points[index];
	const tolerance = Number.isFinite(series.threshold) ? series.threshold / 2 : Infinity;
	return Math.abs(point.clock - clock) <= tolerance ? point : null;
}

/**
 * Step semantics for the line chart. "after": each value holds from its own
 * sample until the next one (sample and hold, the usual reading of a gauge
 * value). "before": each value holds back to the previous sample (the usual
 * reading of a value measured over the interval that ends at its sample).
 * "middle": the line changes halfway between samples. Holds never cross a
 * gap: a line broken at a gap is not carried over it.
 */
export const STEP_MODES = Object.freeze({ after: 'end', before: 'start', middle: 'middle' });

/** The ECharts step setting for a configured mode, or false for straight lines. */
export function echartsStep(mode) {
	return STEP_MODES[mode] ?? false;
}

/**
 * The sample a stepped line shows at a clock: the value held there under the
 * step mode, or, near a sample, that sample. Returns null where the line
 * shows nothing (before the first sample, after the last, or across a gap).
 */
export function heldSampleAt(series, clock, mode) {
	const points = series.points;
	if (mode !== 'after' && mode !== 'before') {
		return sampleAt(series, clock);
	}
	let low = 0;
	let high = points.length;
	// First index whose clock is after the pointer.
	while (low < high) {
		const middle = (low + high) >> 1;
		if (points[middle].clock <= clock) {
			low = middle + 1;
		}
		else {
			high = middle;
		}
	}
	const before = points[low - 1];
	const after = points[low];
	if (before !== undefined && before.clock === clock) {
		return before;
	}
	if (before !== undefined && after !== undefined && after.clock - before.clock <= series.threshold) {
		return mode === 'after' ? before : after;
	}
	return sampleAt(series, clock);
}

/** Distinct display units in first-seen order; each becomes one value axis. */
export function unitGroups(series) {
	return [...new Set(series.map((entry) => displayUnits(entry.units)))];
}

const NICE_STEPS = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** Smallest of the usual interval steps that is at least the given seconds. */
export function niceStep(seconds) {
	return NICE_STEPS.find((step) => step >= seconds) ?? Math.ceil(seconds / 86400) * 86400;
}

/**
 * Aligns series for stacking: each series is averaged into the same
 * epoch-aligned buckets (the longest typical interval among them, rounded
 * up to a usual step), and a bucket where any series has no sample is left
 * empty for all of them, so a stack never adds up an incomplete set.
 * Returns { bucket, starts, values: [[value|null per start] per series] }.
 */
export function alignForStack(list) {
	const intervals = list.map((series) => typicalInterval(series.entry, series.points)).filter((value) => value !== null);
	const bucket = niceStep(intervals.length > 0 ? Math.max(...intervals) : 60);
	const perSeries = list.map((series) => {
		const sums = new Map();
		for (const point of series.points) {
			const start = Math.floor(point.clock / bucket) * bucket;
			const weight = point.num ?? 1;
			const [sum, count] = sums.get(start) ?? [0, 0];
			sums.set(start, [sum + point.value * weight, count + weight]);
		}
		return new Map([...sums].map(([start, [sum, count]]) => [start, sum / count]));
	});
	const starts = [...new Set(perSeries.flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);
	const complete = starts.map((start) => perSeries.every((map) => map.has(start)));
	return {
		bucket,
		starts,
		values: perSeries.map((map) => starts.map((start, index) => (complete[index] ? map.get(start) : null)))
	};
}

/** Smallest and largest values over all points, or null without points. */
export function valueExtent(list) {
	let low = Infinity;
	let high = -Infinity;
	for (const series of list) {
		for (const point of series.points) {
			low = Math.min(low, point.min ?? point.value);
			high = Math.max(high, point.max ?? point.value);
		}
	}
	return low === Infinity ? null : { min: low, max: high };
}
