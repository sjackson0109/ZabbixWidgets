/**
 * One valid raw payload per chart, shaped like the PHP action's response.
 * Shared by the renderer tests (through real ECharts) and the browser test.
 * All values are fixed so the output is deterministic.
 */

const TO = 1700006400; // 2023-11-15 00:00 UTC
const FROM = TO - 2 * 86400;

import { FLOOR_PLAN } from './floor-plan.js';

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
	calendar_heatmap: {
		config: { ...common, aggregation: 'max' },
		series: [raw({ history: hourly(50, 7) })],
		time_period: { from: TO - 60 * 86400, to: TO }
	},
	mixed: {
		config: {
			...common, bucket: '4h', aggregation: 'sum', y_min: '', y_max: '', zero_baseline: true, line_step: 'none', smooth: false, show_points: false, max_gap: ''
		},
		series: [
			raw({ role: 'bar', name: 'Orders', units: '', history: hourly(20, 3), delay: 1800 }),
			raw({ role: 'line', name: 'Response time', units: 's', history: hourly(12, 2).map(([clock, value]) => [clock, String(Number(value) / 100)]), delay: 1800 })
		],
		time_period: period,
		hosts
	},
	distribution: {
		config: { ...common, dist_view: 'boxplot', hist_bins: 0, show_outliers: true },
		series: [
			raw({ name: 'Response time', units: 's', history: hourly(40, 3).map(([clock, value], index) => [clock, String(index === 30 ? 2.5 : Number(value) / 100)]) }),
			raw({ hostid: '2', host: 'web02', name: 'Response time', units: 's', history: hourly(60, 5).map(([clock, value]) => [clock, String(Number(value) / 100)]) })
		],
		time_period: period
	},
	parallel: {
		config: { ...common, parallel_axes: 'CPU = CPU utilization | 0, 100\nMemory = Memory utilization | 0, 100\nLoad = Load average', pair_by: 'host', pair_tag: '' },
		series: ['web01', 'web02', 'core01'].flatMap((host, index) => [
			raw({ hostid: String(index + 1), host, name: 'CPU utilization', value: String([42, 77, 18][index]) }),
			raw({ hostid: String(index + 1), host, name: 'Memory utilization', value: String([63, 51, 30][index]) }),
			raw({ hostid: String(index + 1), host, name: 'Load average', units: '', value: String([1.2, 3.8, 0.4][index]) })
		])
	},
	sankey: {
		config: { ...common, source_tag: 'from', target_tag: 'to', sankey_orient: 'horizontal', sankey_align: 'justify', show_value: true },
		series: [
			['Internet', 'Firewall', '900'], ['Firewall', 'Web', '600'], ['Firewall', 'Mail', '250'], ['Web', 'Database', '400'], ['Web', 'Cache', '150']
		].map(([from, to, value]) => raw({ role: 'weight', name: `Traffic ${from} to ${to}`, units: 'bps', value, tags: [{ tag: 'from', value: from }, { tag: 'to', value: to }] }))
	},
	geomap: {
		config: {
			...common, geo_base: 'world', geo_file: '', geo_links: 'web01 -> core01 : WAN | net.wan.util\nweb02 -> core01', site_colour: 'thresholds',
			thresholds: '50, 80', threshold_order: 'higher_worse', show_node_labels: true
		},
		series: [
			raw({ name: 'WAN utilization', key: 'net.wan.util', value: '35' }),
			raw({ hostid: '2', host: 'web02', name: 'WAN utilization', key: 'net.wan.util', value: '91' }),
			raw({ hostid: '3', host: 'core01', name: 'WAN utilization', key: 'net.wan.util', value: '62' })
		],
		hosts: [
			{ ...hosts[0], location: { lat: '51.5072', lon: '-0.1276' } },
			{ ...hosts[1], location: { lat: '53.4808', lon: '-2.2426' } },
			{ ...hosts[2], location: { lat: '52.4862', lon: '-1.8904' } }
		]
	},
	wifi_floor: {
		config: {
			...common, floor_image: FLOOR_PLAN.name, host_tags: 'floor=2', position_source: 'macros', position_macro_x: '{$WIFI.MAP.X}',
			position_macro_y: '{$WIFI.MAP.Y}', node_positions: '', radio_by: 'key', radio_tag: '', radio_regex: '', snr_thresholds: '15, 25',
			rogue_count: 'value', show_band_24: true, show_band_5: true, show_band_6: true, show_node_labels: true,
			ring_size: 'model', plan_width: '64', tx_power_default: '', edge_level: '-67', path_loss_n: '28, 31, 31'
		},
		floor: FLOOR_PLAN,
		series: [
			['1', 'ap-lobby', [['1', '2.4', '6', '20', '31', '9'], ['2', '5', '36', '80', '27', '15'], ['3', '6', '37', '160', '22', '15']], '0'],
			['2', 'ap-east', [['1', '2.4', '11', '20', '12', '9'], ['2', '5', '36', '80', '18', '15']], '2'],
			['3', 'ap-west', [['1', '2.4', '3', '20', '24', '9'], ['2', '5', '149', '40', null, '15'], ['3', '6', '69', '160', '29', '15']], '0']
		].flatMap(([hostid, host, radios, rogues]) => [
			...radios.flatMap(([index, band, channel, width, snr, power]) => [
				raw({ role: 'band', hostid, host, name: `Radio ${index} band`, key: `wlan.radio.band[${index}]`, units: 'GHz', value_type: 1, value: band }),
				raw({ role: 'channel', hostid, host, name: `Radio ${index} channel`, key: `wlan.radio.channel[${index}]`, units: '', value_type: 3, value: channel }),
				raw({ role: 'width', hostid, host, name: `Radio ${index} channel width`, key: `wlan.radio.width[${index}]`, units: 'MHz', value_type: 3, value: width }),
				raw({ role: 'snr', hostid, host, name: `Radio ${index} SNR`, key: `wlan.radio.snr[${index}]`, units: 'dB', value: snr }),
				raw({ role: 'txpower', hostid, host, name: `Radio ${index} transmit power`, key: `wlan.radio.txpower[${index}]`, units: 'dBm', value: power })
			]),
			raw({ role: 'rogue', hostid, host, name: 'Rogue APs detected', key: 'wlan.rogue.count', units: '', value_type: 3, value: rogues })
		]),
		hosts: [
			{ hostid: '1', name: 'ap-lobby', groups: ['Wireless/Floor 2'], tags: [{ tag: 'floor', value: '2' }], macros: {}, position: { x: '18', y: '50' } },
			{ hostid: '2', name: 'ap-east', groups: ['Wireless/Floor 2'], tags: [{ tag: 'floor', value: '2' }], macros: {}, position: { x: '78', y: '28' } },
			{ hostid: '3', name: 'ap-west', groups: ['Wireless/Floor 2'], tags: [{ tag: 'floor', value: '2' }], macros: {}, position: { x: '46', y: '74' } }
		]
	},
	waterfall: {
		config: { ...common, waterfall_steps: '= Opening = Stock at start\n+ Received = Stock received\n- Shipped = Stock shipped\n- Damaged = Stock written off\n= Closing', show_value: true },
		series: [
			raw({ name: 'Stock at start', units: '', value: '1200' }), raw({ name: 'Stock received', units: '', value: '450' }),
			raw({ name: 'Stock shipped', units: '', value: '780' }), raw({ name: 'Stock written off', units: '', value: '35' })
		]
	}
};

