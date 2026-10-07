/**
 * The module stays isolated from other dashboard widgets, checked at the
 * source level: identifiers, globals and CSS.
 */
import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const moduleDir = path.join(root, 'modules/extended-charts');

async function bundleSource() {
	const result = await build({
		entryPoints: [path.join(root, 'src/main.js')],
		bundle: true,
		format: 'iife',
		write: false,
		define: { __ZW_VERSION__: '"test"', __ECHARTS_VERSION__: '"test"' }
	});
	return result.outputFiles[0].text;
}

describe('isolation from other modules', () => {
	it('uses its own identifiers and asset names', async () => {
		const manifest = JSON.parse(await readFile(path.join(moduleDir, 'manifest.json'), 'utf8'));
		const ids = [manifest.id, manifest.namespace, manifest.widget.js_class, ...Object.keys(manifest.actions)];
		expect(ids).toEqual(['zabbixwidgets_charts', 'ZabbixWidgetsCharts', 'WidgetZabbixWidgetsCharts', 'widget.zabbixwidgets_charts.view']);
		for (const asset of [...manifest.assets.js, ...manifest.assets.css]) {
			expect(asset).toMatch(/^zabbixwidgets-/);
		}
	});

	it('adds only its own two globals and leaves window.echarts alone', async () => {
		const { window } = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
		window.eval('window.echarts = { version: "5.4.4" }; window.CWidget = class {};');
		const otherEcharts = window.echarts;

		const before = new Set(Object.keys(window));
		// Runs the bundle as a classic script, the way Zabbix loads module assets.
		window.eval(await bundleSource());
		const added = Object.keys(window).filter((key) => !before.has(key));

		expect(added.sort()).toEqual(['WidgetZabbixWidgetsCharts', 'ZabbixWidgetsCharts']);
		expect(window.echarts).toBe(otherEcharts);
		expect(Object.getPrototypeOf(window.WidgetZabbixWidgetsCharts)).toBe(window.CWidget);
	});

	it('scopes every CSS rule under .zw-charts', async () => {
		const css = await readFile(path.join(moduleDir, 'assets/css/zabbixwidgets-charts.css'), 'utf8');
		const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g).flatMap((rule) => rule.split(','));
		// Conditional group rules (@container, @media) only wrap rules, whose selectors are checked too.
		for (const selector of selectors.filter((text) => !/^\s*@(container|media)\b/.test(text))) {
			expect(selector.trim()).toMatch(/^\.zw-charts\b/);
		}
	});
});
