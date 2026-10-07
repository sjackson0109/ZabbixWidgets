/**
 * Builds the browser bundle into the module's assets folder.
 *
 * ECharts is bundled inside the IIFE, so it never touches window.echarts and
 * cannot collide with another module's copy on the same dashboard.
 */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const echartsPkg = JSON.parse(await readFile(path.join(root, 'node_modules/echarts/package.json'), 'utf8'));

const options = {
	entryPoints: [path.join(root, 'src/main.js')],
	outfile: path.join(root, 'modules/extended-charts/assets/js/zabbixwidgets-charts.js'),
	bundle: true,
	format: 'iife',
	target: ['es2020'],
	minify: true,
	legalComments: 'none',
	// Reproducible output: no timestamps or absolute paths in the bundle.
	define: {
		__ZW_VERSION__: JSON.stringify(pkg.version),
		__ECHARTS_VERSION__: JSON.stringify(echartsPkg.version)
	},
	banner: {
		js: `/*! ZabbixWidgets Extended Charts ${pkg.version} | MIT | bundles Apache ECharts ${echartsPkg.version} (Apache-2.0), see THIRD_PARTY_NOTICES.md */`
	},
	logLevel: 'info'
};

await build(options);
