/**
 * Contract tests for C01-C13: valid data, invalid data, insufficient
 * dimensions, mixed units, empty data, extreme numbers and negative values.
 */
import { describe, expect, it } from 'vitest';
import { getChart } from '../../src/registry/index.js';
import { validate } from '../../src/validation/index.js';
import { host, item, payload } from '../fixtures/payload.js';

function check(chartId, options) {
	return validate(getChart(chartId), payload(chartId, options));
}

function codes(result) {
	return result.errors.map((problem) => problem.code);
}

const history = (...pairs) => pairs;

describe.each(['column', 'stacked_bar', 'doughnut'])('%s common contract', (chartId) => {
	const config = { group_by: 'host' };

	it('accepts valid numeric data', () => {
		const result = check(chartId, { config, series: [item({ value: '10' }), item({ hostid: '2', host: 'B', value: '20' })] });
		expect(result.ok).toBe(true);
	});

	it('rejects empty data', () => {
		expect(codes(check(chartId, { config, series: [] }))).toContain('missing_role');
	});

	it('rejects text items', () => {
		expect(codes(check(chartId, { config, series: [item({ value_type: 4, value: 'up' })] }))).toContain('numeric_only');
	});

	it('rejects values that do not parse', () => {
		expect(codes(check(chartId, { config, series: [item({ value: 'garbage' })] }))).toContain('invalid_value');
	});

	it('accepts very large and very small numbers', () => {
		expect(check(chartId, { config, series: [item({ value: '1e300' }), item({ value: '1e-300' })] }).ok).toBe(true);
	});

	it('reports items without data as a warning, not zero', () => {
		const result = check(chartId, { config, series: [item({ value: '5' }), item({ value: null })] });
		expect(result.ok).toBe(true);
		expect(result.warnings.map((problem) => problem.code)).toContain('missing_values');
	});
});

describe('C01 column', () => {
	it('allows negative values and mixed units', () => {
		const result = check('column', { series: [item({ value: '-5', units: '%' }), item({ value: '3', units: 'B' })] });
		expect(result.ok).toBe(true);
	});
});

describe('C02 stacked bar', () => {
	it('rejects mixed units in a stack', () => {
		const result = check('stacked_bar', { series: [item({ units: '%' }), item({ units: 'B/s' })] });
		expect(result.errors[0].message).toBe('These series cannot be combined because they use incompatible units: "%" and "B/s".');
	});

	it('requires at least two series', () => {
		expect(codes(check('stacked_bar', { series: [item({ value: '5' })] }))).toEqual(['too_few_series']);
	});

	it('allows negative values', () => {
		expect(check('stacked_bar', { series: [item({ value: '-1' }), item({ value: '2' })] }).ok).toBe(true);
	});
});

describe('C03 doughnut', () => {
	it('rejects negative segments explicitly', () => {
		expect(codes(check('doughnut', { series: [item({ value: '-1' }), item({ value: '2' })] }))).toContain('negative_values');
	});

	it('rejects mixed units', () => {
		expect(codes(check('doughnut', { series: [item({ units: '%' }), item({ units: 'B' })] }))).toContain('mixed_units');
	});
});

describe('C04 bullet', () => {
	it('requires a target source', () => {
		expect(codes(check('bullet', { series: [item({ role: 'actual' })] }))).toContain('missing_target');
	});

	it('accepts a constant target', () => {
		expect(check('bullet', { config: { target_source: 'constant', target_constant: '90' }, series: [item({ role: 'actual' })] }).ok).toBe(true);
	});

	it('rejects a non-numeric constant', () => {
		expect(codes(check('bullet', { config: { target_source: 'constant', target_constant: 'high' }, series: [item({ role: 'actual' })] })))
			.toContain('missing_target');
	});

	it('requires target items only when the target comes from items', () => {
		expect(codes(check('bullet', { config: { target_source: 'item' }, series: [item({ role: 'actual' })] }))).toEqual(['missing_role']);
		expect(check('bullet', { config: { target_source: 'constant', target_constant: '5' }, series: [item({ role: 'actual' })] }).ok)
			.toBe(true);
	});

	it('pairs target items by host and reports missing targets', () => {
		const config = { target_source: 'item', pair_by: 'host' };
		const series = [
			item({ role: 'actual', hostid: '1' }), item({ role: 'target', hostid: '1' }),
			item({ role: 'actual', hostid: '2', host: 'Host B' })
		];
		const result = check('bullet', { config, series });
		expect(result.errors[0].message).toBe('No target item found for Host B.');
	});

	it('resolves macro targets per host', () => {
		const config = { target_source: 'macro', target_macro: '{$CPU.TARGET}' };
		const hosts = [host({ hostid: '1', macros: { '{$CPU.TARGET}': '80' } }), host({ hostid: '2', name: 'Host B' })];
		const series = [item({ role: 'actual', hostid: '1' }), item({ role: 'actual', hostid: '2', host: 'Host B' })];
		expect(check('bullet', { config, series, hosts }).errors[0].message).toBe('Macro {$CPU.TARGET} is not defined as a number on Host B.');
	});
});