/**
 * Presentations of existing families and new charts, drawn and saved as
 * screenshots next to the plain samples: name -> payload changes.
 */
export const VARIANTS = {
	'line-step': { chart: 'line', config: { line_step: 'after' } },
	'column-horizontal': { chart: 'column', config: { bar_orientation: 'horizontal' } },
	'stacked_bar-diverging': {
		chart: 'stacked_bar',
		config: { stack_mode: 'diverging', stack_orientation: 'vertical' },
		series: [
			raw({ name: 'Received', units: 'bps', key: 'in', value: '420' }), raw({ hostid: '2', host: 'web02', name: 'Received', units: 'bps', key: 'in', value: '260' }),
			raw({ role: 'opposing', name: 'Sent', units: 'bps', key: 'out', value: '180' }),
			raw({ role: 'opposing', hostid: '2', host: 'web02', name: 'Sent', units: 'bps', key: 'out', value: '310' })
		]
	},
	'stacked_bar-percent': {
		chart: 'stacked_bar',
		config: { stack_mode: 'percent' },
		series: [
			raw({ name: 'Used', units: 'B', key: 'used', value: '600' }), raw({ name: 'Free', units: 'B', key: 'free', value: '400' }),
			raw({ hostid: '2', host: 'web02', name: 'Used', units: 'B', key: 'used', value: '250' }), raw({ hostid: '2', host: 'web02', name: 'Free', units: 'B', key: 'free', value: '750' })
		]
	},
	'pie-rose': { chart: 'pie', config: { pie_rose: 'radius', inner_radius: 20 } },
	'bubble-scatter': { chart: 'bubble', config: { bubble_size: 'none' }, drop: 'size' },
	'level_gauge-dial': { chart: 'level_gauge', config: { gauge_style: 'dial' } },
	'level_gauge-progress': { chart: 'level_gauge', config: { gauge_style: 'progress' } },
	'level_gauge-ring': { chart: 'level_gauge', config: { gauge_style: 'ring' } },
	'network-force': { chart: 'network', config: { network_layout: 'force', node_category: 'group', edge_direction: 'undirected' } },
	'network-fixed': {
		chart: 'network',
		config: { edge_source: 'list', edge_list: 'web01 -> core01 : uplink | 400\nweb02 -> core01 : uplink | 150', network_layout: 'fixed', node_positions: 'core01 = 50, 0\nweb01 = 0, 60\nweb02 = 100, 60' }
	},
	'tree-radial': { chart: 'tree', config: { tree_layout: 'radial' } },
	'distribution-histogram': { chart: 'distribution', config: { dist_view: 'histogram' } },
	'sankey-vertical': { chart: 'sankey', config: { sankey_orient: 'vertical' } },
	'geomap-none': { chart: 'geomap', config: { geo_base: 'none' } }
};

/** The raw payload for a variant. */
export function variant(name) {
	const { chart, config, series, drop } = VARIANTS[name];
	const payload = sample(chart);
	payload.config = { ...payload.config, ...config };
	if (series) {
		payload.series = structuredClone(series);
	}
	if (drop) {
		payload.series = payload.series.filter((entry) => entry.role !== drop);
	}
	return payload;
}

/** The raw payload for a chart, with the chart id filled in. */
export function sample(chart) {
	return { chart, hosts: [], time_period: null, errors: [], ...structuredClone(SAMPLES[chart]) };
}
