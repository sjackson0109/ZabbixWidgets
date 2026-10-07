/**
 * Integration smoke test against a live Zabbix (see docker-compose.yml).
 *
 * 1. Registers ZabbixWidgets.
 * 2. Creates hosts with trapper items, linked to a two-level template stack
 *    that defines a user macro, and pushes real values.
 * 3. Builds a dashboard with a working Column widget, a Bubble widget missing
 *    its mappings, plus a second
 *    dashboard with one configured widget for every chart type.
 * 4. Opens the dashboards in Chromium and checks the Column chart draws, the
 *    Bubble widget explains what is missing, every chart type draws from
 *    real Zabbix data, the edit form opens, and no page errors occur.
 *
 * Screenshots and page HTML go to test-results/ for inspection, with one
 * screenshot of every chart and of its edit form in test-results/showcase/.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.ZABBIX_URL ?? 'http://localhost:8080';
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
// zw-host-2 names zw-host-1 as its uplink, giving the Network chart one real edge.
const hostTags = { 'zw-host-1': [], 'zw-host-2': [{ tag: 'uplink', value: 'zw-host-1' }] };
for (const name of ['zw-host-1', 'zw-host-2']) {
	const found = await api('host.get', { filter: { host: [name] } });
	const hostid = found.length ? found[0].hostid : (await api('host.create', { host: name, groups: [{ groupid }] })).hostids[0];
	await api('host.update', { hostid, tags: hostTags[name] });
	hostIds.push(hostid);
}

// The bullet target macro is defined two template levels above the hosts, as in a typical template stack.
step('Create templates');
const [{ groupid: templateGroupid }] = await api('templategroup.get', { filter: { name: ['ZW templates'] } })
	.then(async (found) => (found.length ? found : [{ groupid: (await api('templategroup.create', { name: 'ZW templates' })).groupids[0] }]));
async function template(host, params) {
	const found = await api('template.get', { filter: { host: [host] } });
	return found.length
		? (await api('template.update', { templateid: found[0].templateid, ...params })).templateids[0]
		: (await api('template.create', { host, groups: [{ groupid: templateGroupid }], ...params })).templateids[0];
}
const baseTemplate = await template('ZW target base', { macros: [{ macro: '{$ZW.TARGET}', value: '30' }] });
const hostTemplate = await template('ZW target', { templates: [{ templateid: baseTemplate }] });
for (const hostid of hostIds) {
	await api('host.update', { hostid, templates: [{ templateid: hostTemplate }] });
}

const now = Math.floor(Date.now() / 1000);
const flows = [[{ tag: 'from', value: 'London' }, { tag: 'to', value: 'Paris' }], [{ tag: 'from', value: 'Paris' }, { tag: 'to', value: 'Berlin' }]];

// latest(hostIndex) gives the current value; history, when present, adds a day of half-hourly samples.
const itemDefs = [
	{ name: 'ZW CPU utilisation', key_: 'zw.cpu', units: '%', value_type: 0, latest: (h) => 10 + h * 7, history: true },
	{ name: 'ZW Memory used', key_: 'zw.mem', units: '%', value_type: 3, latest: (h) => 40 + h * 15 },
	{ name: 'ZW Disk used', key_: 'zw.disk', units: '%', value_type: 0, latest: (h) => 55 - h * 20 },
	{ name: 'ZW Load average', key_: 'zw.load', units: '', value_type: 0, latest: (h) => 1.5 + h * 2 },
	{ name: 'ZW Sessions', key_: 'zw.sessions', units: '', value_type: 3, latest: (h) => 40 + h * 120 },
	{ name: 'ZW Job start', key_: 'zw.job.start', units: 'unixtime', value_type: 3, latest: (h) => now - 7200 + h * 1800 },
	{ name: 'ZW Job end', key_: 'zw.job.end', units: 'unixtime', value_type: 3, latest: (h) => now - 3600 + h * 2400 },
	{ name: 'ZW Job progress', key_: 'zw.job.progress', units: '%', value_type: 0, latest: (h) => (h === 0 ? 100 : 45) },
	{ name: 'ZW Flow', key_: 'zw.flow', units: 'bps', value_type: 0, latest: (h) => 300 - h * 120, tags: (h) => flows[h] }
];
const itemIds = [];
const values = [];
for (const [hostIndex, hostid] of hostIds.entries()) {
	for (const { latest, history, tags, ...def } of itemDefs) {
		const found = await api('item.get', { hostids: hostid, filter: { key_: def.key_ } });
		const fields = { ...def, ...(tags ? { tags: tags(hostIndex) } : {}) };
		const itemid = found.length
			? (await api('item.update', { itemid: found[0].itemid, ...fields })).itemids[0]
			: (await api('item.create', { ...fields, hostid, type: 2 })).itemids[0];
		itemIds.push(itemid);
		if (history) {
			for (let clock = now - 86400; clock < now; clock += 1800) {
				values.push({ itemid, clock, value: String(30 + hostIndex * 20 + ((clock / 1800) % 13)) });
			}
		}
		values.push({ itemid, clock: now, value: String(latest(hostIndex)) });
	}
}

// Items shaped like low-level discovery output: one set per interface, with the interface in the key and a tag.
// Their names start with "ZWT" so the numeric-only charts above, which match "ZW *", do not pick them up.
step('Create interface items');
const interfaces = ['eth0', 'eth1', 'eth2'];
for (const [hostIndex, hostid] of hostIds.entries()) {
	const existingMap = await api('valuemap.get', { hostids: hostid, filter: { name: 'ZW interface status' } });
	const mappings = [{ value: '1', newvalue: 'up' }, { value: '2', newvalue: 'down' }];
	const valuemapid = existingMap.length
		? existingMap[0].valuemapid
		: (await api('valuemap.create', { hostid, name: 'ZW interface status', mappings })).valuemapids[0];

	for (const [ifIndex, name] of interfaces.entries()) {
		const defs = [
			{ name: `ZWT Interface ${name}: Bits received`, key_: `zwt.if.in[${name}]`, units: 'bps', value_type: 3 },
			{ name: `ZWT Interface ${name}: Operational status`, key_: `zwt.if.status[${name}]`, units: '', value_type: 3, valuemapid }
		];
		for (const def of defs) {
			const found = await api('item.get', { hostids: hostid, filter: { key_: def.key_ } });
			const fields = { ...def, tags: [{ tag: 'interface', value: name }] };
			const itemid = found.length
				? (await api('item.update', { itemid: found[0].itemid, ...fields })).itemids[0]
				: (await api('item.create', { ...fields, hostid, type: 2 })).itemids[0];
			if (def.valuemapid) {
				// Hourly states over the last day; eth2 on the second host goes down in the last few hours.
				for (let clock = now - 86400, hour = 0; clock < now; clock += 3600, hour++) {
					const down = hostIndex === 1 && ifIndex === 2 ? hour >= 20 : (hour + ifIndex) % 9 === 0;
					values.push({ itemid, clock, value: down ? '2' : '1' });
				}
				values.push({ itemid, clock: now, value: hostIndex === 1 && ifIndex === 2 ? '2' : '1' });
			}
			else {
				values.push({ itemid, clock: now - 60, value: String(1000000 * (ifIndex + 1)) });
				values.push({ itemid, clock: now, value: String(1000000 * (ifIndex + 1) + 250000 * (hostIndex + 1)) });
			}
		}
	}
}

// A switch shaped like a network template's output: per interface, operational and administrative
// status, speed, utilisation and alias, each tagged with the interface. It sits in its own host group,
// which the limited user below cannot read.
step('Create switch interface items');
const [{ groupid: restrictedGroupid }] = await api('hostgroup.get', { filter: { name: ['ZW restricted'] } })
	.then(async (found) => (found.length ? found : [{ groupid: (await api('hostgroup.create', { name: 'ZW restricted' })).groupids[0] }]));
const switchFound = await api('host.get', { filter: { host: ['zw-switch'] } });
const switchHostid = switchFound.length
	? switchFound[0].hostid
	: (await api('host.create', { host: 'zw-switch', groups: [{ groupid: restrictedGroupid }] })).hostids[0];
const switchMaps = {};
for (const [mapName, mappings] of [
	['ZW ifOperStatus', [['1', 'up'], ['2', 'down'], ['3', 'testing'], ['7', 'lowerLayerDown']]],
	['ZW ifAdminStatus', [['1', 'up'], ['2', 'down'], ['3', 'testing']]]
]) {
	const existing = await api('valuemap.get', { hostids: switchHostid, filter: { name: mapName } });
	switchMaps[mapName] = existing.length
		? existing[0].valuemapid
		: (await api('valuemap.create', { hostid: switchHostid, name: mapName, mappings: mappings.map(([value, newvalue]) => ({ value, newvalue })) })).valuemapids[0];
}
const switchPorts = [
	...Array.from({ length: 12 }, (_, index) => ({ name: `Gi1/0/${index + 1}`, n: index + 1, uplink: false })),
	...[1, 2].map((n) => ({ name: `Te1/1/${n}`, n, uplink: true }))
];
for (const { name, n, uplink } of switchPorts) {
	const adminDown = !uplink && n === 6;
	const up = uplink || !(adminDown || n === 5 || n === 9);
	const alias = uplink ? `uplink-${n}` : n === 1 ? 'AP-floor2' : '';
	const label = `ZWS Interface ${name}(${alias})`;
	const defs = [
		{ suffix: 'Operational status', key: 'oper', value_type: 3, units: '', valuemapid: switchMaps['ZW ifOperStatus'], value: up ? '1' : n === 9 ? '7' : '2' },
		{ suffix: 'Administrative status', key: 'admin', value_type: 3, units: '', valuemapid: switchMaps['ZW ifAdminStatus'], value: adminDown ? '2' : '1' },
		{ suffix: 'Speed', key: 'speed', value_type: 3, units: 'bps', value: up ? String(uplink ? 10e9 : n === 3 ? 100e6 : 1e9) : '0' },
		{ suffix: 'Inbound utilisation', key: 'util_in', value_type: 0, units: '%', value: up ? String((n * 7) % 60) : '0' },
		{ suffix: 'Outbound utilisation', key: 'util_out', value_type: 0, units: '%', value: up ? String((n * 11) % 45) : '0' },
		{ suffix: 'Alias', key: 'alias', value_type: 1, units: '', value: alias }
	];
	for (const { suffix, key, value, ...def } of defs) {
		const key_ = `zws.if.${key}[${name}]`;
		const found = await api('item.get', { hostids: switchHostid, filter: { key_ } });
		const fields = { ...def, name: `${label}: ${suffix}`, key_, tags: [{ tag: 'interface', value: name }] };
		const itemid = found.length
			? (await api('item.update', { itemid: found[0].itemid, ...fields })).itemids[0]
			: (await api('item.create', { ...fields, hostid: switchHostid, type: 2 })).itemids[0];
		values.push({ itemid, clock: now, value });
	}
}
const downTrigger = 'ZWS Gi1/0/5: Link down';
if ((await api('trigger.get', { hostids: switchHostid, filter: { description: downTrigger } })).length === 0) {
	await api('trigger.create', { description: downTrigger, expression: 'last(/zw-switch/zws.if.oper[Gi1/0/5])=2', priority: 3 });
}

// A user who may read the ZW tests group only: it must not see the switch's interfaces.
step('Create a limited user');
const usrgrpFound = await api('usergroup.get', { filter: { name: ['ZW viewers'] } });
const usrgrpid = usrgrpFound.length
	? usrgrpFound[0].usrgrpid
	: (await api('usergroup.create', { name: 'ZW viewers', hostgroup_rights: [{ id: groupid, permission: 2 }] })).usrgrpids[0];
// A throwaway password made up for each run, for a container that lives only as long as the run.
const viewer = { username: 'zw-viewer', password: randomBytes(18).toString('base64url') };
const viewerFound = await api('user.get', { filter: { username: viewer.username } });
const viewerId = viewerFound.length
	? (await api('user.update', { userid: viewerFound[0].userid, passwd: viewer.password })).userids[0]
	: (await api('user.create', { username: viewer.username, passwd: viewer.password, roleid: '1', usrgrps: [{ usrgrpid }] })).userids[0];

step('Push values');
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
		type: 'zabbixwidgets_charts', name: 'ZW misconfigured bubble (expected error)', x: 36, y: 0, width: 36, height: 6,
		fields: [{ type: 0, name: 'chart_type', value: 8 }, ...hostFields, { type: 1, name: 'x_items.0', value: 'ZW CPU*' }]
	},
	{
		// No time period of its own: it follows the dashboard's time selector.
		type: 'zabbixwidgets_charts', name: 'ZW line (dashboard period)', x: 0, y: 6, width: 36, height: 5,
		fields: [{ type: 0, name: 'chart_type', value: 21 }, ...hostFields, { type: 1, name: 'items.0', value: 'ZW CPU*' }]
	}
];
const { dashboardids: [dashboardid] } = await api('dashboard.create', {
	name: `ZW smoke ${now}`,
	pages: [{ widgets }]
});

// One configured widget per chart type, fed by the items above.
const int = (name, value) => ({ type: 0, name, value });
const str = (name, value) => ({ type: 1, name, value });
const patterns = (field, ...values) => values.map((value, index) => str(`${field}.${index}`, value));
const firstHost = [{ type: 3, name: 'hostids.0', value: hostIds[0] }];
const lastDay = [str('time_period.from', 'now-1d'), str('time_period.to', 'now')];
/** The C27 widget on the switch: identity and port number from the item name, access ports and uplinks grouped. */
function switchPanelFields() {
	return [
		{ type: 3, name: 'hostids.0', value: switchHostid },
		...patterns('port_oper_items', 'ZWS Interface*: Operational status'),
		...patterns('port_admin_items', 'ZWS Interface*: Administrative status'),
		...patterns('port_speed_items', 'ZWS Interface*: Speed'),
		...patterns('port_util_in_items', 'ZWS Interface*: Inbound utilisation'),
		...patterns('port_util_out_items', 'ZWS Interface*: Outbound utilisation'),
		...patterns('port_alias_items', 'ZWS Interface*: Alias'),
		int('port_identity', 2), str('port_regex', '^ZWS Interface ((?:Gi|Te)1/\\d/(\\d+))\\('), int('port_number_group', 2),
		int('port_grouping', 1), str('port_groups', 'Access = /^Gi/\nUplinks = /^Te/'), str('port_type_rules', 'SFP+ = /^Te/'),
		int('port_label', 3), int('port_util_bar', 1), int('port_click', 1)
	];
}

