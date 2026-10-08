import { describe, expect, it } from 'vitest';
import { displayUnits, formatDuration, formatValue, scaleValue } from '../../src/data/units.js';

describe('formatValue', () => {
	it('uses SI prefixes for ordinary units', () => {
		expect(formatValue(1500, 'bps')).toBe('1.5 Kbps');
		expect(formatValue(2_500_000, 'Hz')).toBe('2.5 MHz');
	});

	it('uses 1024-based prefixes for bytes and byte rates', () => {
		expect(formatValue(1536, 'B')).toBe('1.5 KB');
		expect(formatValue(1024 ** 3, 'Bps')).toBe('1 GBps');
	});

	it('does not scale units Zabbix leaves alone', () => {
		expect(formatValue(1500, '%')).toBe('1500 %');
		expect(formatValue(2500, 'ms')).toBe('2500 ms');
		expect(formatValue(4000, 'rpm')).toBe('4000 rpm');
	});

	it('suppresses conversion for units prefixed with "!"', () => {
		expect(formatValue(1500, '!B')).toBe('1500 B');
	});

	it('keeps negative values negative', () => {
		expect(formatValue(-2048, 'B')).toBe('-2 KB');
	});

	it('handles very small and very large numbers', () => {
		expect(formatValue(0.000123, '', 6)).toBe('0.000123');
		expect(formatValue(1e21, 'B')).toBe('867.36 EB');
	});

	it('formats durations and timestamps', () => {
		expect(formatValue(90061, 'uptime')).toBe('1d 1h 1m');
		expect(formatValue(42, 's')).toBe('42s');
		expect(formatValue(0, 'unixtime')).toBe('1970-01-01 00:00:00');
	});

	it('returns empty text for missing values', () => {
		expect(formatValue(null, '%')).toBe('');
	});
});

describe('unit helpers', () => {
	it('drops the suppression marker for display', () => {
		expect(displayUnits('!B')).toBe('B');
		expect(displayUnits(undefined)).toBe('');
	});

	it('scales without formatting', () => {
		expect(scaleValue(3000, 'B')).toEqual({ value: 3000 / 1024, prefix: 'K', units: 'B' });
	});

	it('formats short durations', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(0.25)).toBe('0.25s');
		expect(formatDuration(2.5)).toBe('2.5s');
		expect(formatDuration(61.5)).toBe('1m 2s');
		expect(formatDuration(-3600)).toBe('-1h');
	});
});
