/**
 * Deterministic aggregation of real samples. Nothing here invents values: an
 * empty input produces null (or no bucket), never a placeholder.
 */

export const AGGREGATIONS = Object.freeze(['avg', 'sum', 'min', 'max', 'count']);

export function aggregate(values, fn) {
	if (fn === 'count') {
		return values.length;
	}
	if (values.length === 0) {
		return null;
	}
	switch (fn) {
		case 'sum':
			return values.reduce((total, value) => total + value, 0);
		case 'avg':
			return values.reduce((total, value) => total + value, 0) / values.length;
		case 'min':
			return values.reduce((min, value) => (value < min ? value : min), values[0]);
		case 'max':
			return values.reduce((max, value) => (value > max ? value : max), values[0]);
		default:
			throw new Error(`Unsupported aggregation: ${fn}`);
	}
}

/**
 * Aggregates samples that may be hourly trend summaries ({ value: avg, min,
 * max, num }) mixed with raw samples. A trend contributes avg * num to sums
 * and num to counts. This matches raw history only when each trend hour lies
 * wholly inside the bucket and the stored average is precise; the server
 * enforces the first and uses trends only for floating-point items (see
 * DataProvider::planReads), so the remaining difference is floating-point
 * rounding of the stored average.
 */
export function aggregateSamples(samples, fn) {
	if (!samples.some((sample) => sample.num !== undefined)) {
		return aggregate(samples.map((sample) => sample.value), fn);
	}
	const count = samples.reduce((total, sample) => total + (sample.num ?? 1), 0);
	const sum = samples.reduce((total, sample) => total + sample.value * (sample.num ?? 1), 0);
	switch (fn) {
		case 'count':
			return count;
		case 'sum':
			return sum;
		case 'avg':
			return count === 0 ? null : sum / count;
		case 'min':
			return aggregate(samples.map((sample) => sample.min ?? sample.value), 'min');
		case 'max':
			return aggregate(samples.map((sample) => sample.max ?? sample.value), 'max');
		default:
			throw new Error(`Unsupported aggregation: ${fn}`);
	}
}

const BUCKET_UNITS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/** Parses a bucket size such as "15m", "1h" or "1d" into seconds. */
export function parseBucket(text) {
	const match = /^\s*(\d+)\s*([smhdw])\s*$/.exec(String(text ?? ''));
	if (match === null || Number(match[1]) === 0) {
		return null;
	}
	return Number(match[1]) * BUCKET_UNITS[match[2]];
}

/**
 * Groups samples into fixed buckets aligned to the Unix epoch, so the same
 * data always lands in the same buckets regardless of when it is requested.
 * Samples must be sorted by clock.
 */
export function bucketise(samples, bucketSeconds) {
	if (!Number.isInteger(bucketSeconds) || bucketSeconds <= 0) {
		throw new Error('Bucket size must be a positive whole number of seconds.');
	}
	const buckets = new Map();
	for (const sample of samples) {
		const start = Math.floor(sample.clock / bucketSeconds) * bucketSeconds;
		if (!buckets.has(start)) {
			buckets.set(start, []);
		}
		buckets.get(start).push(sample);
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([start, bucketSamples]) => ({ start, samples: bucketSamples }));
}

export function aggregateBuckets(samples, bucketSeconds, fn) {
	return bucketise(samples, bucketSeconds).map(({ start, samples: bucketSamples }) => ({
		start,
		value: aggregateSamples(bucketSamples, fn),
		count: aggregateSamples(bucketSamples, 'count')
	}));
}

/**
 * Derives OHLC candles from one history series:
 * open = first sample, high = max, low = min, close = last sample.
 */
export function deriveOhlc(samples, bucketSeconds) {
	return bucketise(samples, bucketSeconds).map(({ start, samples: bucketSamples }) => {
		const values = bucketSamples.map((sample) => sample.value);
		return {
			start,
			open: values[0],
			high: aggregate(values, 'max'),
			low: aggregate(values, 'min'),
			close: values[values.length - 1],
			count: values.length
		};
	});
}

/**
 * Aligns four explicit OHLC series into candles. In each bucket the last
 * sample of each series is used. Buckets missing any of the four are reported
 * as incomplete rather than filled in.
 */
export function alignOhlc({ open, high, low, close }, bucketSeconds) {
	const lastPerBucket = (samples) => new Map(
		bucketise(samples, bucketSeconds).map(({ start, samples: s }) => [start, s[s.length - 1].value])
	);
	const parts = { open: lastPerBucket(open), high: lastPerBucket(high), low: lastPerBucket(low), close: lastPerBucket(close) };
	const starts = [...new Set(Object.values(parts).flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);

	const candles = [];
	const incomplete = [];
	for (const start of starts) {
		if (Object.values(parts).every((map) => map.has(start))) {
			candles.push({
				start,
				open: parts.open.get(start),
				high: parts.high.get(start),
				low: parts.low.get(start),
				close: parts.close.get(start)
			});
		}
		else {
			incomplete.push(start);
		}
	}
	return { candles, incomplete };
}

export function isConsistentCandle({ open, high, low, close }) {
	return high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
}

/** Calendar date (YYYY-MM-DD) of a Unix timestamp in the given IANA time zone. */
export function calendarDate(clock, timeZone) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(clock * 1000));
}

/** Aggregates samples per calendar day in the given time zone. */
export function aggregateByDay(samples, fn, timeZone) {
	const days = new Map();
	for (const sample of samples) {
		const day = calendarDate(sample.clock, timeZone);
		if (!days.has(day)) {
			days.set(day, []);
		}
		days.get(day).push(sample);
	}
	return [...days.entries()]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([date, daySamples]) => ({
			date,
			value: aggregateSamples(daySamples, fn),
			count: aggregateSamples(daySamples, 'count')
		}));
}