const chartWidgets = [
	['Column', 1, [...hostFields, ...patterns('items', 'ZW CPU*', 'ZW Memory*', 'ZW Disk*')]],
	['Stacked Bar', 2, [...hostFields, ...patterns('items', 'ZW CPU*', 'ZW Memory*')]],
	['Doughnut', 3, [...hostFields, ...patterns('items', 'ZW Memory*'), int('centre_value', 1)]],
	['Bullet Graph', 4, [...hostFields, ...patterns('items', 'ZW CPU*'), int('target_source', 2), str('target_constant', '25'), str('ranges', '20, 40')]],
	['Macro Bullet', 4, [...hostFields, ...patterns('items', 'ZW CPU*'), int('target_source', 1), str('target_macro', '{$ZW.TARGET}')]],
	['Radar', 5, [...hostFields, ...patterns('items', 'ZW CPU*', 'ZW Memory*', 'ZW Disk*')]],
	['Heat Map', 6, [...hostFields, ...patterns('items', 'ZW CPU*'), int('heat_x', 2), int('heat_y', 1), str('bucket', '2h'), ...lastDay]],
	['Candlestick', 7, [...firstHost, ...patterns('items', 'ZW CPU*'), str('bucket', '2h'), ...lastDay]],
	['Bubble', 8, [...hostFields, ...patterns('x_items', 'ZW CPU*'), ...patterns('y_items', 'ZW Load*'), ...patterns('size_items', 'ZW Sessions*')]],
	['Gantt', 9, [...hostFields, ...patterns('start_items', 'ZW Job start*'), ...patterns('end_items', 'ZW Job end*'), ...patterns('progress_items', 'ZW Job progress*')]],
	['Tree Diagram', 10, [...hostFields, ...patterns('items', 'ZW CPU*', 'ZW Memory*')]],
	['Network', 11, [...hostFields, ...patterns('items', 'ZW CPU*'), int('edge_source', 1), str('edge_tag', 'uplink')]],
	['Chord', 12, [...hostFields, ...patterns('items', 'ZW Flow*'), str('source_tag', 'from'), str('target_tag', 'to')]],
	['Calendar Heat Map', 13, [...firstHost, ...patterns('items', 'ZW CPU*'), int('aggregation', 3), str('time_period.from', 'now-7d'), str('time_period.to', 'now')]],
	['LLD Data Table', 14, [
		...hostFields, ...patterns('items', 'ZWT Interface*'), int('row_identity', 1), str('row_heading', 'Interface'),
		str('table_columns', 'Received = ZWT Interface *: Bits received\nStatus = ZWT Interface *: Operational status'),
		int('show_change', 1), int('show_problems', 1)
	]],
	['Pie', 15, [...hostFields, ...patterns('items', 'ZW Memory*'), int('pie_sort', 1)]],
	['Level Gauge', 16, [
		...hostFields, ...patterns('items', 'ZW Disk*'), str('scale_min', '0'), str('scale_max', '100'), str('thresholds', '40, 50'),
		str('target_value', '{$ZW.TARGET}')
	]],
	['Ranking Bar', 17, [...hostFields, ...patterns('items', 'ZW CPU*', 'ZW Memory*', 'ZW Disk*'), int('rank_limit', 1), int('rank_count', 4), str('thresholds', '30, 60')]],
	['Treemap', 18, [...hostFields, ...patterns('items', 'ZW Sessions*'), ...patterns('colour_items', 'ZW CPU*'), str('levels', 'group, host')]],
	['Sunburst', 19, [...hostFields, ...patterns('items', 'ZW Sessions*', 'ZW Load*'), str('levels', 'group, host')]],
	['Funnel', 20, [...firstHost, ...patterns('items', 'ZW Sessions*', 'ZW Load*'), str('stages', 'Sessions = ZW Sessions\nLoad = ZW Load average')]],
	['Temporal Line', 21, [...hostFields, ...patterns('items', 'ZW CPU*'), ...lastDay]],
	['Temporal Area', 22, [...hostFields, ...patterns('items', 'ZW CPU*'), int('area_gradient', 1), ...lastDay]],
	['Status Matrix', 23, [
		...hostFields, ...patterns('items', 'ZWT Interface*: Operational status'), int('colour_by', 1), str('colour_map', 'up = #1A9850\ndown = #D73027')
	]],
	['State Timeline', 24, [...firstHost, ...patterns('items', 'ZWT Interface*: Operational status'), str('colour_map', 'up = #1A9850\ndown = #D73027'), ...lastDay]],
	['Sparkline Grid', 25, [...hostFields, ...patterns('items', 'ZW CPU*'), int('show_change', 1), int('show_minmax', 1), ...lastDay]],
	['Threshold Band', 26, [...firstHost, ...patterns('items', 'ZW CPU*'), str('thresholds', '40, 50'), str('target_value', '{$ZW.TARGET}'), ...lastDay]],
	['Switch Port Panel', 27, switchPanelFields()]
];
// Shared with the limited user: the Column widget can show its permitted hosts, the switch must stay hidden.
const { dashboardids: [permissionsDashboardid] } = await api('dashboard.create', {
	name: `ZW permissions ${now}`,
	users: [{ userid: viewerId, permission: 2 }],
	pages: [{
		widgets: [
			{
				type: 'zabbixwidgets_charts', name: 'ZW viewer column', x: 0, y: 0, width: 36, height: 5,
				fields: [int('chart_type', 1), ...hostFields, { type: 3, name: `hostids.${hostFields.length}`, value: switchHostid }, ...patterns('items', 'ZW CPU*')]
			},
			{ type: 'zabbixwidgets_charts', name: 'ZW viewer switch', x: 36, y: 0, width: 36, height: 5, fields: [int('chart_type', 27), ...switchPanelFields()] }
		]
	}]
});

