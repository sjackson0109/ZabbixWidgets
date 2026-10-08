// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const instance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn(), dispose: vi.fn(), on: vi.fn(), getOption: vi.fn() };
vi.mock('../../src/echarts.js', () => ({ echarts: { init: vi.fn(() => instance) } }));

const { ChartController, restoreView } = await import('../../src/ui/controller.js');
const { echarts } = await import('../../src/echarts.js');

function widgetRoot() {
	const root = document.createElement('div');
	root.className = 'zw-charts';
	root.innerHTML = '<div class="zw-charts-canvas"></div><div class="zw-charts-messages"></div>';
	document.body.append(root);
	return root;
}

const goodPayload = {
	chart: 'column',
	config: { group_by: 'host', show_legend: true, decimals: 2 },
	series: [{ itemid: '1', role: 'value', hostid: '1', host: 'web01', name: 'CPU', units: '%', value_type: 0, value: '5', tags: [] }]
};

describe('ChartController', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		document.body.replaceChildren();
	});

	it('renders a valid payload into its own canvas and reuses the instance', () => {
		const root = widgetRoot();
		const controller = new ChartController(root);
		controller.render(goodPayload);
		controller.render(goodPayload);
		expect(echarts.init).toHaveBeenCalledTimes(1);
		expect(echarts.init.mock.calls[0][0]).toBe(root.querySelector('.zw-charts-canvas'));
		expect(instance.setOption).toHaveBeenCalledTimes(2);
	});

	it('shows contract errors as text instead of a chart', () => {
		const root = widgetRoot();
		const controller = new ChartController(root);
		const hostile = { ...goodPayload, chart: 'bubble', series: [{ ...goodPayload.series[0], role: 'x', name: '<script>alert(1)</script>' }] };
		const result = controller.render(hostile);
		expect(result.ok).toBe(false);
		expect(root.querySelector('.zw-charts-canvas').hidden).toBe(true);
		expect(root.querySelector('.zw-charts-errors').textContent).toContain('Bubble requires Y items');
		expect(root.querySelector('script')).toBeNull();
	});

	it('reports server errors such as missing hosts', () => {
		const root = widgetRoot();
		new ChartController(root).render({ chart: 'column', errors: ['Select host groups or hosts.'] });
		expect(root.querySelector('.zw-charts-errors').textContent).toBe('Select host groups or hosts.');
	});

	it('clears a previous chart when the data becomes invalid', () => {
		const root = widgetRoot();
		const controller = new ChartController(root);
		controller.render(goodPayload);
		controller.render({ ...goodPayload, series: [] });
		expect(instance.clear).toHaveBeenCalled();
	});

	it('disposes its instance', () => {
		const controller = new ChartController(widgetRoot());
		controller.render(goodPayload);
		controller.dispose();
		expect(instance.dispose).toHaveBeenCalled();
		expect(controller.instance).toBeNull();
	});

	it('keeps two widgets independent', () => {
		const first = widgetRoot();
		const second = widgetRoot();
		new ChartController(first).render(goodPayload);
		new ChartController(second).render({ chart: 'column', errors: ['Second widget problem'] });
		expect(first.querySelector('.zw-charts-errors')).toBeNull();
		expect(second.querySelector('.zw-charts-errors').textContent).toBe('Second widget problem');
	});

	it('draws HTML renderers without an ECharts instance and switches back cleanly', () => {
		const root = widgetRoot();
		const controller = new ChartController(root);
		controller.render(goodPayload);
		const table = { chart: 'lld_table', config: { row_identity: 'item' }, series: [{ ...goodPayload.series[0], name: 'Disk /' }] };
		expect(controller.render(table).ok).toBe(true);
		expect(instance.dispose).toHaveBeenCalled();
		expect(root.querySelector('.zw-charts-canvas').dataset.zwView).toBe('dom');
		expect(root.querySelector('.zw-charts-canvas table')).not.toBeNull();
		controller.render(goodPayload);
		expect(root.querySelector('.zw-charts-canvas table')).toBeNull();
		expect(echarts.init).toHaveBeenCalledTimes(2);
	});

	it('keeps table sorting across refreshes but not across chart types', () => {
		const controller = new ChartController(widgetRoot());
		const table = { chart: 'lld_table', config: { row_identity: 'item' }, series: goodPayload.series };
		controller.render(table);
		controller.state.sort = { column: 'host', direction: 'desc' };
		controller.render(table);
		expect(controller.state.sort).toEqual({ column: 'host', direction: 'desc' });
		controller.render(goodPayload);
		expect(controller.state.sort).toBeUndefined();
	});

	it('restores legend selection and zoom after a refresh', () => {
		const option = { legend: { show: true }, dataZoom: [{ type: 'inside' }, { type: 'slider' }] };
		const restored = restoreView(option, { legendSelected: { a: false }, zoom: { start: 10, end: 60 } });
		expect(restored.legend.selected).toEqual({ a: false });
		expect(restored.dataZoom.map((zoom) => [zoom.start, zoom.end])).toEqual([[10, 60], [10, 60]]);
		expect(restoreView({ legend: { show: false } }, { legendSelected: { a: false } }).legend.selected).toBeUndefined();
		expect(option.legend.selected).toBeUndefined();
	});

	it('reads a moved network layout back before a refresh redraws it', () => {
		const layouts = { 0: [10, 20], 1: [30, 40] };
		const data = { each: (fn) => [0, 1].forEach(fn), getItemLayout: (index) => layouts[index], getId: (index) => String(index + 1) };
		instance.getModel = vi.fn(() => ({
			getSeriesByIndex: () => ({ subType: 'graph', getData: () => data, get: (key) => ({ zoom: 2, center: [5, 5] })[key] })
		}));
		const network = {
			chart: 'network',
			config: { edge_source: 'list', edge_list: 'a -> b', network_layout: 'force', show_legend: true },
			series: [],
			hosts: [{ hostid: '1', name: 'a', groups: [], tags: [], macros: {} }, { hostid: '2', name: 'b', groups: [], tags: [], macros: {} }]
		};
		const controller = new ChartController(widgetRoot());
		controller.render(network);
		expect(instance.getModel).not.toHaveBeenCalled();
		controller.render(network);
		expect(controller.state.nodePositions).toEqual({ 1: [10, 20], 2: [30, 40] });
		const nodes = instance.setOption.mock.calls[1][0].series[0].data;
		expect(nodes.map((node) => [node.x, node.y])).toEqual([[10, 20], [30, 40]]);
		expect(instance.setOption.mock.calls[1][0].series[0].zoom).toBe(2);
		delete instance.getModel;
	});
});
