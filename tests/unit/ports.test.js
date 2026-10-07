/**
 * C27 Switch Port Panel data model: port identity, joining role items,
 * ambiguity, layouts, interface types, speeds, statuses and visuals.
 */
import { describe, expect, it } from 'vitest';
import {
	abbreviate, buildPanel, buildPorts, compileCapture, interfaceTypeOf, isStale, parseSpeedText, parseStale, placePorts,
	portLink, portVisual, speedBucket, speedOf, speedPalette, statusColourMap
} from '../../src/data/ports.js';
import { getChart } from '../../src/registry/index.js';
import { validate } from '../../src/validation/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { item, payload } from '../fixtures/payload.js';
import { sample, SWITCH_CONFIG, switchSeries } from '../fixtures/samples.js';

const operMap = [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }];
const severities = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster']
	.map((name, index) => ({ name, color: ['#97AAB3', '#7499FF', '#FFC859', '#FFA059', '#E97659', '#E45959'][index] }));
const chart = getChart('switch_ports');

/** One item per port and role, tagged with its interface name. */
function interfaces(names, roles = { oper: '1' }, extra = {}) {
	return names.flatMap((name) => Object.entries(roles).map(([role, value]) => item({
		role, name: `Interface ${name}: ${role}`, key: `net.if.${role}[${name}]`, units: role === 'speed' ? 'bps' : role.startsWith('util') ? '%' : '',
		value_type: ['alias', 'description'].includes(role) ? 1 : 3, value, valuemap: role === 'oper' || role === 'admin' ? operMap : null,
		tags: [{ tag: 'interface', value: name }], ...extra
	})));
}

function panel(config, series, options = {}) {
	return payload('switch_ports', { config: { port_identity: 'tag', port_tag: 'interface', ...config }, series, severities, ...options });
}

const range = (count, from = 1) => Array.from({ length: count }, (_, index) => String(index + from));
const position = (layout, number) => {
	const cell = layout.cells.find((entry) => entry.port.number === number);
	return [cell.column, cell.row];
};

describe('port identity', () => {
	it('reads the identity from an item tag and joins role items into one port', () => {
		const { ports } = buildPorts(panel({}, interfaces(['Gi1/0/1', 'Gi1/0/2'], { oper: '1', admin: '1', speed: '1000000000' })));
		expect(ports.map((port) => port.identity)).toEqual(['Gi1/0/1', 'Gi1/0/2']);
		expect(Object.keys(ports[0].values).sort()).toEqual(['admin', 'oper', 'speed']);
	});

	it('reads the identity from the first key parameter', () => {
		const { ports } = buildPorts(panel({ port_identity: 'key' }, interfaces(['eth0', 'eth1'])));
		expect(ports.map((port) => port.identity)).toEqual(['eth0', 'eth1']);
	});

	it('reads identity, stack member and port number from capture groups', () => {
		const series = interfaces(['Gi1/0/1', 'Gi1/0/2', 'Gi2/0/1']);
		const { ports } = buildPorts(panel({
			port_identity: 'regex', port_regex: '^Interface (Gi(\\d+)/0/(\\d+)):', port_id_group: 1, port_member_group: 2, port_number_group: 3
		}, series));
		expect(ports.map((port) => [port.identity, port.member, port.number])).toEqual([['Gi1/0/1', '1', 1], ['Gi1/0/2', '1', 2], ['Gi2/0/1', '2', 1]]);
	});

	it('never takes a port number out of a compound name without a capture group', () => {
		const { ports } = buildPorts(panel({}, interfaces(['Gi1/0/12', 'xe-0/0/3', 'SFP1', 'QSFP28-1'])));
		expect(ports.every((port) => port.number === null)).toBe(true);
	});

	it('uses a plain numeric identity as the port number', () => {
		const { ports } = buildPorts(panel({}, interfaces(['3', '1', '2'])));
		expect(ports.map((port) => port.number)).toEqual([1, 2, 3]);
	});

	it('sorts identities naturally, so Gi1/0/2 comes before Gi1/0/10', () => {
		const { ports } = buildPorts(panel({}, interfaces(['Gi1/0/10', 'Gi1/0/2', 'Gi1/0/1'])));
		expect(ports.map((port) => port.identity)).toEqual(['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/10']);
	});

	it('reports items without an identity', () => {
		const series = [...interfaces(['eth0']), item({ role: 'oper', name: 'Untagged', tags: [] })];
		const result = buildPorts(panel({}, series));
		expect(result.unresolved.map((entry) => entry.name)).toEqual(['Untagged']);
	});

	it('rejects an invalid regular expression and a missing capture group', () => {
		expect(compileCapture('(', 'port expression').error).toMatch(/not a valid regular expression/);
		expect(compileCapture('Gi(\\d+)', 'port expression', [1, 2]).error).toMatch(/1 capture group, but the settings use group 2/);
		const result = validate(chart, panel({ port_identity: 'regex', port_regex: '([' }, interfaces(['eth0'])));
		expect(result.errors.map((error) => error.code)).toEqual(['invalid_port_identity']);
	});
});

