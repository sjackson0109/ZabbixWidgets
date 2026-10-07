// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const instance = { setOption: vi.fn(), clear: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
vi.mock('../../src/echarts.js', () => ({ echarts: { init: vi.fn(() => instance) } }));

const { ChartController } = await import('../../src/ui/controller.js');
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
});
