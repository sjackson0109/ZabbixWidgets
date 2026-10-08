/**
 * The presentation options added to existing families and the C28-C33
 * renderers: option shapes on hand-checked inputs, and every variant drawn
 * through the module's own ECharts build without warnings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SVGRenderer } from 'echarts/renderers';
import { echarts } from '../../src/echarts.js';
import { getChart } from '../../src/registry/index.js';
import { getRenderer } from '../../src/renderers/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { validate } from '../../src/validation/index.js';
import { buildStackedBarOption, incompleteCategories } from '../../src/renderers/stacked_bar.js';
import { pieGeometry } from '../../src/renderers/common.js';
import { buildLevelGaugeOption, dialLayout } from '../../src/renderers/level_gauge.js';
import { buildNetworkOption, linkWidth, networkGraph } from '../../src/renderers/network.js';
import { buildTreeOption } from '../../src/renderers/tree.js';
import { buildMixedOption, mixedSeries } from '../../src/renderers/mixed.js';
import { buildDistributionOption } from '../../src/renderers/distribution.js';
import { buildSankeyOption, findCycle } from '../../src/renderers/sankey.js';
import { buildWaterfallOption } from '../../src/renderers/waterfall.js';
import { buildGeomapOption, geoSites, viewBox } from '../../src/renderers/geomap.js';
import { buildColumnOption } from '../../src/renderers/column.js';
import { themeByName } from '../../src/ui/theme.js';
import { host, item, payload } from '../fixtures/payload.js';
import { VARIANTS as GALLERY, sample, variant } from '../fixtures/samples.js';

echarts.use([SVGRenderer]);

const context = { theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC' };

describe('C01 column orientation', () => {
	it('puts categories on the vertical axis when horizontal', () => {
		const series = [item({ hostid: '1', host: 'a', value: '1' }), item({ hostid: '2', host: 'b', value: '2' })];
		const option = buildColumnOption(payload('column', { config: { bar_orientation: 'horizontal' }, series }), context);
		expect(option.yAxis.type).toBe('category');
		expect(option.xAxis.type).toBe('value');
	});
});

describe('C02 stacked bar presentations', () => {
	const series = [
		item({ hostid: '1', host: 'a', name: 'User', key: 'u', value: '1' }),
		item({ hostid: '1', host: 'a', name: 'System', key: 's', value: '3' }),
		item({ hostid: '2', host: 'b', name: 'User', key: 'u', value: '2' }),
		item({ hostid: '2', host: 'b', name: 'System', key: 's', value: null })
	];

	it('draws shares of each category, leaving out a category with a missing member', () => {
		const shown = payload('stacked_bar', { config: { group_by: 'host', stack_mode: 'percent' }, series });
		const option = buildStackedBarOption(shown, context);
		expect(option.series.map((entry) => entry.data)).toEqual([[25, null], [75, null]]);
		expect(option.xAxis).toMatchObject({ min: 0, max: 100 });
		expect(incompleteCategories(shown).map((entry) => entry.label)).toEqual(['b']);
	});

	it('leaves out a category where a member has no item at all', () => {
		const shown = payload('stacked_bar', { config: { group_by: 'host', stack_mode: 'percent' }, series: series.slice(0, 3) });
		const option = buildStackedBarOption(shown, context);
		expect(option.series.map((entry) => entry.data)).toEqual([[25, null], [75, null]]);
		expect(incompleteCategories(shown).map((entry) => entry.label)).toEqual(['b']);
	});

	it('plots opposing values below zero on the same stack, labelled by magnitude', () => {
		const option = buildStackedBarOption(payload('stacked_bar', { config: { group_by: 'host', stack_mode: 'diverging', stack_orientation: 'vertical' }, series: [
			item({ hostid: '1', host: 'a', name: 'In', value: '5' }), item({ role: 'opposing', hostid: '1', host: 'a', name: 'Out', value: '3' })
		] }), context);
		expect(option.series.map((entry) => [entry.stack, entry.data])).toEqual([['total', [5]], ['total', [-3]]]);
		expect(option.xAxis.type).toBe('category');
		expect(option.yAxis.axisLabel.formatter(-3)).toBe('3 %');
	});
});

describe('pie geometry', () => {
	it('uses the chart defaults unless radii are set, and keeps the hole inside', () => {
		expect(pieGeometry({}, [0, 70])).toEqual({ radius: ['0%', '70%'], roseType: undefined });
		expect(pieGeometry({ inner_radius: 90, outer_radius: 60, pie_rose: 'area' }, [45, 70])).toEqual({ radius: ['55%', '60%'], roseType: 'area' });
	});
});

describe('C16 gauge styles', () => {
	const gaugePayload = (style) => payload('level_gauge', {
		config: { gauge_style: style, scale_min: '0', scale_max: '100', target_value: '70', thresholds: '60, 85', threshold_order: 'higher_worse', gauge_display: 'native', show_value: true },
		series: [item({ name: 'Level', units: '%', value: '45' }), item({ hostid: '2', host: 'B', name: 'Level', units: '%', value: '90' })]
	});

	it('keeps the level tube as the default', () => {
		expect(buildLevelGaugeOption(gaugePayload('level'), context).series.some((entry) => entry.type === 'gauge')).toBe(false);
	});

	it.each(['dial', 'progress', 'ring'])('draws a %s gauge per item with the target', (style) => {
		const option = buildLevelGaugeOption(gaugePayload(style), context);
		const gauges = option.series.filter((entry) => entry.type === 'gauge');
		expect(gauges.length).toBeGreaterThanOrEqual(2);
		expect(gauges[0].min).toBe(0);
		expect(gauges[0].max).toBe(100);
	});

	it('lays gauges out in a grid', () => {
		expect(dialLayout(4).map((cell) => cell.center)).toHaveLength(4);
	});
});

describe('C11 network options', () => {
	const hosts = [
		host({ hostid: '1', name: 'core', groups: ['Core'] }),
		host({ hostid: '2', name: 'edge', groups: ['Edge'] }),
		host({ hostid: '3', name: 'spare', groups: ['Edge'] })
	];
	const series = [item({ hostid: '1', host: 'core', key: 'net.out', value: '400', units: 'bps' })];

	it('weights links by an item on the source host and leaves an unmeasured link thin and dashed', () => {
		const graph = networkGraph(payload('network', { config: { edge_source: 'list', edge_list: 'core -> edge | net.out\nedge -> spare | net.out' }, hosts, series }));
		expect(graph.links.map((link) => link.weight?.value ?? null)).toEqual([400, null]);
		const option = buildNetworkOption(payload('network', { config: { edge_source: 'list', edge_list: 'core -> edge | net.out\nedge -> spare | net.out' }, hosts, series }), context);
		expect(option.series[0].links.map((link) => link.lineStyle.type)).toEqual(['solid', 'dashed']);
		expect(linkWidth({ value: 200 }, 400)).toBeCloseTo(4.75);
	});

	it('draws only listed nodes at their fixed positions', () => {
		const option = buildNetworkOption(payload('network', {
			config: { edge_source: 'list', edge_list: 'core -> edge', network_layout: 'fixed', node_positions: 'core = 10, 10\nedge = 90, 10' }, hosts
		}), context);
		expect(option.series[0].layout).toBe('none');
		expect(option.series[0].data.map((node) => [node.name, node.x, node.y])).toEqual([['core', 10, 10], ['edge', 90, 10]]);
	});

	it('colours nodes by host group, merges undirected duplicates and keeps remembered positions in the force layout', () => {
		const option = buildNetworkOption(payload('network', {
			config: { edge_source: 'list', edge_list: 'core -> edge\nedge -> core', edge_direction: 'undirected', network_layout: 'force', node_category: 'group' }, hosts
		}), { ...context, state: { nodePositions: { 1: [5, 6] } } });
		const graph = option.series[0];
		expect(graph.categories.map((entry) => entry.name)).toEqual(['Core', 'Edge']);
		expect(graph.links).toHaveLength(1);
		expect(graph.edgeSymbol).toEqual(['none', 'none']);
		expect(graph.data[0]).toMatchObject({ x: 5, y: 6 });
	});
});

describe('C10 tree layouts', () => {
	it.each([['radial', 'layout', 'radial'], ['bt', 'orient', 'BT'], ['rl', 'orient', 'RL']])('%s', (layout, key, value) => {
		const option = buildTreeOption(payload('tree', { config: { tree_source: 'host_group', tree_layout: layout }, hosts: [host({ groups: ['A/B'] })], series: [item()] }), context);
		expect(option.series[0][key]).toBe(value);
	});
});

describe('C28 mixed line and bar', () => {
	const HOUR = 3600;
	const T0 = 1700006400;
	const rows = (values) => values.map((value, index) => [T0 + index * HOUR, String(value)]);

	it('aggregates bars per bucket and draws stepped lines on their own axis', () => {
		const shown = payload('mixed', {
			config: { bucket: '2h', aggregation: 'sum', line_step: 'after' },
			series: [item({ role: 'bar', name: 'Orders', units: '', history: rows([1, 2, 3, 4]) }), item({ role: 'line', name: 'Latency', units: 's', history: rows([0.1, 0.2, 0.3, 0.4]) })],
			time_period: { from: T0, to: T0 + 4 * HOUR }
		});
		const { bars } = mixedSeries(shown, context);
		expect(bars[0].buckets.map((bucket) => bucket.value)).toEqual([3, 7]);
		const option = buildMixedOption(shown, context);
		expect(option.yAxis).toHaveLength(2);
		expect(option.series.find((entry) => entry.type === 'line')).toMatchObject({ step: 'end', smooth: false });
	});
});

describe('C29 distribution', () => {
	const values = [1, 2, 3, 4, 5, 6, 7, 8, 100];
	const shown = (view) => payload('distribution', {
		config: { dist_view: view, hist_bins: 0, show_outliers: true },
		series: [item({ units: 'ms', history: values.map((value, index) => [1700000000 + index * 60, String(value)]) })],
		time_period: { from: 1700000000, to: 1700001000 }
	});

	it('draws the five-number summary and the outliers', () => {
		const option = buildDistributionOption(shown('boxplot'), context);
		expect(option.series[0].data[0]).toEqual([1, 3, 5, 7, 8]);
		expect(option.series[1].data).toEqual([[0, 100]]);
	});

	it('draws a histogram that counts every sample once', () => {
		const option = buildDistributionOption(shown('histogram'), context);
		const counted = option.series.flatMap((entry) => entry.data.map((bin) => bin[2])).reduce((sum, count) => sum + count, 0);
		expect(counted).toBe(values.length);
	});
});

describe('C31 sankey', () => {
	it('finds a loop in the flows', () => {
		expect(findCycle([{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' }])).toEqual(['a', 'b', 'c', 'a']);
		expect(findCycle([{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }])).toEqual([]);
	});

	it('adds up items for the same pair', () => {
		const flow = (value) => item({ role: 'weight', units: 'B', value, tags: [{ tag: 'from', value: 'a' }, { tag: 'to', value: 'b' }] });
		const option = buildSankeyOption(payload('sankey', { config: { source_tag: 'from', target_tag: 'to' }, series: [flow('2'), flow('3')] }), context);
		expect(option.series[0].links).toEqual([{ source: 'a', target: 'b', value: 5 }]);
	});
});

describe('C33 waterfall', () => {
	it('draws one bar per step from its start to its end', () => {
		const option = buildWaterfallOption(payload('waterfall', {
			config: { waterfall_steps: '= Open = Start\n- Out = Shipped\n= Close' },
			series: [item({ name: 'Start', value: '10' }), item({ name: 'Shipped', value: '4' })]
		}), context);
		expect(option.series[0].data).toEqual([[0, 0, 10], [1, 10, 6], [2, 0, 6]]);
	});
});

describe('C32 geographic site map', () => {
	const hosts = [
		{ ...host({ hostid: '1', name: 'london' }), location: { lat: '51.5', lon: '-0.12' } },
		{ ...host({ hostid: '2', name: 'paris' }), location: { lat: '48.85', lon: '2.35' } },
		{ ...host({ hostid: '3', name: 'nowhere' }), location: { lat: '', lon: '' } },
		{ ...host({ hostid: '4', name: 'broken' }), location: { lat: '95', lon: '0' } }
	];

	it('places only hosts with valid inventory coordinates', () => {
		const sites = geoSites(payload('geomap', { hosts, series: [] }));
		expect(sites.map((site) => [site.name, site.coords])).toEqual([['london', [-0.12, 51.5]], ['paris', [2.35, 48.85]]]);
		const [[west, north], [east, south]] = viewBox(sites);
		expect(west).toBeLessThan(-0.12);
		expect(east).toBeGreaterThan(2.35);
		expect(north).toBeGreaterThan(51.5);
		expect(south).toBeLessThan(48.85);
	});

	it('reports hosts it cannot place', () => {
		const result = validate(getChart('geomap'), payload('geomap', { config: { geo_base: 'world', site_colour: 'single' }, hosts, series: [] }));
		expect(result.ok).toBe(true);
		expect(result.warnings.map((problem) => problem.code)).toEqual(expect.arrayContaining(['invalid_location', 'no_location']));
	});

	it('draws links between placed sites and keeps zoom across refreshes', () => {
		const option = buildGeomapOption(payload('geomap', { config: { geo_base: 'world', geo_links: 'london -> paris\nlondon -> nowhere' }, hosts, series: [] }), {
			...context, state: { roam: { zoom: 3, center: [1, 50] } }
		});
		expect(option.series[0].data).toHaveLength(1);
		expect(option.geo).toMatchObject({ zoom: 3, center: [1, 50] });
	});
});

/** Every new presentation, drawn by ECharts. */
const VARIANTS = [
	['line', { line_step: 'after' }], ['line', { line_step: 'before' }], ['line', { line_step: 'middle' }],
	['column', { bar_orientation: 'horizontal' }],
	['stacked_bar', { stack_mode: 'percent' }], ['stacked_bar', { stack_mode: 'percent', stack_orientation: 'vertical' }],
	['pie', { pie_rose: 'radius', inner_radius: 20 }], ['doughnut', { pie_rose: 'area', label_position: 'inside' }],
	['bubble', { bubble_size: 'none' }],
	['level_gauge', { gauge_style: 'dial' }], ['level_gauge', { gauge_style: 'progress' }], ['level_gauge', { gauge_style: 'ring' }],
	['network', { network_layout: 'force', node_category: 'group', edge_direction: 'undirected' }],
	['tree', { tree_layout: 'radial' }], ['tree', { tree_layout: 'tb' }],
	['mixed', { line_step: 'after', aggregation: 'max' }],
	['distribution', { dist_view: 'histogram' }], ['distribution', { show_outliers: false }],
	['sankey', { sankey_orient: 'vertical', sankey_align: 'left' }],
	['geomap', { geo_base: 'none', site_colour: 'single' }]
];

describe.each(VARIANTS.map(([id, config]) => [`${id} ${JSON.stringify(config)}`, id, config]))('%s', (_, id, config) => {
	let warn;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes its contract and renders', () => {
		const raw = sample(id);
		raw.config = { ...raw.config, ...config };
		if (id === 'bubble' && config.bubble_size === 'none') {
			raw.series = raw.series.filter((entry) => entry.role !== 'size');
		}
		if (config.stack_mode === 'percent') {
			// Shares need values that add up.
			raw.series = raw.series.map((entry) => ({ ...entry, units: 'B' }));
		}
		const shown = normalisePayload(raw);
		expect(validate(getChart(id), shown).errors).toEqual([]);
		const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 640, height: 320 });
		try {
			chart.setOption(getRenderer(getChart(id).renderer).buildOption(shown, { ...context, timeZone: 'Europe/London' }));
			expect(chart.renderToSVGString().length).toBeGreaterThan(1000);
		}
		finally {
			chart.dispose();
		}
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('gallery variants', () => {
	it.each(Object.keys(GALLERY))('%s passes its contract', (name) => {
		const shown = normalisePayload(variant(name));
		expect(validate(getChart(shown.chart), shown).errors).toEqual([]);
	});
});
