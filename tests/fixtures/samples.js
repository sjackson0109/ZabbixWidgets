/**
 * One valid raw payload per chart, shaped like the PHP action's response.
 * Shared by the renderer tests (through real ECharts) and the browser test.
 * All values are fixed so the output is deterministic.
 */

const TO = 1700006400; // 2023-11-15 00:00 UTC
const FROM = TO - 2 * 86400;

let nextId = 1;

function raw({ role = 'value', hostid = '1', host = 'web01', name = 'CPU utilization', key, units = '%', value = '10', value_type = 0, tags = [], history, ...extra } = {}) {
	const itemid = String(nextId++);
	return { itemid, role, hostid, host, name, key: key ?? `key.${itemid}`, units, value_type, value, clock: TO, tags, history, ...extra };
}

function hourly(base, step = 1) {
	const rows = [];
	for (let clock = FROM, index = 0; clock <= TO; clock += 1800, index++) {
		rows.push([clock, String(base + ((index * step) % 17) - 8)]);
	}
	return rows;
}

/** Every 30 minutes, leaving out samples from `skipFrom` (seconds after FROM) for `skipFor` seconds: a real gap in the data. */
function gapped(base, step, skipFrom, skipFor) {
	return hourly(base, step).filter(([clock]) => clock < FROM + skipFrom || clock >= FROM + skipFrom + skipFor);
}

/** A status item's history: state changes at fixed times, sampled every 30 minutes, with an outage in the data. */
function states(changes) {
	const rows = [];
	for (let clock = FROM; clock <= TO; clock += 1800) {
		if (clock >= FROM + 30 * 3600 && clock < FROM + 34 * 3600) {
			continue;
		}
		const current = changes.filter(([at]) => clock >= FROM + at).pop();
		rows.push([clock, current[1]]);
	}
	return rows;
}

const severities = [
	{ name: 'Not classified', color: '#97AAB3' }, { name: 'Information', color: '#7499FF' }, { name: 'Warning', color: '#FFC859' },
	{ name: 'Average', color: '#FFA059' }, { name: 'High', color: '#E97659' }, { name: 'Disaster', color: '#E45959' }
];
const statusMap = [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }, { type: 0, value: '3', newvalue: 'testing' }];

const operMap = [
	{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }, { type: 0, value: '3', newvalue: 'testing' },
	{ type: 0, value: '5', newvalue: 'dormant' }, { type: 0, value: '7', newvalue: 'lowerLayerDown' }
];
const adminMap = [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }, { type: 0, value: '3', newvalue: 'testing' }];

/**
 * A 48-port access switch with four SFP+ uplinks, as a network template
 * would collect it: operational and administrative status, speed,
 * utilisation and alias per interface, each item tagged with its interface.
 */
export function switchSeries({ access = 48, uplinks = 4, hostid = '3', host = 'core01' } = {}) {
	const series = [];
	const ports = [
		...Array.from({ length: access }, (_, index) => ({ name: `Gi1/0/${index + 1}`, n: index + 1, uplink: false })),
		...Array.from({ length: uplinks }, (_, index) => ({ name: `Te1/1/${index + 1}`, n: index + 1, uplink: true }))
	];
	for (const { name, n, uplink } of ports) {
		const adminDown = !uplink && (n === 14 || n === 35);
		const oper = uplink ? (n === 4 ? '2' : '1') : adminDown || n % 7 === 0 ? '2' : n === 13 ? '7' : n === 22 ? '9' : '1';
		const up = oper === '1';
		const alias = uplink ? (n <= 2 ? `uplink-dist0${n}` : '') : n === 1 ? 'AP-floor2' : n === 2 ? 'printer-3' : '';
		const label = `Interface ${name}(${alias})`;
		const tags = [{ tag: 'component', value: 'network' }, { tag: 'interface', value: name }];
		const item = (role, suffix, extra) => series.push(raw({
			role, hostid, host, name: `${label}: ${suffix}`, key: `net.if.${role}[${name}]`, tags, delay: 60, ...extra
		}));
		if (uplink || n !== 30) {
			item('oper', 'Operational status', { units: '', value_type: 3, value: oper, valuemap: operMap,
				problems: oper === '2' && !adminDown ? [{ name: `Interface ${name}: Link down`, severity: 3, triggerid: String(5000 + n + (uplink ? 100 : 0)) }] : [] });
		}
		item('admin', 'Administrative status', { units: '', value_type: 3, value: adminDown ? '2' : '1', valuemap: adminMap });
		const speed = uplink ? 10e9 : n === 41 ? 10e6 : n % 10 === 3 ? 100e6 : n === 30 ? null : 1e9;
		item('speed', 'Speed', { units: 'bps', value_type: 3, value: speed === null ? null : String(up ? speed : 0) });
		item('util_in', 'Inbound utilisation', { units: '%', value: up ? String((n * 7) % 60 + (uplink ? 20 : 0)) : '0',
			problems: !uplink && n === 21 ? [{ name: `Interface ${name}: High bandwidth usage`, severity: 2, triggerid: '6021' }] : [] });
		item('util_out', 'Outbound utilisation', { units: '%', value: up ? String((n * 11) % 45 + (!uplink && n === 21 ? 50 : 0)) : '0' });
		item('alias', 'Alias', { units: '', value_type: 1, value: alias });
	}
	return series;
}

