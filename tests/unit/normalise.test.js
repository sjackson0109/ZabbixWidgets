import { describe, expect, it } from 'vitest';
import { normaliseSeries, toNumber } from '../../src/data/normalise.js';
import { item } from '../fixtures/payload.js';

describe('toNumber', () => {
	it('parses decimals, negatives and scientific notation', () => {
		expect(toNumber('12.5')).toBe(12.5);
		expect(toNumber('-3')).toBe(-3);
		expect(toNumber('1.5e-7')).toBe(1.5e-7);
	});

	it('rejects text, blanks and non-finite values', () => {
		expect(toNumber('abc')).toBeNull();
		expect(toNumber('')).toBeNull();
		expect(toNumber('Infinity')).toBeNull();
		expect(toNumber(undefined)).toBeNull();
	});
});

describe('normaliseSeries', () => {
	it('converts numeric items and keeps metadata', () => {
		const series = normaliseSeries(item({ value: '42.1', units: 'B', tags: [{ tag: 'role', value: 'db' }] }));
		expect(series.value).toBe(42.1);
		expect(series.numeric).toBe(true);
		expect(series.tags).toEqual([{ tag: 'role', value: 'db' }]);
	});

	it('treats a missing latest value as no data, not zero', () => {
		const series = normaliseSeries(item({ value: null }));
		expect(series.value).toBeNull();
		expect(series.invalidValue).toBe(false);
	});

	it('flags numeric values that do not parse', () => {
		const series = normaliseSeries(item({ value: 'n/a' }));
		expect(series.value).toBeNull();
		expect(series.invalidValue).toBe(true);
	});

	it('keeps text values as text for text items', () => {
		const series = normaliseSeries(item({ value_type: 4, value: 'OK' }));
		expect(series.numeric).toBe(false);
		expect(series.value).toBe('OK');
	});

	it('sorts history and drops unparseable samples', () => {
		const series = normaliseSeries(item({ history: [[30, '3'], [10, '1'], [20, 'bad']] }));
		expect(series.history).toEqual([{ clock: 10, value: 1 }, { clock: 30, value: 3 }]);
	});

	it('keeps trend summaries', () => {
		const series = normaliseSeries(item({ history: [[3600, '2.5', '1', '4', '6']] }));
		expect(series.history).toEqual([{ clock: 3600, value: 2.5, min: 1, max: 4, num: 6 }]);
	});
});