describe('C05 radar', () => {
	const dims = (units = '%') => ['CPU', 'Memory', 'Disk'].map((name, index) => item({ name, units, value: String(10 + index) }));

	it('accepts three comparable dimensions', () => {
		expect(check('radar', { config: { radar_scale: 'shared' }, series: dims() }).ok).toBe(true);
	});

	it('requires at least three dimensions', () => {
		expect(codes(check('radar', { config: { radar_scale: 'shared' }, series: dims().slice(0, 2) }))).toContain('too_few_dimensions');
	});

	it('rejects mixed units on a shared scale but allows them per axis', () => {
		const series = [...dims().slice(0, 2), item({ name: 'Net', units: 'bps', value: '1000' })];
		expect(codes(check('radar', { config: { radar_scale: 'shared' }, series }))).toContain('mixed_units');
		expect(check('radar', { config: { radar_scale: 'per_dimension' }, series }).ok).toBe(true);
	});

	it('rejects scales with no positive maximum', () => {
		const series = ['A', 'B', 'C'].map((name) => item({ name, value: '-1' }));
		expect(codes(check('radar', { config: { radar_scale: 'shared' }, series }))).toContain('invalid_max');
	});
});

describe('C06 heat map', () => {
	it('accepts host by item mapping', () => {
		expect(check('heatmap', { config: { heat_x: 'host', heat_y: 'item' }, series: [item()] }).ok).toBe(true);
	});

	it('validates configured colour bounds', () => {
		const config = { heat_x: 'host', heat_y: 'item', colour_min: '10', colour_max: '5' };
		expect(codes(check('heatmap', { config, series: [item()] }))).toContain('invalid_bounds');
	});

	it('requires a valid bucket on a time axis', () => {
		const config = { heat_x: 'time', heat_y: 'item', bucket: 'often' };
		expect(codes(check('heatmap', { config, series: [item()] }))).toContain('invalid_bucket');
	});
});

describe('C07 candlestick', () => {
	it('accepts derived OHLC from history', () => {
		const series = [item({ role: 'source', history: history([0, '1'], [30, '3'], [60, '2']) })];
		expect(check('candlestick', { config: { ohlc_mode: 'derived', bucket: '1m' }, series }).ok).toBe(true);
	});

	it('refuses to invent candles without history', () => {
		const series = [item({ role: 'source', history: [] })];
		expect(codes(check('candlestick', { config: { ohlc_mode: 'derived', bucket: '1m' }, series }))).toContain('no_history');
	});

	it('requires all four explicit series', () => {
		const series = [item({ role: 'open', history: history([0, '1']) })];
		expect(codes(check('candlestick', { config: { ohlc_mode: 'explicit', bucket: '1m' }, series }))).toContain('missing_role');
	});

	it('rejects inconsistent explicit candles', () => {
		const series = [
			item({ role: 'open', history: history([0, '10']) }), item({ role: 'high', history: history([0, '8']) }),
			item({ role: 'low', history: history([0, '7']) }), item({ role: 'close', history: history([0, '9']) })
		];
		expect(codes(check('candlestick', { config: { ohlc_mode: 'explicit', bucket: '1m' }, series }))).toContain('inconsistent_ohlc');
	});

	it('limits derived mode to one item', () => {
		const series = [item({ role: 'source', history: history([0, '1']) }), item({ role: 'source', history: history([0, '1']) })];
		expect(codes(check('candlestick', { config: { ohlc_mode: 'derived', bucket: '1m' }, series }))).toContain('too_many_items');
	});
});