const { dashboardids: [chartsDashboardid] } = await api('dashboard.create', {
	name: `ZW all charts ${now}`,
	pages: [{
		widgets: chartWidgets.map(([name, chartType, fields], index) => ({
			type: 'zabbixwidgets_charts', name: `ZW ${name}`, x: (index % 3) * 24, y: Math.floor(index / 3) * 5, width: 24, height: 5,
			fields: [int('chart_type', chartType), ...fields]
		}))
	}]
});

/**
 * Saves one screenshot of each chart on the dashboard and one of its edit
 * form, to test-results/showcase/<version>/. Only for people to look at:
 * problems here are logged, not counted as failures.
 */
async function showcase(page, widget) {
	const dir = `${OUT}/showcase/${version}`;
	const file = (index, name, kind) => `${dir}/${String(index + 1).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}.png`;
	await mkdir(dir, { recursive: true });
	await page.setViewportSize({ width: 1600, height: 1400 });

	for (const [index, [name]] of chartWidgets.entries()) {
		await widget(`ZW ${name}`).screenshot({ path: file(index, name, 'dashboard') })
			.catch((error) => console.log(`showcase: no dashboard screenshot of ${name}: ${error.message}`));
	}

	await page.getByRole('button', { name: /edit dashboard/i }).click();
	await page.waitForTimeout(1000);
	// The widget's edit dialogue holds a form; hover hints are also .overlay-dialogue but do not.
	const dialogue = page.locator('.overlay-dialogue', { has: page.locator('form') }).last();
	for (const [index, [name]] of chartWidgets.entries()) {
		try {
			const target = widget(`ZW ${name}`);
			await target.hover();
			await target.locator('.js-widget-edit, button[title="Edit"]').first().click();
			await dialogue.waitFor({ timeout: 15000 });
			await page.waitForTimeout(1500);
			await page.mouse.move(0, 0);
			await dialogue.screenshot({ path: file(index, name, 'form') });
			await dialogue.locator('.btn-overlay-close').click();
			await dialogue.waitFor({ state: 'detached', timeout: 10000 });
		}
		catch (error) {
			console.log(`showcase: no form screenshot of ${name}: ${error.message}`);
			await page.keyboard.press('Escape').catch(() => {});
			await page.waitForTimeout(1000);
		}
	}
	await page.setViewportSize({ width: 1600, height: 1000 });
}

