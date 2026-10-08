/**
 * Distribution statistics for C29, computed only from raw history samples.
 *
 * Hourly trends keep an hour's minimum, average, maximum and sample count,
 * which cannot give back quartiles, outliers or the samples in a bin, so the
 * chart never reads them (the registry gives it no "trends" setting).
 *
 * Every sample in the time period counts once. Samples are not weighted by
 * how long they held, so an item polled more often in one part of the
 * period weighs more there; this is stated in the tooltip.
 */

/**
 * Quantile by linear interpolation between closest ranks (the method used
 * by spreadsheet QUARTILE.INC and by R's default): position p * (n - 1) in
 * the sorted values. sorted must be ascending and non-empty.
 */
export function quantile(sorted, p) {
	const position = p * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Five-number summary with Tukey's fences: whiskers reach the most extreme
 * samples within 1.5 interquartile ranges of the quartiles, and samples
 * beyond them are outliers. Returns null for no samples.
 */
export function boxStats(values) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) {
		return null;
	}
	const q1 = quantile(sorted, 0.25);
	const median = quantile(sorted, 0.5);
	const q3 = quantile(sorted, 0.75);
	const iqr = q3 - q1;
	const lowFence = q1 - 1.5 * iqr;
	const highFence = q3 + 1.5 * iqr;
	const inside = sorted.filter((value) => value >= lowFence && value <= highFence);
	return {
		count: sorted.length,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		q1,
		median,
		q3,
		lowWhisker: inside[0],
		highWhisker: inside[inside.length - 1],
		outliers: sorted.filter((value) => value < lowFence || value > highFence)
	};
}

export const MAX_BINS = 200;

/**
 * Bin width for a set of samples. A requested count of bins divides the
 * range evenly; automatic uses the Freedman-Diaconis width
 * (2 * IQR / cube root of n), falling back to Sturges' count (log2 n + 1)
 * when the interquartile range is zero, and never more than MAX_BINS bins.
 */
export function binWidth(sorted, requested = 0) {
	const range = sorted[sorted.length - 1] - sorted[0];
	if (range === 0) {
		return 1;
	}
	if (requested > 0) {
		return range / Math.min(requested, MAX_BINS);
	}
	const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
	const width = iqr > 0 ? (2 * iqr) / Math.cbrt(sorted.length) : range / (Math.ceil(Math.log2(sorted.length)) + 1);
	return Math.max(width, range / MAX_BINS);
}

/**
 * Histogram of several series on shared bins. Bins are [start, end), the
 * last one closed so the largest sample counts. Returns { edges, counts:
 * [[count per bin] per series], width } or null without samples.
 */
export function histogram(seriesValues, requested = 0) {
	const all = seriesValues.flat().filter(Number.isFinite).sort((a, b) => a - b);
	if (all.length === 0) {
		return null;
	}
	const width = binWidth(all, requested);
	const low = all[0];
	const high = all[all.length - 1];
	const bins = high === low ? 1 : Math.max(1, Math.ceil((high - low) / width));
	const edges = Array.from({ length: bins + 1 }, (_, index) => (index === bins ? Math.max(high, low + index * width) : low + index * width));
	const counts = seriesValues.map((values) => {
		const row = new Array(bins).fill(0);
		for (const value of values) {
			if (Number.isFinite(value)) {
				row[Math.min(bins - 1, Math.floor((value - low) / width))]++;
			}
		}
		return row;
	});
	return { edges, counts, width };
}