export const SWITCH_CONFIG = Object.freeze({
	port_identity: 'regex', port_regex: '^Interface ((?:Gi|Te)1/\\d/(\\d+))\\(', port_regex_target: 'name',
	port_id_group: 1, port_member_group: 0, port_number_group: 2,
	port_roles_shown: 'core', port_layout: 'two_row', port_columns: 0,
	port_grouping: 'definitions', port_groups: 'Access = /^Gi/\nUplinks = /^Te/',
	port_type: 'rj45', port_type_rules: 'SFP+ = /^Te/', port_type_tag: '',
	port_fill: 'neg_speed', port_border: 'oper', port_marker: 'admin_problem',
	speed_colours: '', state_colours: '', admin_down: 'down', port_metric: 'util_max', thresholds: '', threshold_order: 'higher_worse',
	port_fixed_colour: '', port_label: 'number', port_label_regex: '', port_abbreviate: true, port_sublabel: 'speed',
	port_util_bar: 'max', stale_after: '', port_click: 'latest'
});

const common = { show_legend: true, decimals: 2, time_zone: 'Europe/London' };
const period = { from: FROM, to: TO };
const hosts = [
	{ hostid: '1', name: 'web01', groups: ['Servers/Web'], tags: [{ tag: 'uplink', value: 'core01' }], macros: { '{$CPU.TARGET}': '75' } },
	{ hostid: '2', name: 'web02', groups: ['Servers/Web'], tags: [{ tag: 'uplink', value: 'core01' }], macros: { '{$CPU.TARGET}': '80' } },
	{ hostid: '3', name: 'core01', groups: ['Network/Core'], tags: [], macros: { '{$CPU.TARGET}': '60' } }
];