const expectedErrorWidgets = (await api('dashboard.get', { dashboardids: [dashboardid], selectPages: 'extend' }))[0].pages
	.flatMap((dashboardPage) => dashboardPage.widgets)
	.filter((entry) => entry.name.includes('expected error'))
	.map((entry) => String(entry.widgetid));

step('Open dashboard in Chromium');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
const consoleErrors = [];
const failedActions = [];
const actionRequests = [];

/**
 * Every page is watched the same way: uncaught exceptions, unhandled promise
 * rejections, console errors, ECharts warnings, and widget actions that fail
 * or carry PHP errors all fail the run. Nothing is filtered out.
 */
async function watch(target) {
	await target.addInitScript(() => {
		window.addEventListener('unhandledrejection', (event) => console.error(`Unhandled rejection: ${event.reason?.message ?? event.reason}`));
	});
	target.on('pageerror', (error) => pageErrors.push(error.message));
	target.on('console', (message) => {
		const text = message.text();
		if (message.type() === 'error' || (message.type() === 'warning' && /echarts/i.test(text))) {
			consoleErrors.push(`${message.type()}: ${text}`);
		}
	});
	target.on('request', (request) => {
		if (request.url().includes('widget.zabbixwidgets_charts.view')) {
			actionRequests.push(decodeURIComponent(request.postData() ?? ''));
		}
	});
	target.on('response', async (response) => {
		if (!response.url().includes('widget.zabbixwidgets_charts.view')) {
			return;
		}
		const where = `${response.status()} ${response.url().slice(0, 120)}`;
		if (response.status() !== 200) {
			failedActions.push(where);
			return;
		}
		const body = await response.text().catch(() => '');
		if (/(Fatal error|Parse error|Warning|Notice|Deprecated)(<\/b>)?:\s/.test(body)) {
			failedActions.push(`${where}: PHP message in response`);
		}
		try {
			// The misconfigured Bubble widget is meant to answer with its configuration error.
			const expected = expectedErrorWidgets.some((widgetid) => new URLSearchParams(response.request().postData() ?? '').get('widgetid') === widgetid);
			if (JSON.parse(body).error !== undefined && !expected) {
				failedActions.push(`${where}: ${JSON.stringify(JSON.parse(body).error).slice(0, 200)}`);
			}
		}
		catch {
			failedActions.push(`${where}: response is not JSON`);
		}
	});
}
await watch(page);

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

	// The message may come from the module's own validation (.zw-charts-errors) or from Zabbix
	// showing WidgetForm::validate() errors in place of the widget; either explains the problem.
	const bubble = widget('ZW misconfigured bubble');
	const bubbleText = (await bubble.locator('.dashboard-grid-widget-contents, .dashboard-grid-widget-container').first().innerText().catch(() => '')).trim();
	check(/requires/i.test(bubbleText), `Bubble widget explains missing mappings: "${bubbleText.slice(0, 200)}"`);

	check(await page.evaluate(() => typeof window.WidgetZabbixWidgetsCharts === 'function'), 'Widget class is registered');

	// S01: a widget without its own period follows the dashboard, and asks again when the time selector changes.
	step('Dashboard time period');
	check(await widget('ZW line (dashboard period)').locator('.zw-charts-canvas canvas').count() > 0, 'Temporal Line follows the dashboard period and draws');
	try {
		// Refreshes repeat the same request; a request not seen before carries the new period.
		const before = new Set(actionRequests);
		await page.locator('.btn-time-zoomout').first().click();
		await page.waitForTimeout(5000);
		const fresh = actionRequests.filter((data) => !before.has(data));
		check(fresh.some((data) => /time_period/.test(data)),
			`Changing the dashboard time period refreshes the widgets with the new period (${fresh.length} new requests${fresh.length ? `, e.g. ${fresh[0].slice(0, 300)}` : ''})`);
	}
	catch (error) {
		check(false, `Changing the dashboard time period: ${error.message}`);
	}

	step('Every chart type');
	await page.goto(`${BASE}/zabbix.php?action=dashboard.view&dashboardid=${chartsDashboardid}`);
	await page.waitForTimeout(10000);
	await page.screenshot({ path: `${OUT}/all-charts-${version}.png`, fullPage: true });
	for (const [name] of chartWidgets) {
		const chart = widget(`ZW ${name}`);
		// ECharts charts draw a canvas; HTML renderers (tables, grids) mark the canvas area with data-zw-view="dom".
		const drew = (await chart.locator('.zw-charts-canvas canvas').count() > 0
			|| await chart.locator('.zw-charts-canvas[data-zw-view="dom"] :is(td, .zw-cell, .zw-port)').count() > 0)
			&& await chart.locator('.zw-charts-canvas').isVisible();
		const text = drew ? '' : (await chart.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
		check(drew, `${name} draws from Zabbix data${text ? `: "${text.slice(0, 300)}"` : ''}`);
	}

	step('Switch Port Panel');
	const panel = widget('ZW Switch Port Panel');
	const tiles = panel.locator('.zw-port');
	check(await tiles.count() === 14, `Switch Port Panel draws 14 ports (${await tiles.count()})`);
	const tileBox = async (identity) => panel.locator(`[aria-label^="${identity},"]`).boundingBox();
	const [one, two, three] = await Promise.all(['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3'].map(tileBox));
	check(one !== null && two !== null && three !== null && Math.abs(one.x - two.x) < 1 && two.y > one.y && three.x > one.x && Math.abs(three.y - one.y) < 1,
		'Switch Port Panel puts port 1 top-left, 2 beneath it and 3 to its right');
	check(/administratively down/.test(await panel.locator('[aria-label^="Gi1/0/6,"]').getAttribute('aria-label') ?? ''),
		'Switch Port Panel marks the admin-down port in its label');
	check(await panel.locator('[aria-label^="Gi1/0/1,"]').getAttribute('href').then((href) => /action=latest\.view/.test(href ?? '')),
		'Switch Port Panel links a port to Latest data');
	await panel.locator('[aria-label^="Gi1/0/5,"]').hover();
	const tipText = await panel.locator('.zw-port-tip').innerText().catch(() => '');
	check(/Operational status\s+down \(2\)/.test(tipText), `Switch Port Panel tooltip shows the mapped status: "${tipText.replace(/\s+/g, ' ').slice(0, 200)}"`);
	await page.mouse.move(0, 0);

	step('Showcase: each chart and its edit form');
	await showcase(page, widget);

	await page.goto(`${BASE}/zabbix.php?action=dashboard.view&dashboardid=${dashboardid}`);
	await page.waitForTimeout(5000);

	step('Open the edit form');
	await page.getByRole('button', { name: /edit dashboard/i }).click();
	await page.waitForTimeout(1000);
	await column.hover();
	await column.locator('.js-widget-edit, button[title="Edit"]').first().click();
	const dialogue = page.locator('.overlay-dialogue').last();
	await dialogue.waitFor({ timeout: 15000 });
	await page.waitForTimeout(1500);
	console.log(`dialogue form id: ${await dialogue.locator('form').first().getAttribute('id').catch(() => null)}`);
	const form = dialogue.locator('form').first();
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
	const dialogueHtml = await page.locator('.overlay-dialogue').last().innerHTML({ timeout: 2000 }).catch(() => '(no dialogue)');
	console.log(`--- dialogue HTML (first 4000 chars) ---\n${dialogueHtml.slice(0, 4000)}`);
	await page.screenshot({ path: `${OUT}/failure-${version}.png`, fullPage: true }).catch(() => {});
	await writeFile(`${OUT}/failure-${version}.html`, await page.content().catch(() => '')).catch(() => {});
}

