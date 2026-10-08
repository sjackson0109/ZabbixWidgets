/**
 * Time buckets for bars drawn over a period (C28 Mixed Line and Bar).
 *
 * Buckets shorter than a day are aligned to the Unix epoch, as the heat map's
 * are, so the same data always lands in the same buckets. Buckets of whole
 * days follow calendar days in the dashboard user's time zone: a day starts
 * at local midnight and lasts 23, 24 or 25 hours across a daylight-saving
 * change, rather than running from one UTC midnight to the next.
 */
import { aggregateSamples, calendarDate } from './aggregate.js';

const DAY = 86400;

const OFFSET_FORMATS = new Map();

/** Offset of a time zone from UTC at an instant, in seconds. */
export function zoneOffset(clock, timeZone) {
	let format = OFFSET_FORMATS.get(timeZone);
	if (format === undefined) {
		format = new Intl.DateTimeFormat('en-US', {
			timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
		});
		OFFSET_FORMATS.set(timeZone, format);
	}
	const parts = Object.fromEntries(format.formatToParts(new Date(clock * 1000)).map((part) => [part.type, Number(part.value)]));
	const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 1000;
	return local - clock;
}

/** The instant local midnight starts a calendar date ("YYYY-MM-DD") in a time zone. */
export function localMidnight(date, timeZone) {
	const [year, month, day] = date.split('-').map(Number);
	const wall = Date.UTC(year, month - 1, day) / 1000;
	// Two passes settle the offset on either side of a daylight-saving change.
	let clock = wall - zoneOffset(wall, timeZone);
	clock = wall - zoneOffset(clock, timeZone);
	return clock;
}

/** Start of the bucket holding a clock. */
export function bucketStart(clock, bucketSeconds, timeZone = 'UTC') {
	if (bucketSeconds % DAY !== 0) {
		return Math.floor(clock / bucketSeconds) * bucketSeconds;
	}
	const days = bucketSeconds / DAY;
	const date = calendarDate(clock, timeZone);
	const [year, month, day] = date.split('-').map(Number);
	const ordinal = Date.UTC(year, month - 1, day) / 1000 / DAY;
	const first = Math.floor(ordinal / days) * days;
	return localMidnight(new Date(first * DAY * 1000).toISOString().slice(0, 10), timeZone);
}

/** End of the bucket that starts at a given instant (exclusive). */
export function bucketEnd(start, bucketSeconds, timeZone = 'UTC') {
	if (bucketSeconds % DAY !== 0) {
		return start + bucketSeconds;
	}
	// The next bucket starts at local midnight after the bucket's calendar days, however long they were.
	return bucketStart(start + bucketSeconds + 12 * 3600, bucketSeconds, timeZone);
}

/**
 * Aggregates one series' samples per bucket. Buckets without samples are
 * absent, never zero. Returns [{ start, end, value, count }] sorted by start.
 */
export function barBuckets(points, bucketSeconds, aggregation, timeZone = 'UTC') {
	const groups = new Map();
	for (const point of points) {
		const start = bucketStart(point.clock, bucketSeconds, timeZone);
		(groups.get(start) ?? groups.set(start, []).get(start)).push(point);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([start, samples]) => ({
			start,
			end: bucketEnd(start, bucketSeconds, timeZone),
			value: aggregateSamples(samples, aggregation),
			count: aggregateSamples(samples, 'count')
		}));
}
