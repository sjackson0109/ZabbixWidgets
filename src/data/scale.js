/**
 * The one value-axis range helper. Every chart that works out its own axis
 * (rather than leaving it to ECharts) asks here, so data, fixed limits, a
 * zero baseline, negatives, thresholds and targets are treated the same way.
 */

/** Smallest and largest finite numbers in a list, without spreading it (lists can be long). */
export function extentOf(values) {
	let min = Infinity;
	let max = -Infinity;
	for (const value of values) {
		if (Number.isFinite(value)) {
			min = value < min ? value : min;
			max = value > max ? value : max;
		}
	}
	return min === Infinity ? null : { min, max };
}

/** The smallest of 1, 2 or 5 times a power of ten that is at least the value. */
export function niceCeil(value) {
	if (!(value > 0)) {
		return value;
	}
	const power = 10 ** Math.floor(Math.log10(value));
	const step = [1, 2, 5, 10].find((factor) => factor * power >= value);
	return step * power;
}

/**
 * Axis range: { min, max }, with max > min.
 * - values: the data; include: thresholds, targets or ranges that must also show;
 * - min, max: the user's fixed limits (null to follow the data), never moved;
 * - zero: keep zero on the axis; pad: fraction of the span added at free ends;
 * - nice: round a free upper end up to 1, 2 or 5 times a power of ten.
 * An empty or flat range opens to a span of one (or of the value's size).
 */
export function axisRange({ values = [], include = [], min = null, max = null, zero = false, pad = 0, nice = false } = {}) {
	const extent = extentOf([...values, ...include, ...(zero ? [0] : [])]) ?? { min: 0, max: 1 };
	let low = min ?? extent.min;
	let high = max ?? extent.max;
	if (high <= low) {
		if (max === null) {
			high = low + (Math.abs(low) || 1);
		}
		else {
			low = high - (Math.abs(high) || 1);
		}
	}
	const span = high - low;
	if (min === null && !(zero && low === 0)) {
		low -= span * pad;
	}
	if (max === null) {
		high += span * pad;
		if (nice) {
			high = high > 0 ? niceCeil(high) : high;
		}
	}
	return { min: low, max: high };
}
