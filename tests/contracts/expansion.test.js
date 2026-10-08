/** Contracts for the family options and C28-C33: what each refuses, and why. */
import { describe, expect, it } from 'vitest';
import { getChart } from '../../src/registry/index.js';
import { validate } from '../../src/validation/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { host, item, payload } from '../fixtures/payload.js';

function check(chartId, options) {
	return validate(getChart(chartId), payload(chartId, options));
}

const errors = (result) => result.errors.map((problem) => problem.code);
const warnings = (result) => result.warnings.map((problem) => problem.code);
const T0 = 1700000000;
const rows = (...values) => values.map((value, index) => [T0 + index * 60, String(value)]);

describe('C02 stacked bar presentations', () => {
	it('needs opposing items to diverge', () => {
		expect(errors(check('stacked_bar', { config: { group_by: 'host', stack_mode: 'diverging' }, series: [item({ value: '1' })] }))).toContain('missing_role');
	});

	it('refuses shares of values that do not add up', () => {
		expect(errors(check('stacked_bar', { config: { group_by: 'host', stack_mode: 'percent' }, series: [item({ units: '%' })] }))).toContain('non_additive');
	});

	it('refuses shares of negative values', () => {
		expect(errors(check('stacked_bar', { config: { group_by: 'host', stack_mode: 'percent' }, series: [item({ units: 'B', value: '-1' })] }))).toContain('negative_values');
	});
});

describe('C11 network settings', () => {
	const hosts = [host({ hostid: '1', name: 'a' }), host({ hostid: '2', name: 'b' })];

	it('needs a position for some host in the fixed layout', () => {
		const result = check('network', { config: { edge_source: 'list', edge_list: 'a -> b', network_layout: 'fixed', node_positions: '' }, hosts });
		expect(errors(result)).toContain('no_positions');
	});

	it('reports a weight item missing from the source host', () => {
		const result = check('network', { config: { edge_source: 'list', edge_list: 'a -> b | if.out' }, hosts, series: [] });
		expect(errors(result)).toContain('missing_weight_item');
	});

	it('never names a tag peer the user cannot see', () => {
		const tagged = [host({ hostid: '1', name: 'a', tags: [{ tag: 'uplink', value: 'b' }] }), host({ hostid: '2', name: 'b', tags: [{ tag: 'uplink', value: 'secret-core' }] })];
		const result = check('network', { config: { edge_source: 'tag', edge_tag: 'uplink' }, hosts: tagged });
		const messages = [...result.errors, ...result.warnings].map((problem) => problem.message).join(' ');
		expect(messages).not.toContain('secret-core');
	});
});

describe('C28 mixed line and bar', () => {
	it('allows at most two units', () => {
		const result = check('mixed', { config: { bucket: '1h', aggregation: 'avg' }, time_period: { from: T0, to: T0 + 600 }, series: [
			item({ role: 'bar', units: 'B', history: rows(1, 2) }), item({ role: 'line', units: 's', history: rows(1, 2) }), item({ role: 'line', units: '%', history: rows(1, 2) })
		] });
		expect(errors(result)).toContain('too_many_units');
	});

	it('needs whole-hour bars when trends are read', () => {
		const result = validate(getChart('mixed'), normalisePayload({
			chart: 'mixed', config: { bucket: '15m', aggregation: 'avg' }, history_source: 'mixed', time_period: { from: T0, to: T0 + 7 * 86400 },
			series: [item({ role: 'bar', units: 'B', history: rows(1, 2) })], hosts: [], errors: []
		}));
		expect(errors(result)).toContain('trend_buckets');
	});
});

describe('C29 distribution', () => {
	it('refuses hourly trends, which cannot give quartiles', () => {
		const result = validate(getChart('distribution'), normalisePayload({
			chart: 'distribution', config: { dist_view: 'boxplot' }, history_source: 'mixed', time_period: { from: T0, to: T0 + 600 },
			series: [item({ history: rows(1, 2, 3, 4, 5) })], hosts: [], errors: []
		}));
		expect(errors(result)).toContain('trends_not_allowed');
	});

	it('refuses items in different units', () => {
		const result = check('distribution', { config: {}, time_period: { from: T0, to: T0 + 600 }, series: [item({ units: 's', history: rows(1, 2, 3, 4, 5) }), item({ units: 'B', history: rows(1, 2, 3, 4, 5) })] });
		expect(errors(result)).toContain('mixed_units');
	});
});

describe('C30 parallel coordinates', () => {
	it('needs at least two axes', () => {
		expect(errors(check('parallel', { config: { parallel_axes: 'CPU = CPU*' }, series: [item(), item({ hostid: '2', host: 'B' })] }))).toContain('invalid_axes');
	});
});

describe('C31 sankey', () => {
	const flow = (from, to, value = '1', units = 'B') => item({ role: 'weight', units, value, tags: [{ tag: 'from', value: from }, { tag: 'to', value: to }] });
	const config = { source_tag: 'from', target_tag: 'to' };

	it('refuses flows that loop back', () => {
		expect(errors(check('sankey', { config, series: [flow('a', 'b'), flow('b', 'a')] }))).toContain('flow_cycle');
	});

	it('refuses negative flows and units that do not add up', () => {
		expect(errors(check('sankey', { config, series: [flow('a', 'b', '-1')] }))).toContain('negative_values');
		expect(errors(check('sankey', { config, series: [flow('a', 'b', '1', '%')] }))).toContain('non_additive');
	});
});

describe('C32 geographic site map', () => {
	it('needs at least one host with coordinates', () => {
		const result = check('geomap', { config: { geo_base: 'world' }, hosts: [{ ...host(), location: { lat: '', lon: '' } }] });
		expect(errors(result)).toContain('no_location');
	});

	it('needs exactly one item per site to colour by thresholds', () => {
		const hosts = [{ ...host(), location: { lat: '1', lon: '1' } }];
		const result = check('geomap', { config: { geo_base: 'world', site_colour: 'thresholds', thresholds: '50' }, hosts, series: [item(), item({ name: 'Other' })] });
		expect(errors(result)).toContain('ambiguous_site_value');
	});
});

describe('C33 waterfall', () => {
	it('names a step no item matches', () => {
		expect(errors(check('waterfall', { config: { waterfall_steps: '+ In = Received' }, series: [item({ name: 'Other' })] }))).toContain('missing_step');
	});

	it('warns when a measured level differs from the running total', () => {
		const result = check('waterfall', { config: { waterfall_steps: '= Open = Start\n+ In = In\n= Close = End' }, series: [
			item({ name: 'Start', units: '', value: '10' }), item({ name: 'In', units: '', value: '5' }), item({ name: 'End', units: '', value: '20' })
		] });
		expect(result.ok).toBe(true);
		expect(warnings(result)).toContain('steps_do_not_add_up');
	});
});