describe('C08 bubble', () => {
	const tuple = (hostid, size = '3') => [
		item({ role: 'x', hostid, value: '1' }), item({ role: 'y', hostid, value: '2' }), item({ role: 'size', hostid, value: size })
	];

	it('accepts complete X, Y and size tuples', () => {
		expect(check('bubble', { config: { pair_by: 'host' }, series: tuple('1') }).ok).toBe(true);
	});

	it('requires all three mappings', () => {
		const result = check('bubble', { config: { pair_by: 'host' }, series: [item({ role: 'x' }), item({ role: 'y' })] });
		expect(result.errors[0].message).toBe('Bubble requires Size items: no matching items were found.');
	});

	it('reports hosts missing a dimension', () => {
		const series = [...tuple('1'), item({ role: 'x', hostid: '2', host: 'Host B' })];
		expect(codes(check('bubble', { config: { pair_by: 'host' }, series }))).toContain('incomplete_tuples');
	});

	it('rejects negative sizes but allows negative positions', () => {
		expect(codes(check('bubble', { config: { pair_by: 'host' }, series: tuple('1', '-4') }))).toContain('negative_size');
	});
});

describe('C09 gantt', () => {
	const task = (start, end) => [item({ role: 'start', value: start, units: 'unixtime' }), item({ role: 'end', value: end, units: 'unixtime' })];

	it('accepts start and end timestamps', () => {
		expect(check('gantt', { config: { gantt_timing: 'start_end', pair_by: 'host' }, series: task('1700000000', '1700003600') }).ok).toBe(true);
	});

	it('rejects an end before the start', () => {
		const result = check('gantt', { config: { gantt_timing: 'start_end', pair_by: 'host' }, series: task('1700003600', '1700000000') });
		expect(codes(result)).toContain('invalid_interval');
	});

	it('requires timing data rather than using the polling interval', () => {
		const result = check('gantt', { config: { gantt_timing: 'start_end', pair_by: 'host' }, series: [item({ role: 'start' })] });
		expect(result.errors[0].message).toBe('Gantt requires End items: no matching items were found.');
	});

	it('accepts start and duration', () => {
		const series = [item({ role: 'start', value: '1700000000' }), item({ role: 'duration', value: '600', units: 's' })];
		expect(check('gantt', { config: { gantt_timing: 'start_duration', pair_by: 'host' }, series }).ok).toBe(true);
	});
});

describe('C10 tree', () => {
	it('requires an explicit hierarchy source', () => {
		expect(codes(check('tree', { series: [item()] }))).toContain('missing_hierarchy');
	});

	it('accepts host groups, tags with names and delimited paths', () => {
		expect(check('tree', { config: { tree_source: 'host_group' }, series: [item()] }).ok).toBe(true);
		expect(check('tree', { config: { tree_source: 'tags', tree_tags: 'site, rack' }, series: [item()] }).ok).toBe(true);
		expect(check('tree', { config: { tree_source: 'item_path', tree_delimiter: '/' }, series: [item()] }).ok).toBe(true);
		expect(check('tree', { config: { tree_source: 'item_path', tree_delimiter: '' }, series: [item()] }).ok).toBe(false);
	});

	it('accepts text items as leaves', () => {
		expect(check('tree', { config: { tree_source: 'host_group' }, series: [item({ value_type: 4, value: 'OK' })] }).ok).toBe(true);
	});
});

describe('C11 network', () => {
	const hosts = [host({ hostid: '1', name: 'router' }), host({ hostid: '2', name: 'switch', tags: [{ tag: 'uplink', value: 'router' }] })];

	it('refuses to invent topology', () => {
		expect(codes(check('network', { hosts }))).toContain('no_edges');
		expect(codes(check('network', { config: { edge_source: 'list', edge_list: '' }, hosts }))).toContain('no_edges');
	});

	it('accepts explicit edges between selected hosts', () => {
		expect(check('network', { config: { edge_source: 'list', edge_list: 'router -> switch' }, hosts }).ok).toBe(true);
	});

	it('accepts edges from host tags', () => {
		expect(check('network', { config: { edge_source: 'tag', edge_tag: 'uplink' }, hosts }).ok).toBe(true);
	});

	it('reports endpoints that are not selected', () => {
		const result = check('network', { config: { edge_source: 'list', edge_list: 'router -> firewall' }, hosts });
		expect(result.errors[0].message).toBe('These relationship endpoints are not among the selected hosts: firewall.');
	});
});