describe('ambiguity is reported, never resolved', () => {
	it('names the port, role and items when two items match one port and role', () => {
		const series = [...interfaces(['Gi1/0/1']), ...interfaces(['Gi1/0/1'])];
		const { ambiguous } = buildPorts(panel({}, series));
		expect(ambiguous).toHaveLength(1);
		expect(ambiguous[0]).toMatchObject({ identity: 'Gi1/0/1', role: 'oper' });
		const result = validate(chart, panel({}, series));
		expect(result.errors[0].code).toBe('ambiguous_port');
		expect(result.errors[0].message).toContain('Gi1/0/1');
		expect(result.errors[0].message).toContain('Operational status');
		expect(result.errors[0].message).toContain(`item ${series[0].itemid}`);
		expect(result.errors[0].message).toContain(`item ${series[1].itemid}`);
	});

	it('rejects one item selected for two roles', () => {
		const [oper] = interfaces(['Gi1/0/1']);
		const result = validate(chart, panel({}, [oper, { ...oper, role: 'admin' }]));
		expect(result.errors.map((error) => error.code)).toContain('shared_port_item');
	});

	it('rejects a port number capture that is not a whole number', () => {
		const result = validate(chart, panel({ port_identity: 'regex', port_regex: '^Interface (\\S+?(\\w)):', port_number_group: 2 }, interfaces(['Gi1/0/a'])));
		expect(result.errors.map((error) => error.code)).toContain('invalid_port_number');
	});

	it('requires items for at least one role', () => {
		expect(validate(chart, panel({}, [])).errors.map((error) => error.code)).toEqual(['no_port_items']);
	});
});

