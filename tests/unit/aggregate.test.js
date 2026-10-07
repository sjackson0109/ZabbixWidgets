import { describe, expect, it } from 'vitest';
import {
	aggregate, aggregateSamples, aggregateBuckets, aggregateByDay, alignOhlc, bucketise, calendarDate, deriveOhlc, isConsistentCandle, parseBucket
} from '../../src/data/aggregate.js';

const samples = (pairs) => pairs.map(([clock, value]) => ({ clock, value }));

describe('aggregate', () => {
	it('computes each supported function', () => {
		const values = [4, -2, 10];
		expect(aggregate(values, 'sum')).toBe(12);
		expect(aggregate(values, 'avg')).toBe(4);
		expect(aggregate(values, 'min')).toBe(-2);
		expect(aggregate(values, 'max')).toBe(10);
		expect(aggregate(values, 'count')).toBe(3);
	});

	it('returns null for an empty set except count', () => {
		expect(aggregate([], 'avg')).toBeNull();
		expect(aggregate([], 'count')).toBe(0);
	});

	it('handles large inputs without spreading arguments', () => {
		const values = Array.from({ length: 200000 }, (_, index) => index);
		expect(aggregate(values, 'max')).toBe(199999);
	});

	it('rejects unknown functions', () => {
		expect(() => aggregate([1], 'median')).toThrow();
	});
});

describe('buckets', () => {
	it('parses bucket sizes', () => {
		expect(parseBucket('15m')).toBe(900);
		expect(parseBucket('1d')).toBe(86400);
		expect(parseBucket('0h')).toBeNull();
		expect(parseBucket('hourly')).toBeNull();
	});

	it('aligns buckets to the epoch', () => {
		const result = bucketise(samples([[3599, 1], [3600, 2], [7199, 3]]), 3600);
		expect(result.map((bucket) => bucket.start)).toEqual([0, 3600]);
		expect(result[1].samples).toHaveLength(2);
	});

	it('aggregates per bucket', () => {
		expect(aggregateBuckets(samples([[0, 1], [10, 3], [3600, 5]]), 3600, 'avg'))
			.toEqual([{ start: 0, value: 2, count: 2 }, { start: 3600, value: 5, count: 1 }]);
	});
});

describe('derived OHLC', () => {
	it('uses first, max, min and last sample of each bucket', () => {
		const candles = deriveOhlc(samples([[0, 5], [10, 9], [20, 1], [30, 4], [60, 7]]), 60);
		expect(candles).toEqual([
			{ start: 0, open: 5, high: 9, low: 1, close: 4, count: 4 },
			{ start: 60, open: 7, high: 7, low: 7, close: 7, count: 1 }
		]);
		expect(candles.every(isConsistentCandle)).toBe(true);
	});

	it('produces no candles from no samples', () => {
		expect(deriveOhlc([], 60)).toEqual([]);
	});
});

describe('explicit OHLC', () => {
	it('aligns four series and reports incomplete periods', () => {
		const { candles, incomplete } = alignOhlc({
			open: samples([[0, 10], [60, 11]]),
			high: samples([[0, 12], [60, 13]]),
			low: samples([[0, 9]]),
			close: samples([[0, 11], [60, 12]])
		}, 60);
		expect(candles).toEqual([{ start: 0, open: 10, high: 12, low: 9, close: 11 }]);
		expect(incomplete).toEqual([60]);
	});

	it('detects inconsistent candles', () => {
		expect(isConsistentCandle({ open: 10, high: 9, low: 8, close: 9 })).toBe(false);
	});
});

describe('calendar aggregation', () => {
	it('uses the requested time zone for day boundaries', () => {
		// 2024-01-01 23:30 UTC is already 2 January in Tokyo.
		const clock = Date.UTC(2024, 0, 1, 23, 30) / 1000;
		expect(calendarDate(clock, 'UTC')).toBe('2024-01-01');
		expect(calendarDate(clock, 'Asia/Tokyo')).toBe('2024-01-02');
	});

	it('aggregates per day', () => {
		const day = 86400;
		const result = aggregateByDay(samples([[0, 2], [100, 4], [day, 10]]), 'sum', 'UTC');
		expect(result).toEqual([
			{ date: '1970-01-01', value: 6, count: 2 },
			{ date: '1970-01-02', value: 10, count: 1 }
		]);
	});

	it('spans year boundaries', () => {
		const result = aggregateByDay(samples([[Date.UTC(2023, 11, 31) / 1000, 1], [Date.UTC(2024, 0, 1) / 1000, 2]]), 'max', 'UTC');
		expect(result.map((entry) => entry.date)).toEqual(['2023-12-31', '2024-01-01']);
	});
});

describe('trend aggregation', () => {
	// Two hours of trends standing in for raw samples [1, 3] and [10, 20, 30].
	const trends = [
		{ clock: 0, value: 2, min: 1, max: 3, num: 2 },
		{ clock: 3600, value: 20, min: 10, max: 30, num: 3 }
	];
	const raw = samples([[0, 1], [10, 3], [3600, 10], [3610, 20], [3620, 30]]);

	it.each(['avg', 'sum', 'min', 'max', 'count'])('%s over trends equals %s over the raw samples', (fn) => {
		expect(aggregateSamples(trends, fn)).toBe(aggregate(raw.map((sample) => sample.value), fn));
	});

	it('aggregates trend rows per day', () => {
		expect(aggregateByDay(trends, 'avg', 'UTC')).toEqual([{ date: '1970-01-01', value: 12.8, count: 5 }]);
	});
});