describe('C12 relationship', () => {
	const tagged = (value, src = 'A', dst = 'B') => item({ role: 'weight', value, tags: [{ tag: 'src', value: src }, { tag: 'dst', value: dst }] });

	it('accepts tagged flows', () => {
		expect(check('relationship', { config: { source_tag: 'src', target_tag: 'dst' }, series: [tagged('5')] }).ok).toBe(true);
	});

	it('requires source and target tag names', () => {
		expect(codes(check('relationship', { series: [tagged('5')] }))).toContain('missing_relationship_tags');
	});

	it('rejects items missing tags and negative weights', () => {
		const config = { source_tag: 'src', target_tag: 'dst' };
		expect(codes(check('relationship', { config, series: [item({ role: 'weight' })] }))).toContain('untagged_items');
		expect(codes(check('relationship', { config, series: [tagged('-1')] }))).toContain('negative_values');
	});
});

describe('C13 calendar heat map', () => {
	it('accepts one item with history', () => {
		const series = [item({ history: history([0, '1'], [86400, '2']) })];
		expect(check('calendar_heatmap', { config: { aggregation: 'avg' }, series }).ok).toBe(true);
	});

	it('does not fall back to the last value without history', () => {
		const series = [item({ value: '5', history: [] })];
		expect(codes(check('calendar_heatmap', { config: { aggregation: 'avg' }, series }))).toContain('no_history');
	});

	it('limits the calendar to one item', () => {
		const series = [item({ history: history([0, '1']) }), item({ history: history([0, '1']) })];
		expect(codes(check('calendar_heatmap', { config: { aggregation: 'avg' }, series }))).toContain('too_many_items');
	});
});

describe('server errors', () => {
	it('are shown before any data rule runs', () => {
		const result = check('column', { series: [item()], errors: ['Too many items matched; showing the first 500.'] });
		expect(result.errors.map((problem) => problem.message)).toEqual(['Too many items matched; showing the first 500.']);
	});
});

describe('rules added with the renderers', () => {
	const period = { from: 1700000000, to: 1700000000 + 86400 * 30 };

	it('rejects unordered or non-numeric bullet ranges', () => {
		const base = { target_source: 'constant', target_constant: '80' };
		const series = [item({ role: 'actual' })];
		expect(check('bullet', { config: { ...base, ranges: '50, 80' }, series }).ok).toBe(true);
		expect(codes(check('bullet', { config: { ...base, ranges: '80, 50' }, series }))).toContain('invalid_ranges');
		expect(codes(check('bullet', { config: { ...base, ranges: 'low, high' }, series }))).toContain('invalid_ranges');
	});

	it('rejects bullet actuals with different units', () => {
		const config = { target_source: 'constant', target_constant: '80' };
		const series = [item({ role: 'actual', units: '%' }), item({ role: 'actual', units: 'B' })];
		expect(codes(check('bullet', { config, series }))).toContain('mixed_units');
	});

	it('requires different heat map axes', () => {
		expect(codes(check('heatmap', { config: { heat_x: 'item', heat_y: 'item' }, series: [item()] }))).toContain('invalid_axes');
	});

	it('limits the number of heat map buckets and candles', () => {
		const series = [item({ history: history([1700000100, '1']) })];
		expect(codes(check('heatmap', { config: { heat_x: 'time', heat_y: 'item', bucket: '1m' }, series, time_period: period })))
			.toContain('too_many_buckets');
		const candles = check('candlestick', {
			config: { ohlc_mode: 'derived', bucket: '1m' },
			series: [item({ role: 'source', history: history([1700000100, '1']) })],
			time_period: period
		});
		expect(codes(candles)).toContain('too_many_buckets');
	});

	it('rejects progress outside 0-100%', () => {
		const series = [
			item({ role: 'start', value: '1700000000' }), item({ role: 'end', value: '1700003600' }), item({ role: 'progress', value: '140' })
		];
		expect(codes(check('gantt', { config: { gantt_timing: 'start_end', pair_by: 'host' }, series }))).toContain('invalid_progress');
	});

	it('warns about flows from an endpoint to itself', () => {
		const tags = [{ tag: 'from', value: 'A' }, { tag: 'to', value: 'A' }];
		const result = check('relationship', { config: { source_tag: 'from', target_tag: 'to' }, series: [item({ role: 'weight', tags })] });
		expect(result.ok).toBe(true);
		expect(result.warnings.map((problem) => problem.code)).toContain('self_flows');
	});
});