describe('layouts', () => {
	const numbered = (count) => buildPorts(panel({}, interfaces(range(count)))).ports;

	it('lays 24 ports out in one row', () => {
		const layout = placePorts(numbered(24), 'single_row');
		expect([layout.columns, layout.rows]).toEqual([24, 1]);
		expect(position(layout, 1)).toEqual([0, 0]);
		expect(position(layout, 24)).toEqual([23, 0]);
	});

	for (const count of [24, 48]) {
		it(`lays ${count} ports out in two rows, odd over even`, () => {
			const layout = placePorts(numbered(count), 'two_row');
			expect([layout.columns, layout.rows]).toEqual([count / 2, 2]);
			expect(position(layout, 1)).toEqual([0, 0]);
			expect(position(layout, 2)).toEqual([0, 1]);
			expect(position(layout, 3)).toEqual([1, 0]);
			expect(position(layout, count - 1)).toEqual([count / 2 - 1, 0]);
			expect(position(layout, count)).toEqual([count / 2 - 1, 1]);
			const top = layout.cells.filter((cell) => cell.row === 0).map((cell) => cell.port.number);
			expect(top.every((number) => number % 2 === 1)).toBe(true);
		});
	}

	it('keeps gaps in the numbering as empty places', () => {
		const ports = buildPorts(panel({}, interfaces(['1', '2', '5', '6']))).ports;
		const layout = placePorts(ports, 'two_row');
		expect(position(layout, 5)).toEqual([2, 0]);
		expect(layout.columns).toBe(3);
	});

	it('wraps into blocks of columns and keeps odd over even in each block', () => {
		const layout = placePorts(numbered(48), 'two_row', 12);
		expect([layout.columns, layout.rows]).toEqual([12, 4]);
		expect(position(layout, 25)).toEqual([0, 2]);
		expect(position(layout, 26)).toEqual([0, 3]);
	});

	it('uses two rows automatically only when every port has a unique physical number', () => {
		expect(placePorts(numbered(8), 'auto').rows).toBe(2);
		const named = buildPorts(panel({}, interfaces(['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3']))).ports;
		expect(placePorts(named, 'auto').rows).toBe(1);
	});

	it('reports duplicate numbers and falls back to name order', () => {
		const series = interfaces(['Gi1/0/1', 'Gi2/0/1']);
		const config = { port_identity: 'regex', port_regex: '^Interface (Gi\\d/0/(\\d+)):', port_number_group: 2 };
		const result = validate(chart, panel(config, series));
		expect(result.ok).toBe(true);
		expect(result.warnings.map((warning) => warning.code)).toEqual(['duplicate_port_numbers']);
	});

	it('gives each stack member its own panel with the same layout rules', () => {
		const series = interfaces(['Gi1/0/1', 'Gi1/0/2', 'Gi2/0/1', 'Gi2/0/2']);
		const { sections } = buildPanel(panel({
			port_identity: 'regex', port_regex: '^Interface (Gi(\\d)/0/(\\d+)):', port_member_group: 2, port_number_group: 3
		}, series));
		expect(sections.map((section) => section.member)).toEqual(['1', '2']);
		for (const section of sections) {
			expect(position(section.groups[0].layout, 1)).toEqual([0, 0]);
			expect(position(section.groups[0].layout, 2)).toEqual([0, 1]);
		}
	});

	it('groups copper access ports and SFP uplinks, each numbered on its own', () => {
		const data = normalisePayload(sample('switch_ports'));
		const [section] = buildPanel(data).sections;
		expect(section.groups.map((group) => group.name)).toEqual(['Access', 'Uplinks']);
		expect([section.groups[0].layout.columns, section.groups[0].layout.rows]).toEqual([24, 2]);
		expect([section.groups[1].layout.columns, section.groups[1].layout.rows]).toEqual([2, 2]);
		expect(section.groups[0].ports.every((port) => port.type.id === 'rj45')).toBe(true);
		expect(section.groups[1].ports.every((port) => port.type.id === 'sfp_plus')).toBe(true);
	});

	it('handles 128 ports in one aggregate pass', () => {
		const series = interfaces(range(128), { oper: '1', admin: '1', speed: '1000000000' });
		const started = performance.now();
		const result = validate(chart, panel({ port_layout: 'two_row' }, series));
		const { sections } = buildPanel(panel({ port_layout: 'two_row' }, series));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(result.errors).toEqual([]);
		expect(sections[0].groups[0].layout.cells).toHaveLength(128);
		expect([sections[0].groups[0].layout.columns, sections[0].groups[0].layout.rows]).toEqual([64, 2]);
	});
});

describe('interface types', () => {
	it('applies type rules, then the type tag, then the default', () => {
		const series = [
			...interfaces(['1', '2', '49']),
			...interfaces(['mgmt0'], { oper: '1' }, { tags: [{ tag: 'interface', value: 'mgmt0' }, { tag: 'media', value: 'Management' }] })
		];
		const data = panel({ port_type: 'copper', port_type_rules: 'SFP+ = 49-52', port_type_tag: 'media' }, series);
		const { ports } = buildPanel(data);
		expect(Object.fromEntries(ports.map((port) => [port.identity, port.type.id]))).toEqual({ 1: 'copper', 2: 'copper', 49: 'sfp_plus', mgmt0: 'management' });
	});

	it('reports unknown type names and broken rule lines', () => {
		const result = validate(chart, panel({ port_type_rules: 'Token ring = 1-4\nnonsense' }, interfaces(['1'])));
		expect(result.errors.map((error) => error.code).sort()).toEqual(['invalid_port_types', 'invalid_port_types']);
	});

	it('lets the user beat the type tag', () => {
		const [entry] = interfaces(['1'], { oper: '1' }, { tags: [{ tag: 'interface', value: '1' }, { tag: 'media', value: 'fibre' }] });
		const port = buildPorts(panel({}, [entry])).ports[0];
		expect(interfaceTypeOf(port, { port_type_tag: 'media', port_type_rules: 'QSFP28 = 1' }).id).toBe('qsfp28');
	});
});

