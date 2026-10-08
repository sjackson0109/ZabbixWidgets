/**
 * Loads the built bundle into real Chromium next to a stand-in for Zabbix's
 * CWidget base class and a foreign window.echarts, then drives the widget
 * lifecycle: render, re-render, error state, resize and destroy. Then draws
 * every chart's sample payload and checks that each one paints pixels.
 *
 * Run after `npm run build`. Set CHROMIUM_PATH to use a local Chromium and
 * SCREENSHOT_DIR to save one PNG per chart.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLES, VARIANTS, sample, variant } from '../fixtures/samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = path.join(root, 'modules/extended-charts/assets/js/zabbixwidgets-charts.js');
const css = path.join(root, 'modules/extended-charts/assets/css/zabbixwidgets-charts.css');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.setContent('<!doctype html><html><body style="background:#fff"></body></html>');
await page.addStyleTag({ path: css });
await page.evaluate(() => {
	// Minimal stand-in for the parts of Zabbix's CWidget the module relies on.
	window.CWidget = class {
		constructor(target) {
			this._target = target;
			this._body = target;
			this.onInitialize();
		}
		onInitialize() {}
		processUpdateResponse(response) {
			this.setContents(response);
		}
		setContents(response) {
			this._body.innerHTML = response.body;
		}
	};
	window.echarts = { foreign: true };
});
await page.addScriptTag({ path: bundle });

const body = '<div class="zw-charts"><div class="zw-charts-canvas"></div><div class="zw-charts-messages"></div></div>';
const series = (value) => [
	{ itemid: '1', role: 'value', hostid: '1', host: 'web01', name: 'CPU <b>', key: 'cpu', units: '%', value_type: 0, value, tags: [] },
	{ itemid: '2', role: 'value', hostid: '2', host: 'web02', name: 'CPU <b>', key: 'cpu', units: '%', value_type: 0, value: '-3', tags: [] }
];

const result = await page.evaluate(async ({ body, first, second }) => {
	const target = document.createElement('div');
	target.style.cssText = 'width:600px;height:300px';
	document.body.append(target);

	const widget = new window.WidgetZabbixWidgetsCharts(target);
	const respond = (payload) => widget.processUpdateResponse({ body, zw_payload: payload });
	const pause = () => new Promise((resolve) => setTimeout(resolve, 200));

	respond({ chart: 'column', config: { group_by: 'host', show_legend: true, decimals: 2 }, series: first });
	await pause();
	const canvas = target.querySelector('.zw-charts-canvas canvas');
	const drew = canvas !== null && canvas.width > 0 && canvas.height > 0;
	const firstCanvas = canvas;

	respond({ chart: 'column', config: { group_by: 'host', show_legend: true, decimals: 2 }, series: second });
	await pause();
	const reused = target.querySelector('.zw-charts-canvas canvas') === firstCanvas;

	respond({ chart: 'column', config: {}, series: [] , errors: ['Select host groups or hosts.'] });
	await pause();
	const errorText = target.querySelector('.zw-charts-errors')?.textContent;
	const canvasHidden = target.querySelector('.zw-charts-canvas').hidden;

	target.style.width = '300px';
	widget.onResize();
	widget.onDestroy();

	return {
		drew,
		disposed: target.querySelector('canvas') === null,
		reused,
		errorText,
		canvasHidden,
		foreignEchartsIntact: window.echarts.foreign === true && Object.keys(window.echarts).length === 1,
		version: window.ZabbixWidgetsCharts.echartsVersion
	};
}, { body, first: series('42'), second: series('43') });

const charts = [];
const drawn = [
	...Object.keys(SAMPLES).map((chart) => [chart, sample(chart)]),
	...Object.keys(VARIANTS).map((name) => [name, variant(name)])
];
for (const [chart, payload] of drawn) {
	const outcome = await page.evaluate(async ({ body, payload, name }) => {
		const target = document.createElement('div');
		target.id = `chart-${name}`;
		target.style.cssText = 'width:640px;height:320px;background:#fff';
		document.body.append(target);
		const widget = new window.WidgetZabbixWidgetsCharts(target);
		widget.processUpdateResponse({ body, zw_payload: payload });
		await new Promise((resolve) => setTimeout(resolve, 300));

		const canvas = target.querySelector('.zw-charts-canvas canvas');
		const messages = target.querySelector('.zw-charts-messages')?.textContent ?? '';
		const html = target.querySelector('.zw-charts-canvas[data-zw-view="dom"]');
		if (html !== null) {
			// HTML renderers: count the area covered by drawn elements instead of canvas pixels.
			const box = html.getBoundingClientRect();
			const cells = [...html.querySelectorAll('td, th, .zw-cell, .zw-port, svg')];
			return { painted: cells.length > 0 && box.width * box.height > 0 ? 1 : 0, messages, html: true };
		}
		if (canvas === null) {
			return { painted: 0, messages };
		}
		const context = canvas.getContext('2d');
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
		let painted = 0;
		for (let index = 3; index < data.length; index += 4) {
			painted += data[index] > 0 ? 1 : 0;
		}
		return { painted: painted / (canvas.width * canvas.height), messages };
	}, { body, payload, name: chart });

	if (process.env.SCREENSHOT_DIR) {
		await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
		await page.locator(`#chart-${chart}`).screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${chart}.png`) });
	}
	charts.push([chart, outcome]);
}

// C27: the physical arrangement holds at every size, in both themes, and the tooltip stays on screen.
const portSizes = [['small', 320, 160, '#fff'], ['dark', 900, 300, '#2b2b2b'], ['wide', 1200, 300, '#fff']];
const ports = [];
for (const [name, width, height, background] of portSizes) {
	const outcome = await page.evaluate(async ({ body, payload, name, width, height, background }) => {
		const target = document.createElement('div');
		target.id = `ports-${name}`;
		target.style.cssText = `width:${width}px;height:${height}px;background:${background}`;
		document.body.append(target);
		const widget = new window.WidgetZabbixWidgetsCharts(target);
		widget.processUpdateResponse({ body, zw_payload: payload });
		await new Promise((resolve) => setTimeout(resolve, 300));
		const box = (identity) => [...target.querySelectorAll('[data-zw-port]')]
			.find((node) => decodeURIComponent(node.dataset.zwPort).endsWith(`\u0000${identity}`)).getBoundingClientRect();
		const [one, two, three] = ['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3'].map(box);
		const tile = [...target.querySelectorAll('[data-zw-port]')].pop();
		tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const tip = target.querySelector('.zw-port-tip').getBoundingClientRect();
		const view = { width: window.innerWidth, height: window.innerHeight };
		if (name !== 'wide') {
			target.querySelector('.zw-ports').dispatchEvent(new MouseEvent('mouseleave'));
		}
		return {
			arranged: Math.abs(one.left - two.left) < 1 && two.top > one.bottom - 1 && three.left > one.right - 1 && Math.abs(three.top - one.top) < 1,
			tipInside: tip.width > 0 && tip.left >= 0 && tip.top >= 0 && tip.right <= view.width && tip.bottom <= view.height
		};
	}, { body, payload: sample('switch_ports'), name, width, height, background });
	if (process.env.SCREENSHOT_DIR) {
		await page.locator(`#ports-${name}`).screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `switch_ports-${name}.png`) });
	}
	ports.push([name, outcome]);
}

await browser.close();

const checks = [
	[result.drew, 'Column chart draws a canvas'],
	[result.reused, 'Chart instance is reused across refreshes'],
	[result.errorText === 'Select host groups or hosts.', 'Server errors are shown as text'],
	[result.canvasHidden, 'Canvas is hidden while an error is shown'],
	[result.disposed, 'Destroying the widget disposes the chart'],
	[result.foreignEchartsIntact, 'An existing window.echarts is left untouched'],
	...charts.map(([chart, outcome]) => [outcome.painted > 0.005,
		`${chart} draws its sample (${outcome.html ? 'HTML' : `${(outcome.painted * 100).toFixed(1)}% of pixels`})${outcome.messages ? `: ${outcome.messages}` : ''}`]),
	...ports.flatMap(([name, outcome]) => [
		[outcome.arranged, `switch_ports (${name}): port 1 top-left, 2 beneath it, 3 to its right`],
		[outcome.tipInside, `switch_ports (${name}): tooltip stays inside the window`]
	]),
	[errors.length === 0, `No page errors ${errors.join(' | ')}`]
];

let failed = 0;
for (const [ok, label] of checks) {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
	failed += ok ? 0 : 1;
}
console.log(`Bundled ECharts ${result.version}`);
process.exit(failed === 0 ? 0 : 1);
