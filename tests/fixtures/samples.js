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
		severities: [
			{ name: 'Not classified', color: '#97AAB3' }, { name: 'Information', color: '#7499FF' }, { name: 'Warning', color: '#FFC859' },
			{ name: 'Average', color: '#FFA059' }, { name: 'High', color: '#E97659' }, { name: 'Disaster', color: '#E45959' }
		]
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