// S09: a user who may read only the ZW tests group sees those hosts and nothing of the switch.
step('Limited user');
try {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	const viewerPage = await context.newPage();
	await watch(viewerPage);
	await viewerPage.goto(`${BASE}/index.php`);
	await viewerPage.fill('#name', viewer.username);
	await viewerPage.fill('#password', viewer.password);
	await viewerPage.click('#enter');
	await viewerPage.waitForLoadState('networkidle');
	await viewerPage.goto(`${BASE}/zabbix.php?action=dashboard.view&dashboardid=${permissionsDashboardid}`);
	await viewerPage.waitForTimeout(8000);
	await viewerPage.screenshot({ path: `${OUT}/limited-user-${version}.png`, fullPage: true });
	const viewerWidget = (name) => viewerPage.locator('.dashboard-grid-widget', { has: viewerPage.locator('.dashboard-grid-widget-header', { hasText: name }) });
	check(await viewerWidget('ZW viewer column').locator('.zw-charts-canvas canvas').count() > 0, 'Limited user sees the Column chart for permitted hosts');
	const hidden = viewerWidget('ZW viewer switch');
	const hiddenText = await hidden.innerText().catch(() => '');
	check(await hidden.locator('.zw-port').count() === 0 && !/Gi1\/0|zw-switch/.test(hiddenText),
		`Limited user sees no switch ports or names: "${hiddenText.replace(/\s+/g, ' ').slice(0, 200)}"`);
	const columnText = await viewerWidget('ZW viewer column').innerText().catch(() => '');
	check(!/zw-switch/.test(columnText), 'Limited user sees no restricted host in the Column chart');
	await context.close();
}
catch (error) {
	failures.push(`Unexpected (limited user): ${error.message}`);
	console.error(error);
}
finally {
	await browser.close();
}

check(pageErrors.length === 0, `No page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
check(consoleErrors.length === 0, `No console errors or ECharts warnings${consoleErrors.length ? `: ${consoleErrors.slice(0, 10).join(' | ')}` : ''}`);
check(failedActions.length === 0, `No failed widget actions or PHP errors${failedActions.length ? `: ${failedActions.slice(0, 10).join(' | ')}` : ''}`);

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed on Zabbix ${version}.`);
	process.exit(1);
}
console.log(`\nAll checks passed on Zabbix ${version}.`);