describe('speeds', () => {
	it('parses numbers with bit-rate units and text with a unit or prefix', () => {
		expect(speedOf({ value: 1000000000, units: 'bps' })).toBe(1e9);
		expect(speedOf({ value: 1000000000, units: '' })).toBeNull();
		expect(['1 Gbps', '1 Gbit/s', '1G', '1000M'].map(parseSpeedText)).toEqual([1e9, 1e9, 1e9, 1e9]);
		expect(parseSpeedText('1000')).toBeNull();
		expect(speedOf({ value: 0, units: 'bps' })).toBeNull();
	});

	it('puts speeds in buckets, with unknown speeds left neutral', () => {
		const palette = speedPalette('');
		expect(['10M', '100M', '1G', '2.5G', '10G', '25G', '40G', '100G', '400G'].map((text) => speedBucket(parseSpeedText(text), palette).label))
			.toEqual(['10M', '100M', '1G', '2.5G', '10G', '25G', '40G', '100G', '400G']);
		expect(speedBucket(null, palette)).toMatchObject({ colour: null, unknown: true });
		expect(speedBucket(3e9, palette).label).toBe('Other speed (3G)');
	});

	it('takes custom bucket colours and new buckets', () => {
		const palette = speedPalette('1G = #112233\n800G = #445566\nother = #000000\nunknown = #eeeeee\nbad line');
		expect(speedBucket(1e9, palette).colour).toBe('#112233');
		expect(speedBucket(8e11, palette)).toMatchObject({ label: '800G', colour: '#445566' });
		expect(speedBucket(3e9, palette).colour).toBe('#000000');
		expect(speedBucket(null, palette).colour).toBe('#eeeeee');
		expect(palette.errors.map((line) => line.line)).toEqual([5]);
	});
});

