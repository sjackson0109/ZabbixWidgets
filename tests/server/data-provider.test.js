/**
 * Server-side logic that only a live Zabbix would otherwise exercise: which
 * table each part of a period is read from, and how a bullet target macro is
 * resolved through templates. Runs DataProvider.php with a stand-in API.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data-provider.php');

function run(cases) {
	return JSON.parse(execFileSync('php', [script], { input: JSON.stringify(cases) }).toString());
}

const macroConfig = { target_source: 'macro', target_macro: '{$TARGET}' };

function resolve(hosts, stub) {
	return run([{ chart: 'bullet', config: macroConfig, call: 'macros', hosts, stub }])[0];
}

describe('bullet target macro resolution', () => {
	const templates = { 10: [20], 11: [], 20: [30], 30: [] };

	it('prefers the host value', () => {
		expect(resolve({ 1: [10] }, { templates, macros: { 1: '5', 10: '6' }, global: '7' })).toEqual({ 1: '5' });
	});

	it('finds a value on a nested template', () => {
		expect(resolve({ 1: [10] }, { templates, macros: { 30: '9' }, global: '7' })).toEqual({ 1: '9' });
	});

	it('prefers a nearer template level over a lower template ID further away', () => {
		expect(resolve({ 1: [11, 10] }, { templates: { ...templates, 11: [] }, macros: { 20: 'far', 11: 'near' }, global: null }))
			.toEqual({ 1: 'near' });
	});

	it('takes the lowest template ID within a level', () => {
		expect(resolve({ 1: [11, 10] }, { templates, macros: { 10: 'ten', 11: 'eleven' }, global: null })).toEqual({ 1: 'ten' });
	});

	it('falls back to the global value, and leaves the macro undefined without one', () => {
		expect(resolve({ 1: [10], 2: [] }, { templates, macros: {}, global: '7' })).toEqual({ 1: '7', 2: '7' });
		expect(resolve({ 1: [10] }, { templates, macros: {}, global: null })).toEqual([]);
	});

	it('survives templates the user cannot read and template cycles', () => {
		expect(resolve({ 1: [10, 99] }, { templates: { 10: [20], 20: [10] }, macros: {}, global: '7' })).toEqual({ 1: '7' });
	});
});

describe('history and trend planning', () => {
	const series = [
		{ itemid: '1', value_type: 0 },
		{ itemid: '2', value_type: 3 }
	];
	const hour = 3600;
	const base = 1_700_000_000 - (1_700_000_000 % hour);

	it('reads raw history for short periods', () => {
		const [plan] = run([{ chart: 'calendar_heatmap', config: { time_zone: 'UTC' }, call: 'plan', series, period: { from: base, to: base + 86400 } }]);
		expect(plan.every((read) => read.table === 'history')).toBe(true);
	});

	it('reads trends only for whole hours of float items, and history at the edges', () => {
		const period = { from: base - 600, to: base + 3 * 86400 + 600 };
		const [plan] = run([{ chart: 'calendar_heatmap', config: { time_zone: 'UTC' }, call: 'plan', series, period }]);
		expect(plan).toEqual([
			{ table: 'trends', itemids: ['1'], from: base, to: base + 3 * 86400 - 1 },
			{ table: 'history', value_type: 0, itemids: ['1'], from: period.from, to: base - 1 },
			{ table: 'history', value_type: 0, itemids: ['1'], from: base + 3 * 86400, to: period.to },
			{ table: 'history', value_type: 3, itemids: ['2'], from: period.from, to: period.to }
		]);
	});

	it('keeps raw history where trend hours would straddle midnight or a bucket', () => {
		const period = { from: base, to: base + 3 * 86400 };
		const [india, halfHourBuckets, candles] = run([
			{ chart: 'calendar_heatmap', config: { time_zone: 'Asia/Kolkata' }, call: 'plan', series, period },
			{ chart: 'heatmap', config: { bucket: '30m' }, call: 'plan', series, period },
			{ chart: 'candlestick', config: { bucket: '1h' }, call: 'plan', series, period }
		]);
		for (const plan of [india, halfHourBuckets, candles]) {
			expect(plan.every((read) => read.table === 'history')).toBe(true);
		}
	});
});