export const SAMPLES = {
	column: {
		config: { ...common, group_by: 'host' },
		series: [raw({ value: '42', key: 'cpu' }), raw({ hostid: '2', host: 'web02', value: '-3', key: 'cpu' })]
	},
	stacked_bar: {
		config: { ...common, group_by: 'host' },
		series: [
			raw({ name: 'User', key: 'user', value: '20' }), raw({ name: 'System', key: 'system', value: '10' }),
			raw({ hostid: '2', host: 'web02', name: 'User', key: 'user', value: '35' })
		]
	},
	doughnut: {
		config: { ...common, show_percent: true, hide_zero: true, centre_value: 'sum' },
		series: [raw({ name: 'Used', units: 'B', value: '600' }), raw({ name: 'Free', units: 'B', value: '400' }), raw({ name: 'Cached', units: 'B', value: '0' })]
	},
	bullet: {
		config: { ...common, target_source: 'macro', target_macro: '{$CPU.TARGET}', ranges: '50, 80', pair_by: 'host' },
		series: [raw({ role: 'actual', value: '62' }), raw({ role: 'actual', hostid: '2', host: 'web02', value: '91' })],
		hosts
	},
	radar: {
		config: { ...common, radar_scale: 'per_dimension' },
		series: ['CPU', 'Memory', 'Disk'].flatMap((name, index) => [
			raw({ name, key: name, value: String(30 + index * 10) }),
			raw({ hostid: '2', host: 'web02', name, key: name, value: String(50 - index * 5) })
		])
	},
	heatmap: {
		config: { ...common, heat_x: 'time', heat_y: 'host', bucket: '4h', aggregation: 'avg', colour_min: '', colour_max: '' },
		series: [raw({ history: hourly(40) }), raw({ hostid: '2', host: 'web02', history: hourly(60, 3) })],
		time_period: period
	},
	candlestick: {
		config: { ...common, ohlc_mode: 'derived', bucket: '4h' },
		series: [raw({ role: 'source', units: '', history: hourly(100, 5) })],
		time_period: period
	},
	bubble: {
		config: { ...common, pair_by: 'host' },
		series: [
			raw({ role: 'x', name: 'CPU', value: '20' }), raw({ role: 'y', name: 'Load', units: '', value: '1.5' }), raw({ role: 'size', name: 'Sessions', units: '', value: '40' }),
			raw({ role: 'x', hostid: '2', host: 'web02', name: 'CPU', value: '70' }), raw({ role: 'y', hostid: '2', host: 'web02', name: 'Load', units: '', value: '4' }),
			raw({ role: 'size', hostid: '2', host: 'web02', name: 'Sessions', units: '', value: '160' })
		]
	},
	gantt: {
		config: { ...common, gantt_timing: 'start_end', pair_by: 'host' },
		series: [
			raw({ role: 'start', name: 'Backup start', units: 'unixtime', value: String(FROM) }),
			raw({ role: 'end', name: 'Backup end', units: 'unixtime', value: String(FROM + 5400) }),
			raw({ role: 'progress', name: 'Backup progress', value: '100' }),
			raw({ role: 'start', hostid: '2', host: 'web02', name: 'Backup start', units: 'unixtime', value: String(FROM + 3600) }),
			raw({ role: 'end', hostid: '2', host: 'web02', name: 'Backup end', units: 'unixtime', value: String(FROM + 9000) })
		]
	},
	tree: {
		config: { ...common, tree_source: 'host_group' },
		series: [raw({ value: '12' }), raw({ hostid: '2', host: 'web02', value: '18' }), raw({ hostid: '3', host: 'core01', value: '5' })],
		hosts
	},
	network: {
		config: { ...common, edge_source: 'tag', edge_tag: 'uplink' },
		series: [],
		hosts
	},
	relationship: {
		config: { ...common, source_tag: 'from', target_tag: 'to' },
		series: [
			raw({ role: 'weight', name: 'Traffic', units: 'bps', value: '300', tags: [{ tag: 'from', value: 'London' }, { tag: 'to', value: 'Paris' }] }),
			raw({ role: 'weight', name: 'Traffic', units: 'bps', value: '120', tags: [{ tag: 'from', value: 'Paris' }, { tag: 'to', value: 'Berlin' }] }),
			raw({ role: 'weight', name: 'Traffic', units: 'bps', value: '80', tags: [{ tag: 'from', value: 'Berlin' }, { tag: 'to', value: 'London' }] })
		]
	},
	lld_table: {
		config: {
			...common, row_identity: 'tag', row_tag: 'interface', table_columns: 'In = Interface *: In\nOut = Interface *: Out\nStatus = Interface *: Status',
			show_host: true, show_last_update: true, show_change: true, show_problems: true, use_valuemap: true, table_page_size: '25', table_striped: true
		},
		series: ['eth0', 'eth1', 'eth2'].flatMap((name, index) => [
			raw({ name: `Interface ${name}: In`, units: 'bps', value: String(1000 * (index + 1)), tags: [{ tag: 'interface', value: name }], previous: { value: '900', clock: TO - 60 } }),
			raw({ name: `Interface ${name}: Out`, units: 'bps', value: String(400 * (index + 1)), tags: [{ tag: 'interface', value: name }] }),
			raw({
				name: `Interface ${name}: Status`, units: '', value_type: 3, value: index === 2 ? '2' : '1', tags: [{ tag: 'interface', value: name }],
				valuemap: [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }],
				problems: index === 2 ? [{ name: 'Link down on eth2', severity: 4 }] : []
			})
		]),
		severities
	},
	pie: {
		config: { ...common, entity_by: 'item', pie_sort: 'desc', label_position: 'outside', show_percent: true, show_value: true },
		series: [raw({ name: 'Used', units: 'B', value: '600' }), raw({ name: 'Free', units: 'B', value: '300' }), raw({ name: 'Cached', units: 'B', value: '100' })]
	},
	level_gauge: {
		config: { ...common, scale_min: '0', scale_max: '{$TANK.MAX}', target_value: '70', thresholds: '60, 85', threshold_order: 'higher_worse', gauge_display: 'native', show_value: true },
		series: [raw({ name: 'Tank level', units: 'L', value: '45' }), raw({ hostid: '2', host: 'web02', name: 'Tank level', units: 'L', value: '130' }), raw({ hostid: '3', host: 'core01', name: 'Tank level', units: 'L', value: '88' })],
		hosts: hosts.map((host) => ({ ...host, macros: { '{$TANK.MAX}': '120' } }))
	},
	ranking_bar: {
		config: { ...common, entity_by: 'item', rank_order: 'desc', rank_limit: 'top', rank_count: 3, show_value: true, show_track: true, thresholds: '50, 80' },
		series: ['web01', 'web02', 'core01', 'db01'].map((host, index) => raw({ hostid: String(index + 1), host, value: String([42, 91, 12, 67][index]), key: 'cpu' })),
		hosts
	},
	treemap: {
		config: { ...common, levels: 'group, host', path_delimiter: '', max_depth: 0, pair_by: 'host' },
		series: [
			raw({ role: 'size', name: 'Disk /', units: 'B', value: '500000' }), raw({ role: 'size', name: 'Disk /var', units: 'B', value: '200000' }),
			raw({ role: 'size', hostid: '2', host: 'web02', name: 'Disk /', units: 'B', value: '300000' }),
			raw({ role: 'size', hostid: '3', host: 'core01', name: 'Disk /', units: 'B', value: '100000' }),
			raw({ role: 'colour', name: 'CPU', value: '20' }), raw({ role: 'colour', hostid: '2', host: 'web02', name: 'CPU', value: '80' })
		],
		hosts
	},
	sunburst: {
		config: { ...common, levels: 'group, host, path', path_delimiter: '/', max_depth: 0 },
		series: [
			raw({ name: 'disk/sda/reads', units: 'B', value: '50' }), raw({ name: 'disk/sda/writes', units: 'B', value: '30' }),
			raw({ name: 'disk/sdb/reads', units: 'B', value: '20' }), raw({ hostid: '2', host: 'web02', name: 'disk/sda/reads', units: 'B', value: '40' }),
			raw({ hostid: '3', host: 'core01', name: 'disk/sda/reads', units: 'B', value: '10' })
		],
		hosts
	},
	funnel: {
		config: { ...common, stages: 'Requests = Web requests\nAuthenticated = Web logins\nOrders = Web orders', funnel_order: 'listed', pct_first: true, pct_previous: true, show_value: true },
		series: [raw({ name: 'Web requests', units: '', value: '1000' }), raw({ name: 'Web logins', units: '', value: '420' }), raw({ name: 'Web orders', units: '', value: '63' })]
	},
	line: {
		config: { ...common, y_min: '', y_max: '', zero_baseline: false, smooth: false, show_points: false, max_gap: '' },
		series: [
			raw({ history: gapped(40, 1, 20 * 3600, 3 * 3600), delay: 1800 }),
			raw({ hostid: '2', host: 'web02', history: hourly(60, 3), delay: 1800 }),
			raw({ name: 'Load average', units: '', history: hourly(12, 2), delay: 1800 })
		],
		time_period: period,
		hosts
	},
	area: {
		config: { ...common, y_min: '', y_max: '', zero_baseline: true, smooth: false, show_points: false, area_mode: 'stacked', area_opacity: 40, area_gradient: false, max_gap: '' },
		series: [
			raw({ name: 'Bits received', units: 'bps', history: hourly(4000, 300), delay: 1800 }),
			raw({ name: 'Bits sent', units: 'bps', history: gapped(2000, 200, 10 * 3600, 2 * 3600), delay: 1800 })
		],
		time_period: period,
		hosts
	},
	status_matrix: {
		config: { ...common, matrix_rows: 'host', colour_by: 'value_map', colour_map: 'up = #1A9850\ndown = #D73027\ntesting = #FEE08B', show_value: true, use_valuemap: true },
		series: ['web01', 'web02', 'core01'].flatMap((host, index) => ['eth0', 'eth1', 'eth2', 'eth3'].map((port, column) => raw({
			hostid: String(index + 1), host, name: `Interface ${port}: Operational status`, key: `net.if.status[${port}]`, units: '', value_type: 3,
			value: (index + column) % 5 === 4 ? '2' : column === 3 && index === 0 ? null : (index === 2 && column === 1 ? '3' : '1'),
			valuemap: statusMap,
			problems: (index + column) % 5 === 4 ? [{ name: `Link down on ${port}`, severity: 3 }] : []
		}))),
		severities,
		hosts
	},
	state_timeline: {
		config: { ...common, use_valuemap: true, colour_map: 'up = #1A9850\ndown = #D73027', max_gap: '' },
		series: [
			raw({ name: 'Interface eth0: Operational status', units: '', value_type: 3, valuemap: statusMap, delay: 1800, history: states([[0, '1'], [9 * 3600, '2'], [11 * 3600, '1'], [40 * 3600, '3'], [41 * 3600, '1']]) }),
			raw({ hostid: '2', host: 'web02', name: 'Service state', units: '', value_type: 1, delay: 1800, history: states([[0, 'running'], [20 * 3600, 'degraded'], [26 * 3600, 'running']]) })
		],
		time_period: period
	},
	sparkline_grid: {
		config: { ...common, grid_columns: 0, tile_sort: 'name', rank_limit: 'all', rank_count: 10, show_change: true, show_minmax: true, max_gap: '' },
		series: [
			raw({ value: '33', history: hourly(40), delay: 1800 }),
			raw({ hostid: '2', host: 'web02', value: '71', history: gapped(60, 3, 5 * 3600, 4 * 3600), delay: 1800 }),
			raw({ name: 'Memory used', units: 'B', value: '6200000000', history: hourly(6000000000, 50000000), delay: 1800 }),
			raw({ hostid: '3', host: 'core01', name: 'Temperature', units: '°C', value: null, history: [] })
		],
		time_period: period
	},
	threshold_band: {
		config: { ...common, thresholds: '{$CPU.WARN}, 90', threshold_order: 'higher_worse', target_value: '50', y_min: '0', y_max: '100', smooth: false, show_points: false, max_gap: '' },
		series: [raw({ history: hourly(70, 4), delay: 1800 }), raw({ hostid: '2', host: 'web02', history: gapped(55, 3, 30 * 3600, 3 * 3600), delay: 1800 })],
		time_period: period,
		hosts: hosts.map((host) => ({ ...host, macros: { '{$CPU.WARN}': '75' } }))
	},
	switch_ports: {
		config: { ...common, ...SWITCH_CONFIG },
		series: switchSeries(),
		severities,
		hosts
	},
	calendar_heatmap: {
		config: { ...common, aggregation: 'max' },
		series: [raw({ history: hourly(50, 7) })],
		time_period: { from: TO - 60 * 86400, to: TO }
	}
};

/** The raw payload for a chart, with the chart id filled in. */
export function sample(chart) {
	return { chart, hosts: [], time_period: null, errors: [], ...structuredClone(SAMPLES[chart]) };
}