describe('visual channels', () => {
	const options = { palette: speedPalette(''), statusColours: statusColourMap('').entries, severities, host: null, now: 1700000000 };
	const visualOf = (roles, config = {}, extra = {}) => {
		const data = panel(config, interfaces(['1'], roles, extra));
		return portVisual(buildPanel(data).ports[0], { port_fill: 'neg_speed', port_border: 'oper', admin_down: 'down', ...config }, options);
	};

	it('fills by negotiated speed and borders by operational status', () => {
		const visual = visualOf({ oper: '1', speed: '1000000000' });
		expect(visual.fill).toBe('#56B4E9');
		expect(visual.fillLabel).toBe('1G');
		expect(visual.border).toBe('#009E73');
		expect(visual.aria).toBe('1, operational status up, speed 1 Gbps');
	});

	it('shows a missing speed as unknown and neutral', () => {
		const visual = visualOf({ oper: '1' });
		expect(visual.fill).toBeNull();
		expect(visual.unknownFill).toBe(true);
		expect(visual.aria).toContain('speed unknown');
	});

	it('shows a missing operational status with a dashed border and a note', () => {
		const visual = visualOf({ speed: '1000000000' });
		expect(visual.border).toBeNull();
		expect(visual.borderStyle).toBe('dashed');
		expect(visual.missing).toContain('No operational status');
	});

	it('keeps an unknown status value neutral and says it is not in the value map', () => {
		const visual = visualOf({ oper: '9' });
		expect(visual.border).toBeNull();
		expect(visual.missing).toContain('Operational status 9 is not in the value map');
	});

	it('does not treat a raw non-zero status as healthy without a value map', () => {
		const visual = visualOf({ oper: '1' }, {}, { valuemap: null });
		expect(visual.border).toBeNull();
	});

	it('marks admin down differently from an operational failure', () => {
		const adminDown = visualOf({ oper: '2', admin: '2' });
		const operDown = visualOf({ oper: '2', admin: '1' }, { port_marker: 'admin_problem' });
		expect(adminDown).toMatchObject({ adminDown: true, borderStyle: 'dotted', markAdmin: true });
		expect(adminDown.aria).toContain('administratively down');
		expect(operDown).toMatchObject({ adminDown: false, borderStyle: 'solid', markAdmin: false, border: '#D55E00' });
	});

	it('colours by utilisation thresholds from macros, without estimating utilisation', () => {
		const config = { port_fill: 'thresholds', port_metric: 'util_max', thresholds: '{$IF.UTIL.WARN}, 90', threshold_order: 'higher_worse' };
		const data = panel(config, interfaces(['1'], { util_in: '85', util_out: '20' }));
		const port = buildPanel(data).ports[0];
		const visual = portVisual(port, config, { ...options, host: { macros: { '{$IF.UTIL.WARN}': '70' } } });
		expect(visual.fillLabel).toBe('70 % to 90 %');
		expect(visual.fill).not.toBeNull();
		const traffic = portVisual(buildPanel(panel(config, interfaces(['1'], { traffic_in: '1000' }))).ports[0], config, options);
		expect(traffic.fill).toBeNull();
	});

	it('requires thresholds that resolve when colouring by thresholds', () => {
		const result = validate(chart, panel({ port_fill: 'thresholds', thresholds: '' }, interfaces(['1'], { util_in: '5' })));
		expect(result.errors.map((error) => error.code)).toEqual(['no_thresholds']);
	});

	it('marks the highest problem severity with the Zabbix colour', () => {
		const visual = visualOf({ oper: '1' }, { port_marker: 'problem' }, {
			problems: [{ name: 'Warning', severity: 2, triggerid: '1' }, { name: 'High', severity: 4, triggerid: '2' }]
		});
		expect(visual.markProblem).toBe('#E97659');
		expect(visual.aria).toContain('problem: High');
		expect(visual.fill).toBeNull();
	});

	it('marks stale data without calling it down', () => {
		const data = panel({}, interfaces(['1'], { oper: '1' }, { clock: 1000, delay: 60 }));
		const port = buildPanel(data).ports[0];
		expect(isStale(port, parseStale('3x'), 1000 + 200)).toBe(true);
		expect(isStale(port, parseStale('10m'), 1000 + 200)).toBe(false);
		const visual = portVisual(port, { stale_after: '1m' }, { ...options, now: 2000 });
		expect(visual.stale).toBe(true);
		expect(visual.border).toBe('#009E73');
		expect(parseStale('soon').error).not.toBeNull();
	});

	it('abbreviates long names for display only', () => {
		expect(abbreviate('GigabitEthernet1/0/1')).toBe('Gi1/0/1');
		expect(abbreviate('TenGigabitEthernet1/1/1')).toBe('Te1/1/1');
		expect(abbreviate('Gi1/0/1')).toBe('Gi1/0/1');
		const visual = visualOf({ oper: '1' });
		expect(visual.label).toBe('1');
	});

	it('lists tooltip rows in the fixed order and only for data that exists', () => {
		const visual = visualOf({ alias: 'uplink', oper: '1', admin: '1', speed: '10000000000', util_in: '12' });
		expect(visual.tooltip.map((row) => row.label)).toEqual([
			'Interface', 'Host', 'Alias', 'Interface type', 'Operational status', 'Administrative status', 'Negotiated speed', 'Inbound utilisation'
		]);
	});
});

describe('links', () => {
	it('builds ordinary Zabbix addresses from ids and encoded names', () => {
		const port = { hostid: '10084', identity: 'Gi1/0/1 &x', values: { oper: { itemid: '42', numeric: false } }, items: [], problems: [{ triggerid: '7' }, { triggerid: 'x' }] };
		expect(portLink(port, 'latest')).toBe('zabbix.php?action=latest.view&hostids%5B%5D=10084&name=Gi1%2F0%2F1+%26x&filter_set=1');
		expect(portLink(port, 'history')).toBe('history.php?action=showvalues&itemids%5B%5D=42');
		expect(portLink(port, 'problems')).toBe('zabbix.php?action=problem.view&filter_set=1&hostids%5B%5D=10084&triggerids%5B%5D=7');
		expect(portLink(port, 'none')).toBeNull();
		expect(portLink({ ...port, hostid: 'javascript:1' }, 'latest')).toBeNull();
	});
});

describe('sample switch', () => {
	it('passes its contract with 52 ports', () => {
		const data = normalisePayload(sample('switch_ports'));
		const result = validate(chart, data);
		expect(result.errors).toEqual([]);
		expect(buildPanel(data).ports).toHaveLength(52);
	});

	it('builds the same panel from a larger switch', () => {
		const data = payload('switch_ports', { config: SWITCH_CONFIG, series: switchSeries({ access: 96, uplinks: 8 }), severities });
		expect(validate(chart, data).errors).toEqual([]);
	});
});
