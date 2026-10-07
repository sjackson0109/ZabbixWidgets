/** Behaviour of the C15-C20 renderers on small, hand-checked inputs. */
import { describe, expect, it } from 'vitest';
import { buildPieOption, pieSlices } from '../../src/renderers/pie.js';
import { buildLevelGaugeOption, gauges } from '../../src/renderers/level_gauge.js';
import { rankedEntities } from '../../src/renderers/ranking_bar.js';
import { pairColours, rampColour, treemapData } from '../../src/renderers/treemap.js';
import { sunburstData } from '../../src/renderers/sunburst.js';
import { buildFunnelOption, funnelView } from '../../src/renderers/funnel.js';
import { bandColours, bandIndex, sharedScale } from '../../src/data/thresholds.js';
import { buildLevelTree, limitDepth, parseLevels } from '../../src/data/levels.js';
import { chartEntities, isAdditive, sortEntities } from '../../src/data/groups.js';
import { themeByName } from '../../src/ui/theme.js';
import { host, item, payload } from '../fixtures/payload.js';

const context = { theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC' };

describe('entities', () => {
	it('keeps every item, or adds up each host', () => {
		const series = payload('pie', { series: [
			item({ hostid: '1', host: 'a', name: 'x', value: '2', units: 'B' }), item({ hostid: '1', host: 'a', name: 'y', value: '3', units: 'B' }),
			item({ hostid: '2', host: 'b', name: 'x', value: '4', units: 'B' }), item({ hostid: '2', host: 'b', name: 'y', value: null, units: 'B' })
		] }).series;
		expect(chartEntities(series, 'item').map((entity) => [entity.label, entity.value])).toEqual([['a: x', 2], ['a: y', 3], ['b: x', 4]]);
		expect(chartEntities(series, 'host').map((entity) => [entity.label, entity.value, entity.items.length])).toEqual([['a', 5, 2], ['b', 4, 1]]);
	});

	it('sorts stably by value, then label, then id', () => {
		const entities = [{ id: '3', label: 'c', value: 1 }, { id: '1', label: 'a', value: 2 }, { id: '2', label: 'b', value: 1 }];
		expect(sortEntities(entities, 'desc').map((entity) => entity.id)).toEqual(['1', '2', '3']);
		expect(sortEntities(entities, 'asc').map((entity) => entity.id)).toEqual(['2', '3', '1']);
		expect(sortEntities(entities, 'source').map((entity) => entity.id)).toEqual(['3', '1', '2']);
	});

	it('knows which units cannot be added up', () => {
		expect([isAdditive('B'), isAdditive('bps'), isAdditive(''), isAdditive('%'), isAdditive('°C'), isAdditive('!%')]).toEqual([true, true, true, false, false, false]);
	});
});

describe('C15 pie', () => {
	const series = [item({ name: 'A', value: '30' }), item({ name: 'B', value: '60' }), item({ name: 'C', value: '0' }), item({ name: 'D', value: '10' })];

	it('sorts slices and hides zero slices on request', () => {
		const { slices, total } = pieSlices(payload('pie', { config: { pie_sort: 'desc', hide_zero: true }, series }));
		expect(slices.map((slice) => slice.label)).toEqual(['B', 'A', 'D']);
		expect(total).toBe(100);
		expect(pieSlices(payload('pie', { config: { pie_sort: 'source' }, series })).slices.map((slice) => slice.label)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('labels with value and percentage and shows units in the tooltip', () => {
		const option = buildPieOption(payload('pie', { config: { pie_sort: 'source', show_value: true, show_percent: true }, series }), context);
		expect(option.series[0].label.formatter({ dataIndex: 1 })).toBe('B\n60 % · 60%');
		expect(option.series[0].radius[0]).toBe('0%');
		const tooltip = option.tooltip.formatter({ dataIndex: 0, marker: '' });
		expect(tooltip).toContain('<b>A</b>');
		expect(tooltip).toContain('30 % (30%)');
		const inside = buildPieOption(payload('pie', { config: { label_position: 'inside', show_value: false }, series }), context);
		expect(inside.series[0].label.position).toBe('inside');
		expect(inside.series[0].label.formatter({ dataIndex: 0 })).toBe('30%');
		expect(buildPieOption(payload('pie', { config: { label_position: 'none' }, series }), context).series[0].label.show).toBe(false);
	});
});

describe('thresholds', () => {
	it('picks band colours from best to worst and finds a value\'s band', () => {
		expect(bandColours(3)).toEqual(['#009E73', '#E69F00', '#B2182B']);
		expect(bandColours(3, 'lower_worse')).toEqual(['#B2182B', '#E69F00', '#009E73']);
		expect([bandIndex(10, [50, 80]), bandIndex(50, [50, 80]), bandIndex(95, [50, 80])]).toEqual([0, 1, 2]);
	});

	it('refuses shared settings whose macros differ between hosts', () => {
		const hosts = [host({ hostid: '1', macros: { '{$WARN}': '70' } }), host({ hostid: '2', name: 'B', macros: { '{$WARN}': '80' } })];
		expect(sharedScale({ thresholds: '{$WARN}' }, hosts).errors[0]).toMatch(/different values/);
		expect(sharedScale({ thresholds: '{$WARN}' }, hosts.slice(0, 1))).toMatchObject({ scale: { thresholds: [70] }, errors: [] });
	});
});

describe('C16 level gauge', () => {
	const hosts = [host({ hostid: '1', macros: { '{$MAX}': '200' } }), host({ hostid: '2', name: 'B', macros: { '{$MAX}': '50' } })];
	const data = payload('level_gauge', {
		config: { scale_min: '0', scale_max: '{$MAX}', thresholds: '40', target_value: '30' },
		series: [item({ hostid: '1', value: '100', units: 'L' }), item({ hostid: '2', host: 'B', value: '80', units: 'L' })],
		hosts
	});

	it('scales each gauge with its own host\'s macros and clamps the fill, not the value', () => {
		const [first, second] = gauges(data);
		expect([first.level, first.percent, first.above]).toEqual([0.5, 50, false]);
		expect([second.level, second.percent, second.above]).toEqual([1, 160, true]);
		expect(first.target).toBe(0.15);
		expect(first.colour).toBe(bandColours(2)[1]);
	});

	it('marks out-of-range values and draws one shape per gauge', () => {
		const option = buildLevelGaugeOption(data, context);
		expect(option.series[0].data).toEqual([[0, 0.5], [1, 1]]);
		const tooltip = option.tooltip.formatter({ dataIndex: 1 });
		expect(tooltip).toContain('Above the maximum');
		expect(tooltip).toContain('Scale: 0 L – 50 L');
		const api = { coord: ([x, y]) => [100 + x * 200, 300 - y * 280], size: () => [200, 0] };
		const shape = option.series[0].renderItem({ dataIndex: 1 }, api);
		const label = shape.children.find((child) => child.type === 'text');
		expect(label.style.text).toBe('▲ 80 L');
	});
});

describe('C17 ranking bar', () => {
	const series = ['a', 'b', 'c', 'd', 'e'].map((name, index) => item({ hostid: String(index), host: name, key: 'cpu', value: String([5, 9, 1, 9, 3][index]) }));

	it('keeps the top or bottom N and orders them', () => {
		const top = rankedEntities(payload('ranking_bar', { config: { rank_limit: 'top', rank_count: 3, rank_order: 'desc' }, series }));
		expect(top.ranked.map((entity) => entity.label)).toEqual(['b', 'd', 'a']);
		const bottom = rankedEntities(payload('ranking_bar', { config: { rank_limit: 'bottom', rank_count: 2, rank_order: 'desc' }, series }));
		expect(bottom.ranked.map((entity) => entity.label)).toEqual(['e', 'c']);
		const all = rankedEntities(payload('ranking_bar', { config: { rank_limit: 'all', rank_order: 'asc' }, series }));
		expect(all.ranked.map((entity) => entity.label)).toEqual(['c', 'e', 'a', 'b', 'd']);
	});
});

describe('hierarchy levels', () => {
	it('parses level lists and rejects unknown or misplaced levels', () => {
		expect(parseLevels('group, Host, tag:service, hosttag:site').levels).toEqual([
			{ type: 'group', name: 'group' }, { type: 'host', name: 'host' }, { type: 'tag', name: 'service' }, { type: 'host_tag', name: 'site' }
		]);
		expect(parseLevels('rack').error).toMatch(/not a hierarchy level/);
		expect(parseLevels('path, host').error).toMatch(/must come last/);
		expect(parseLevels('').error).not.toBeNull();
	});

	it('builds levels from groups, host tags and paths, and reports duplicates', () => {
		const hosts = [host({ hostid: '1', name: 'web01', groups: ['Servers/Web', 'Production'], tags: [{ tag: 'site', value: 'London' }] })];
		const series = payload('treemap', { series: [item({ hostid: '1', host: 'web01', name: 'disk/sda', value: '5' })] }).series;
		const grouped = buildLevelTree(series, hosts, parseLevels('group, host').levels);
		expect(grouped.root.children.map((node) => node.name)).toEqual(['Servers', 'Production']);
		expect(grouped.duplicated).toHaveLength(1);
		const site = buildLevelTree(series, hosts, parseLevels('hosttag:site, path').levels, { delimiter: '/' });
		expect(site.root.children[0].name).toBe('London');
		expect(site.root.children[0].children[0].name).toBe('disk');
		expect(site.root.children[0].children[0].children[0]).toMatchObject({ name: 'sda', value: 5 });
	});

	it('folds deeper levels into totals at the maximum depth', () => {
		const tree = { name: '', children: [{ name: 'a', children: [{ name: 'x', value: 2 }, { name: 'y', value: 3 }] }] };
		expect(limitDepth(tree, 1).children).toEqual([{ name: 'a', value: 5, collapsed: true }]);
		expect(limitDepth(tree, 0)).toEqual(tree);
	});
});

describe('C18 treemap', () => {
	const hosts = [host({ hostid: '1', name: 'a', groups: ['G'] }), host({ hostid: '2', name: 'b', groups: ['G'] })];

	it('pairs colour items with sized items by host, and leaves unpaired tiles neutral', () => {
		const data = payload('treemap', { config: { levels: 'host', pair_by: 'host' }, hosts, series: [
			item({ role: 'size', hostid: '1', host: 'a', value: '10' }), item({ role: 'size', hostid: '2', host: 'b', value: '20' }),
			item({ role: 'colour', hostid: '1', host: 'a', value: '75' })
		] });
		expect(pairColours(data).missing.map((entry) => entry.host)).toEqual(['b']);
		const { nodes, colours } = treemapData(data);
		expect(colours).toMatchObject({ low: 75, high: 75 });
		expect(nodes.map((node) => node.children[0].colourPosition)).toEqual([0.5, null]);
	});

	it('leaves out non-positive sizes and interpolates colours', () => {
		const data = payload('treemap', { config: { levels: 'host' }, hosts, series: [item({ role: 'size', value: '0' }), item({ role: 'size', value: '4' })] });
		expect(treemapData(data).nodes[0].children).toHaveLength(1);
		expect(rampColour(['#000000', '#808080', '#ffffff'], 0.5)).toBe('rgb(128, 128, 128)');
		expect(rampColour(['#000000', '#808080', '#ffffff'], 2)).toBe('rgb(255, 255, 255)');
	});
});

describe('C19 sunburst', () => {
	it('limits the depth and reports how many rings it draws', () => {
		const hosts = [host({ hostid: '1', name: 'a', groups: ['G'] })];
		const series = [item({ hostid: '1', host: 'a', name: 'n1', value: '1' }), item({ hostid: '1', host: 'a', name: 'n2', value: '2' })];
		expect(sunburstData(payload('sunburst', { config: { levels: 'group, host' }, hosts, series })).depth).toBe(3);
		const folded = sunburstData(payload('sunburst', { config: { levels: 'group, host', max_depth: 1 }, hosts, series }));
		expect(folded.nodes).toEqual([{ name: 'G', value: 3, itemid: undefined, collapsed: true }]);
	});
});

describe('C20 funnel', () => {
	const series = [item({ name: 'Visits', value: '200' }), item({ name: 'Carts', value: '50' }), item({ name: 'Orders', value: '10' })];
	const config = { stages: 'Visits = Visits\nOrders = Orders\nCarts = Carts', pct_first: true, pct_previous: true };

	it('keeps the listed order and computes shares of the first and previous stage', () => {
		const view = funnelView(payload('funnel', { config: { ...config, funnel_order: 'listed' }, series }));
		expect(view.map((stage) => [stage.label, stage.ofFirst, stage.ofPrevious])).toEqual([['Visits', 100, null], ['Orders', 5, 5], ['Carts', 25, 500]]);
	});

	it('orders by value only when asked', () => {
		const view = funnelView(payload('funnel', { config: { ...config, funnel_order: 'desc' }, series }));
		expect(view.map((stage) => stage.label)).toEqual(['Visits', 'Carts', 'Orders']);
		const option = buildFunnelOption(payload('funnel', { config: { ...config, funnel_order: 'desc' }, series }), context);
		expect(option.series[0].sort).toBe('none');
		expect(option.series[0].label.formatter({ dataIndex: 2 })).toBe('Orders\n10 % · 5% of first · 20% of previous');
	});
});
