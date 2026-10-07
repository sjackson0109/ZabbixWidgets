/**
 * Loads the built bundle into real Chromium next to a stand-in for Zabbix's
 * CWidget base class and a foreign window.echarts, then drives the widget
 * lifecycle: render, re-render, error state, resize and destroy.
 *
 * Run after `npm run build`. Set CHROMIUM_PATH to use a local Chromium.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

await browser.close();

const checks = [
	[result.drew, 'Column chart draws a canvas'],
	[result.reused, 'Chart instance is reused across refreshes'],
	[result.errorText === 'Select host groups or hosts.', 'Server errors are shown as text'],
	[result.canvasHidden, 'Canvas is hidden while an error is shown'],
	[result.disposed, 'Destroying the widget disposes the chart'],
	[result.foreignEchartsIntact, 'An existing window.echarts is left untouched'],
	[errors.length === 0, `No page errors ${errors.join(' | ')}`]
];

let failed = 0;
for (const [ok, label] of checks) {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
	failed += ok ? 0 : 1;
}
console.log(`Bundled ECharts ${result.version}`);
process.exit(failed === 0 ? 0 : 1);
