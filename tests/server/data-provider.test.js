/**
 * Server-side logic that only a live Zabbix would otherwise exercise: which
 * table each part of a period is read from, and how a bullet target macro is
 * resolved through templates. Runs DataProvider.php with a stand-in API.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

	it('draws hourly trends of both numeric types for time series, but never for state timelines', () => {
		const period = { from: base, to: base + 3 * 86400 };
		const [line, states] = run([
			{ chart: 'line', config: {}, call: 'plan', series, period },
			{ chart: 'state_timeline', config: {}, call: 'plan', series, period }
		]);
		expect(line.filter((read) => read.table === 'trends').map((read) => read.itemids)).toEqual([['1'], ['2']]);
		expect(states.every((read) => read.table === 'history')).toBe(true);
	});

	it('reads raw history only for distributions, and trends for the bars and lines of a mixed chart', () => {
		const period = { from: base, to: base + 3 * 86400 };
		const [distribution, mixed] = run([
			{ chart: 'distribution', config: {}, call: 'plan', series, period },
			{ chart: 'mixed', config: { bucket: '1h' }, call: 'plan', series, period }
		]);
		expect(distribution.every((read) => read.table === 'history')).toBe(true);
		expect(mixed.some((read) => read.table === 'trends')).toBe(true);
	});

	it('orders samples by clock and then nanoseconds', () => {
		const [order] = run([{ chart: 'line', config: {}, call: 'order', rows: [
			{ clock: '20', ns: '5' }, { clock: '10', ns: '900000000' }, { clock: '20', ns: '1' }, { clock: '10', ns: '100' }
		] }]);
		expect(order).toEqual(['10.100', '10.900000000', '20.1', '20.5']);
	});
});

describe('map files', () => {
	const folder = mkdtempSync(path.join(tmpdir(), 'geo-'));
	writeFileSync(path.join(folder, 'sites.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: null }] }));
	writeFileSync(path.join(folder, 'point.geojson'), JSON.stringify({ type: 'Point', coordinates: [0, 0] }));
	const load = (...names) => run(names.map((name) => ({ chart: 'geomap', config: {}, call: 'geo', name, folder })));

	it('reads a feature collection by plain name, with or without the extension', () => {
		expect(load('sites', 'sites.geojson').map((result) => result.features)).toEqual([1, 1]);
	});

	it('refuses paths, missing files and other GeoJSON', () => {
		const [traversal, absolute, missing, point] = load('../sites', '/etc/passwd', 'nowhere', 'point');
		expect(traversal.error).toMatch(/must be the name/);
		expect(absolute.error).toMatch(/must be the name/);
		expect(missing.error).toMatch(/is not in the module/);
		expect(point.error).toMatch(/not a GeoJSON feature collection/);
	});
});

describe('limits and settings', () => {
	it('reports more items than the limit instead of showing part of them', () => {
		const [within, over] = run([
			{ chart: 'lld_table', config: {}, call: 'items', stub: { items: 500 } },
			{ chart: 'lld_table', config: {}, call: 'items', stub: { items: 900 } }
		]);
		expect(within).toEqual({ count: 500, errors: [] });
		expect(over.count).toBe(0);
		expect(over.errors).toEqual(['More than 500 items match "ZW *". Narrow the item pattern.']);
	});

	it('reads plain update intervals and leaves the rest to the browser', () => {
		const [delays] = run([{ chart: 'column', config: {}, call: 'delay', delays: ['30s', '1m', '60', '1m;50s/1-7,00:00-24:00', '{$DELAY}', '0', 'wd1-5h9'] }]);
		expect(delays).toEqual([30, 60, 60, 60, null, null, null]);
	});

	it('resolves macros only from settings that are shown', () => {
		const bullet = (target_source) => ({ chart: 'bullet', call: 'macro_names', config: {
			target_source, target_macro: '{$CPU.TARGET}', pair_by: 'host', group_by: 'host'
		} });
		expect(run([bullet('macro'), bullet('constant')])).toEqual([['{$CPU.TARGET}'], []]);
	});

	it('resolves macros from every shown band and axis setting', () => {
		const [bands, matrix, plain] = run([
			{ chart: 'threshold_band', call: 'macro_names', config: { thresholds: '{$WARN}, {$HIGH}', target_value: '{$GOAL}', y_min: '0', y_max: '{$MAX}' } },
			{ chart: 'status_matrix', call: 'macro_names', config: { colour_by: 'thresholds', thresholds: '{$WARN}' } },
			{ chart: 'status_matrix', call: 'macro_names', config: { colour_by: 'severity', thresholds: '{$WARN}' } }
		]);
		expect(bands.sort()).toEqual(['{$GOAL}', '{$HIGH}', '{$MAX}', '{$WARN}']);
		expect(matrix).toEqual(['{$WARN}']);
		expect(plain).toEqual([]);
	});
});

describe('removed charts', () => {
	const options = (selected) => run([{ chart: 'column', config: {}, call: 'form_options', selected }])[0];

	it('leaves a removed chart out of the chart type list', () => {
		for (const selected of [null, 1]) {
			const list = options(selected);
			expect(Object.keys(list)).not.toContain('27');
			expect(Object.values(list)).not.toContain('Switch Port Panel');
		}
	});

	it('lists a removed chart only for a widget that still uses it, so its stored value stays valid', () => {
		expect(options(27)['27']).toBe('Switch Port Panel (removed)');
	});
});
