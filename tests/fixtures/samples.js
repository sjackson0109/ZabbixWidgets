/**
 * One valid raw payload per chart, shaped like the PHP action's response.
 * Shared by the renderer tests (through real ECharts) and the browser test.
 * All values are fixed so the output is deterministic.
 */

const TO = 1700006400; // 2023-11-15 00:00 UTC
const FROM = TO - 2 * 86400;

let nextId = 1;

function raw({ role = 'value', hostid = '1', host = 'web01', name = 'CPU utilization', key, units = '%', value = '10', tags = [], history } = {}) {
	const itemid = String(nextId++);
	return { itemid, role, hostid, host, name, key: key ?? `key.${itemid}`, units, value_type: 0, value, clock: TO, tags, history };
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
