/**
 * Integration smoke test against a live Zabbix (see docker-compose.yml).
 *
 * 1. Registers ZabbixWidgets and, if installed, the Monzphere ECharts module.
 * 2. Creates hosts with trapper items and pushes real values.
 * 3. Builds a dashboard with a working Column widget, a Bubble widget missing
 *    its mappings, and (when present) a Monzphere widget.
 * 4. Opens the dashboard in Chromium and checks the Column chart draws, the
 *    Bubble widget explains what is missing, the Monzphere widget still
 *    draws, the edit form opens, and no page errors occur.
 *
 * Screenshots and page HTML go to test-results/ for inspection.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.ZABBIX_URL ?? 'http://localhost:8080';
const WITH_MONZPHERE = process.env.WITH_MONZPHERE === '1';
const OUT = 'test-results';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let token = null;
let requestId = 1;

async function api(method, params = {}) {
	const headers = { 'Content-Type': 'application/json-rpc' };
	if (token !== null && method !== 'apiinfo.version' && method !== 'user.login') {
		headers.Authorization = `Bearer ${token}`;
	}
	const response = await fetch(`${BASE}/api_jsonrpc.php`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ jsonrpc: '2.0', method, params, id: requestId++ })
	});
	const body = await response.json();
	if (body.error) {
		throw new Error(`${method}: ${body.error.message} ${body.error.data}`);
	}
	return body.result;
}

async function waitForApi() {
	for (let attempt = 0; attempt < 90; attempt++) {
		try {
			return await api('apiinfo.version');
		}
		catch {
			await sleep(5000);
		}
	}
	throw new Error('Zabbix API did not come up.');
}

function step(message) {
	console.log(`\n== ${message}`);
}

const version = await waitForApi();
step(`Zabbix ${version}`);
token = await api('user.login', { username: 'Admin', password: 'zabbix' });

step('Register modules');
const modules = [{ id: 'zabbixwidgets_charts', relative_path: 'modules/zabbixwidgets_charts' }];
if (WITH_MONZPHERE) {
	modules.push({ id: 'echarts', relative_path: 'modules/monzphere_echarts' });
}
for (const module of modules) {
	const existing = await api('module.get', { filter: { id: module.id } });
	if (existing.length === 0) {
		await api('module.create', { ...module, status: 1 });
	}
	console.log(`registered ${module.id}`);
}

step('Create hosts and items');
const [{ groupid }] = await api('hostgroup.get', { filter: { name: ['ZW tests'] } })
	.then(async (found) => (found.length ? found : [{ groupid: (await api('hostgroup.create', { name: 'ZW tests' })).groupids[0] }]));

const hostIds = [];
for (const name of ['zw-host-1', 'zw-host-2']) {
	const found = await api('host.get', { filter: { host: [name] } });
	hostIds.push(found.length ? found[0].hostid : (await api('host.create', { host: name, groups: [{ groupid }] })).hostids[0]);
}

const itemDefs = [
	{ name: 'ZW CPU utilisation', key_: 'zw.cpu', units: '%', value_type: 0 },
	{ name: 'ZW Memory used', key_: 'zw.mem', units: '%', value_type: 3 }
];
const itemIds = [];
for (const hostid of hostIds) {
	for (const def of itemDefs) {
		const found = await api('item.get', { hostids: hostid, filter: { key_: def.key_ } });
		itemIds.push(found.length ? found[0].itemid : (await api('item.create', { ...def, hostid, type: 2 })).itemids[0]);
	}
}

step('Push values');
const now = Math.floor(Date.now() / 1000);
const values = itemIds.map((itemid, index) => ({ itemid, value: String(10 + index * 7), clock: now }));
for (let attempt = 0; ; attempt++) {
	try {
		const result = await api('history.push', values);
		if ((result.data ?? []).some((entry) => entry.error)) {
			throw new Error(JSON.stringify(result.data));
		}
		break;
	}
	catch (error) {
		if (attempt >= 24) {
			throw error;
		}
		await sleep(5000);
	}
}
await sleep(5000);

step('Create dashboard');
const hostFields = hostIds.map((hostid, index) => ({ type: 3, name: `hostids.${index}`, value: hostid }));
const widgets = [
	{
		type: 'zabbixwidgets_charts', name: 'ZW column', x: 0, y: 0, width: 36, height: 6,
		fields: [{ type: 0, name: 'chart_type', value: 1 }, ...hostFields, { type: 1, name: 'items.0', value: 'ZW *' }]
	},
	{
		type: 'zabbixwidgets_charts', name: 'ZW bubble', x: 36, y: 0, width: 36, height: 6,
		fields: [{ type: 0, name: 'chart_type', value: 8 }, ...hostFields, { type: 1, name: 'x_items.0', value: 'ZW CPU*' }]
	}
];
if (WITH_MONZPHERE) {
	widgets.push({
		type: 'echarts', name: 'Monzphere gauge', x: 0, y: 6, width: 36, height: 6,
		fields: [{ type: 0, name: 'display_type', value: 0 }, ...hostFields, { type: 1, name: 'items.0', value: 'ZW CPU*' }]
	});
}
const { dashboardids: [dashboardid] } = await api('dashboard.create', {
	name: `ZW smoke ${now}`,
	pages: [{ widgets }]
});

step('Open dashboard in Chromium');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const failures = [];
const check = (condition, message) => {
	console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
	if (!condition) {
		failures.push(message);
	}
};

try {
	await page.goto(`${BASE}/index.php`);
	await page.fill('#name', 'Admin');
	await page.fill('#password', 'zabbix');
	await page.click('#enter');
	await page.waitForLoadState('networkidle');

	await page.goto(`${BASE}/zabbix.php?action=dashboard.view&dashboardid=${dashboardid}`);
	await page.waitForTimeout(8000);
	await page.screenshot({ path: `${OUT}/dashboard-${version}.png`, fullPage: true });
	await writeFile(`${OUT}/dashboard-${version}.html`, await page.content());

	const widget = (name) => page.locator('.dashboard-grid-widget', { has: page.locator('.dashboard-grid-widget-header', { hasText: name }) });

	const column = widget('ZW column');
	check(await column.locator('.zw-charts-canvas canvas').count() > 0, 'Column widget draws a canvas');
	check(await column.locator('.zw-charts-errors').count() === 0, 'Column widget shows no errors');

	const bubble = widget('ZW bubble');
	const bubbleText = await bubble.locator('.zw-charts-errors').textContent().catch(() => '');
	check(/requires/i.test(bubbleText ?? ''), `Bubble widget explains missing mappings: "${bubbleText}"`);

	if (WITH_MONZPHERE) {
		check(await widget('Monzphere gauge').locator('canvas').count() > 0, 'Monzphere widget still draws alongside ZabbixWidgets');
	}

	check(await page.evaluate(() => typeof window.WidgetZabbixWidgetsCharts === 'function'), 'Widget class is registered');

	step('Open the edit form');
	await page.getByRole('button', { name: /edit dashboard/i }).click();
	await page.waitForTimeout(1000);
	await column.hover();
	await column.locator('.js-widget-edit, button[title="Edit"]').first().click();
	const form = page.locator('#widget-dialogue-form');
	await form.waitFor({ timeout: 15000 });
	await page.waitForTimeout(1000);
	await page.screenshot({ path: `${OUT}/edit-form-${version}.png` });
	await writeFile(`${OUT}/edit-form-${version}.html`, await form.innerHTML());
	check(await page.locator('.overlay-dialogue .msg-bad').count() === 0, 'Edit form opens without errors');
	check(await form.locator('[name^="start_items"]').first().isHidden(), 'Edit form hides Gantt fields for Column');
	check(await form.locator('[name="group_by"]').first().isVisible(), 'Edit form shows Column grouping');
}
catch (error) {
	failures.push(`Unexpected: ${error.message}`);
	console.error(error);
	await page.screenshot({ path: `${OUT}/failure-${version}.png`, fullPage: true }).catch(() => {});
	await writeFile(`${OUT}/failure-${version}.html`, await page.content().catch(() => '')).catch(() => {});
}
finally {
	await browser.close();
}

check(pageErrors.length === 0, `No page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed on Zabbix ${version}.`);
	process.exit(1);
}
console.log(`\nAll checks passed on Zabbix ${version}.`);
