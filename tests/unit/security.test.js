/**
 * S10: the module's own code never runs dynamic code, never reaches out to
 * the network and never writes markup from strings into the page. ECharts
 * tooltips are the one place HTML strings are built; they go through
 * escapeHtml (see tests/renderers for escaping checks).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

async function files(dir, extension) {
	const entries = await readdir(path.join(root, dir), { withFileTypes: true, recursive: true });
	return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
		.map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
		.filter((file) => !file.includes(`${path.sep}assets${path.sep}js${path.sep}`));
}

const JS_FORBIDDEN = [
	[/\beval\s*\(/, 'eval'], [/new\s+Function\b/, 'new Function'], [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XMLHttpRequest'],
	[/WebSocket/, 'WebSocket'], [/sendBeacon/, 'sendBeacon'], [/\bimport\s*\(/, 'dynamic import'], [/\.innerHTML\s*=/, 'innerHTML assignment'],
	[/\.outerHTML\s*=|insertAdjacentHTML|document\.write/, 'markup insertion'], [/setTimeout\s*\(\s*['"`]/, 'string timer']
];
const PHP_FORBIDDEN = [[/\bcurl_/, 'curl'], [/file_get_contents\s*\(\s*['"]https?:/, 'remote read'], [/fsockopen|stream_socket_client/, 'socket'], [/\beval\s*\(/, 'eval']];

describe('security', () => {
	it('uses no dynamic code, network calls or markup strings in the browser code', async () => {
		const found = [];
		const sources = await files('src', '.js');
		expect(sources.length).toBeGreaterThan(40);
		for (const file of sources) {
			const text = await readFile(file, 'utf8');
			for (const [pattern, name] of JS_FORBIDDEN) {
				if (pattern.test(text)) {
					found.push(`${path.relative(root, file)}: ${name}`);
				}
			}
			// The only address allowed is the SVG namespace, which is never requested.
			const addresses = (text.match(/https?:\/\/[^\s'"`)]+/g) ?? []).filter((url) => url !== 'http://www.w3.org/2000/svg');
			found.push(...addresses.map((url) => `${path.relative(root, file)}: ${url}`));
		}
		expect(found).toEqual([]);
	});

	it('makes no outgoing requests from the PHP code', async () => {
		const found = [];
		const sources = await files('modules', '.php');
		expect(sources.length).toBeGreaterThan(5);
		for (const file of sources) {
			const text = await readFile(file, 'utf8');
			for (const [pattern, name] of PHP_FORBIDDEN) {
				if (pattern.test(text)) {
					found.push(`${path.relative(root, file)}: ${name}`);
				}
			}
		}
		expect(found).toEqual([]);
	});

	it('keeps no passwords in the integration setup', async () => {
		const compose = await readFile(path.join(root, 'tests/integration/docker-compose.yml'), 'utf8');
		const passwords = compose.match(/PASSWORD:.*/g) ?? [];
		expect(passwords.length).toBeGreaterThan(0);
		expect(passwords.filter((line) => !line.includes('${ZW_DB_PASSWORD:?'))).toEqual([]);

		// The image's first-login password is the one literal, used once and then replaced.
		const smoke = await readFile(path.join(root, 'tests/integration/smoke.mjs'), 'utf8');
		expect(smoke.match(/'zabbix'/g)).toEqual(["'zabbix'"]);
		expect(smoke).toMatch(/const IMAGE_ADMIN_PASSWORD = 'zabbix';/);
		expect(smoke).not.toMatch(/(password|passwd)\s*:\s*['"`]/);
		expect(smoke).not.toMatch(/#password',\s*['"`]/);
	});
});
