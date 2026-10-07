/**
 * C27 Switch Port Panel: turns interface items that already exist in Zabbix
 * into ports.
 *
 * Every item of every role is given a port identity from what the item
 * carries (a tag, its first key parameter, or the user's regular expression),
 * and the role items of one identity on one host become one port. Two items
 * for the same port and role, or one item in two roles, are reported rather
 * than resolved by picking one.
 *
 * Nothing here discovers interfaces or infers topology. Physical port numbers
 * come only from identities that are plain numbers or from an explicit
 * capture group; groups, types and stack members come only from the user's
 * settings or from tags.
 */
import { tagValue } from './normalise.js';
import { keyParameters } from './identity.js';
import { mapValue } from './valuemap.js';
import { displayUnits, formatValue } from './units.js';
import { parseBucket } from './aggregate.js';
import { wildcard } from './patterns.js';
import { mappedColour, parseColourMap, stateOf } from './states.js';
import { bandColours, bandIndex, resolveScale } from './thresholds.js';
import { isHexColour } from '../utils/colour.js';
import { naturalCompare } from '../utils/natural.js';

/** Roles in the order the tooltip lists them. */
export const PORT_ROLES = Object.freeze([
	'alias', 'description', 'oper', 'admin', 'speed', 'cfg_speed', 'duplex', 'traffic_in', 'traffic_out', 'util', 'util_in', 'util_out',
	'errors_in', 'errors_out', 'discards', 'poe_state', 'poe_power', 'vlan', 'pvid', 'mtu', 'last_change'
]);

export const ROLE_LABELS = Object.freeze({
	oper: 'Operational status',
	admin: 'Administrative status',
	speed: 'Negotiated speed',
	cfg_speed: 'Configured speed',
	util: 'Utilisation',
	util_in: 'Inbound utilisation',
	util_out: 'Outbound utilisation',
	traffic_in: 'Inbound traffic',
	traffic_out: 'Outbound traffic',
	errors_in: 'Inbound errors',
	errors_out: 'Outbound errors',
	discards: 'Discards',
	duplex: 'Duplex',
	poe_state: 'PoE state',
	poe_power: 'PoE power',
	vlan: 'VLAN',
	pvid: 'PVID',
	alias: 'Alias',
	description: 'Description',
	mtu: 'MTU',
	last_change: 'Last change'
});

/**
 * Generic interface styles. "shape" picks the drawing: an RJ45-like socket,
 * an SFP cage, a wider QSFP cage, a round fibre port, or a marked special port.
 */
export const INTERFACE_TYPES = Object.freeze([
	{ id: 'rj45', label: 'RJ45', shape: 'socket', names: ['rj45'] },
	{ id: 'sfp', label: 'SFP', shape: 'cage', names: ['sfp'] },
	{ id: 'sfp_plus', label: 'SFP+', shape: 'cage', names: ['sfp+', 'sfpplus'] },
	{ id: 'sfp28', label: 'SFP28', shape: 'cage', names: ['sfp28'] },
	{ id: 'qsfp', label: 'QSFP', shape: 'wide', names: ['qsfp'] },
	{ id: 'qsfp_plus', label: 'QSFP+', shape: 'wide', names: ['qsfp+', 'qsfpplus'] },
	{ id: 'qsfp28', label: 'QSFP28', shape: 'wide', names: ['qsfp28'] },
	{ id: 'qsfp56', label: 'QSFP56', shape: 'wide', names: ['qsfp56'] },
	{ id: 'qsfp_dd', label: 'QSFP-DD', shape: 'wide', names: ['qsfpdd'] },
	{ id: 'fibre', label: 'Fibre', shape: 'fibre', names: ['fibre', 'fiber', 'optical'] },
	{ id: 'copper', label: 'Copper', shape: 'socket', names: ['copper'] },
	{ id: 'generic', label: 'Generic', shape: 'socket', names: ['generic', 'interface'] },
	{ id: 'management', label: 'Management', shape: 'special', names: ['management', 'mgmt'] },
	{ id: 'console', label: 'Console', shape: 'special', names: ['console'] },
	{ id: 'stack', label: 'Stack', shape: 'special', names: ['stack', 'stacking'] },
	{ id: 'other', label: 'Other', shape: 'socket', names: ['other'] }
]);

const TYPE_BY_NAME = new Map(INTERFACE_TYPES.flatMap((type) => type.names.map((name) => [name, type])));
const TYPE_BY_ID = new Map(INTERFACE_TYPES.map((type) => [type.id, type]));

/** The interface type a user wrote ("SFP+", "qsfp-dd", "Fiber"), or null. */
export function parseInterfaceType(text) {
	const name = String(text ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
	return TYPE_BY_NAME.get(name) ?? null;
}

/**
 * Compiles a user's regular expression and checks it has the capture groups
 * the settings refer to. Returns { regex, error }.
 */
export function compileCapture(text, label, groups = [1]) {
	const source = String(text ?? '').trim();
	if (source === '') {
		return { regex: null, error: `Enter the ${label}.` };
	}
	let regex;
	try {
		regex = new RegExp(source);
	}
	catch (exception) {
		return { regex: null, error: `The ${label} is not a valid regular expression: ${exception.message}.` };
	}
	// Matching an empty alternative yields one slot per capture group.
	const count = new RegExp(`${source}|`).exec('').length - 1;
	const missing = groups.filter((group) => group > count);
	if (missing.length > 0) {
		return { regex: null, error: `The ${label} has ${count} capture group${count === 1 ? '' : 's'}, but the settings use group ${Math.max(...missing)}.` };
	}
	return { regex, error: null };
}

/** How port identities are read, from the widget settings. Returns { settings, error }. */
export function identitySettings(config) {
	const source = config.port_identity ?? 'tag';
	const groups = {
		id: Number(config.port_id_group) || 1,
		member: Number(config.port_member_group) || 0,
		number: Number(config.port_number_group) || 0
	};
	if (source === 'tag') {
		const tag = String(config.port_tag ?? '').trim();
		return tag === '' ? { settings: null, error: 'Enter the item tag that names the interface, for example "interface".' } : { settings: { source, tag }, error: null };
	}
	if (source === 'regex') {
		const { regex, error } = compileCapture(config.port_regex, 'port expression', [groups.id, groups.member, groups.number].filter((group) => group > 0));
		return error === null
			? { settings: { source, regex, target: config.port_regex_target === 'key' ? 'key' : 'name', groups }, error: null }
			: { settings: null, error };
	}
	return { settings: { source: 'key' }, error: null };
}

/**
 * The port an item belongs to: { identity, member, number, badNumber } or null.
 * A physical port number is read from an explicit capture group, or from an
 * identity that is a plain number; it is never picked out of a compound name.
 */
export function portIdentity(entry, settings) {
	let identity = null;
	let member = null;
	let numberText = null;
	if (settings.source === 'tag') {
		identity = tagValue(entry.tags, settings.tag);
	}
	else if (settings.source === 'key') {
		[identity = null] = keyParameters(entry.key);
	}
	else {
		const match = settings.regex.exec(settings.target === 'key' ? entry.key : entry.name);
		if (match !== null) {
			identity = match[settings.groups.id] ?? null;
			member = settings.groups.member > 0 ? (match[settings.groups.member] ?? null) : null;
			numberText = settings.groups.number > 0 ? (match[settings.groups.number] ?? null) : null;
		}
	}
	identity = identity === null ? null : String(identity).trim();
	if (identity === null || identity === '') {
		return null;
	}
	let number = null;
	let badNumber = false;
	if (numberText !== null) {
		if (/^\d+$/.test(numberText.trim())) {
			number = Number(numberText.trim());
		}
		else {
			badNumber = true;
		}
	}
	else if (/^\d+$/.test(identity)) {
		number = Number(identity);
	}
	return { identity, member: member === null || member.trim() === '' ? null : member.trim(), number, badNumber };
}

/**
 * Joins role items into ports.
 * Returns { ports, error, unresolved, ambiguous, shared, badNumbers }:
 * - ambiguous: [{ host, identity, role, items }] two or more items for one port and role;
 * - shared: [{ item, roles }] one item selected for several roles;
 * - unresolved: items without an identity;
 * - badNumbers: items whose port number capture is not a whole number.
 */
export function buildPorts(payload) {
	const result = { ports: [], error: null, unresolved: [], ambiguous: [], shared: [], badNumbers: [] };
	const { settings, error } = identitySettings(payload.config);
	if (error !== null) {
		result.error = error;
		return result;
	}

	const rolesByItem = new Map();
	for (const entry of payload.series) {
		rolesByItem.set(entry.itemid, [...(rolesByItem.get(entry.itemid) ?? []), entry]);
	}
	for (const entries of rolesByItem.values()) {
		if (entries.length > 1) {
			result.shared.push({ item: entries[0], roles: entries.map((entry) => entry.role) });
		}
	}

	const ports = new Map();
	const collisions = new Map();
	for (const entry of payload.series) {
		const found = portIdentity(entry, settings);
		if (found === null) {
			result.unresolved.push(entry);
			continue;
		}
		if (found.badNumber) {
			result.badNumbers.push(entry);
		}
		const key = `${entry.hostid}\u0000${found.identity}`;
		let port = ports.get(key);
		if (port === undefined) {
			port = {
				key, hostid: entry.hostid, host: entry.host, identity: found.identity, member: found.member, number: found.number,
				values: {}, items: [], problems: [], severity: null
			};
			ports.set(key, port);
		}
		port.member ??= found.member;
		port.number ??= found.number;
		port.items.push(entry);
		const existing = port.values[entry.role];
		if (existing !== undefined && existing.itemid !== entry.itemid) {
			const collisionKey = `${key}\u0000${entry.role}`;
			const record = collisions.get(collisionKey) ?? { host: entry.host, identity: found.identity, role: entry.role, items: [existing] };
			record.items.push(entry);
			collisions.set(collisionKey, record);
			continue;
		}
		port.values[entry.role] = entry;
	}
	result.ambiguous = [...collisions.values()];

	for (const port of ports.values()) {
		const seen = new Set();
		for (const entry of port.items) {
			for (const problem of entry.problems ?? []) {
				const id = problem.triggerid ?? problem.name;
				if (!seen.has(id)) {
					seen.add(id);
					port.problems.push(problem);
				}
			}
		}
		port.problems.sort((a, b) => b.severity - a.severity || naturalCompare(a.name, b.name));
		port.severity = port.problems.length > 0 ? port.problems[0].severity : null;
	}

	result.ports = [...ports.values()].sort(comparePorts);
	return result;
}

/** Port order: host, stack member, physical number where known, then identity. */
export function comparePorts(a, b) {
	return naturalCompare(a.host, b.host) || naturalCompare(a.hostid, b.hostid)
		|| naturalCompare(a.member ?? '', b.member ?? '')
		|| (a.number !== null && b.number !== null ? a.number - b.number : 0)
		|| naturalCompare(a.identity, b.identity);
}

/**
 * Parses one port selection: "1-48", "49, 50", "/^Te/", "Gi1/0/*".
 * Returns { test(port), error }. Numbers and ranges match physical port
 * numbers; regular expressions and wildcards match the identity.
 */
export function parsePortSelection(text) {
	const source = String(text ?? '').trim();
	const regex = /^\/(.*)\/([i]?)$/.exec(source);
	if (regex !== null) {
		try {
			const compiled = new RegExp(regex[1], regex[2]);
			return { test: (port) => compiled.test(port.identity), error: null };
		}
		catch (exception) {
			return { test: () => false, error: `"${source}" is not a valid regular expression: ${exception.message}` };
		}
	}
	const parts = source.split(',').map((part) => part.trim()).filter((part) => part !== '');
	if (parts.length === 0) {
		return { test: () => false, error: 'an empty port selection' };
	}
	const tests = parts.map((part) => {
		const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
		if (range !== null) {
			const [low, high] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
			return (port) => port.number !== null && port.number >= low && port.number <= high;
		}
		if (/^\d+$/.test(part)) {
			return (port) => port.number === Number(part);
		}
		const pattern = wildcard(part);
		return (port) => pattern.test(port.identity);
	});
	return { test: (port) => tests.some((test) => test(port)), error: null };
}

/**
 * Parses "Name = selection" lines (port groups, interface types).
 * Returns { rules: [{ name, test }], errors: [{ line, text, reason }] }.
 */
export function parsePortRules(text) {
	const rules = [];
	const errors = [];
	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		const separator = line.indexOf('=');
		const name = separator === -1 ? '' : line.slice(0, separator).trim();
		const selection = separator === -1 ? '' : line.slice(separator + 1).trim();
		if (name === '' || selection === '') {
			errors.push({ line: index + 1, text: line, reason: 'it is not in the form "Name = ports"' });
			return;
		}
		const { test, error } = parsePortSelection(selection);
		if (error !== null) {
			errors.push({ line: index + 1, text: line, reason: error });
			return;
		}
		rules.push({ name, test });
	});
	return { rules, errors };
}

/** Interface type rules: { rules: [{ type, test }], errors }. */
export function parseTypeRules(text) {
	const { rules, errors } = parsePortRules(text);
	const typed = [];
	for (const rule of rules) {
		const type = parseInterfaceType(rule.name);
		if (type === null) {
			errors.push({ line: null, text: rule.name, reason: `"${rule.name}" is not an interface type (${INTERFACE_TYPES.map((entry) => entry.label).join(', ')})` });
		}
		else {
			typed.push({ type, test: rule.test });
		}
	}
	return { rules: typed, errors };
}

function portTag(port, name) {
	for (const role of ['oper', ...PORT_ROLES]) {
		const entry = port.values[role];
		const value = entry === undefined ? null : tagValue(entry.tags, name);
		if (value !== null && value !== '') {
			return value;
		}
	}
	return null;
}

/** A port's interface type: the user's rules first, then the type tag, then the default type. */
export function interfaceTypeOf(port, config, typeRules = parseTypeRules(config.port_type_rules).rules) {
	const rule = typeRules.find((entry) => entry.test(port));
	if (rule !== undefined) {
		return rule.type;
	}
	const tagName = String(config.port_type_tag ?? '').trim();
	const tagged = tagName === '' ? null : parseInterfaceType(portTag(port, tagName));
	return tagged ?? TYPE_BY_ID.get(config.port_type) ?? TYPE_BY_ID.get('rj45');
}

/** The text before the first digit of an identity ("Gi" for "Gi1/0/1"), for grouping by prefix. */
export function identityPrefix(identity) {
	return /^([^\d]*)/.exec(identity)[1].replace(/[\s/:._-]+$/, '');
}

const OTHER_GROUP = 'Other';

/** The group a port is shown in, or "" when ports are not grouped. */
function groupOf(port, config, groupRules) {
	switch (config.port_grouping) {
		case 'definitions':
			return groupRules.find((rule) => rule.test(port))?.name ?? OTHER_GROUP;
		case 'type':
			return port.type.label;
		case 'prefix':
			return identityPrefix(port.identity) || OTHER_GROUP;
		case 'tag':
			return portTag(port, String(config.port_group_tag ?? '').trim()) ?? OTHER_GROUP;
		default:
			return '';
	}
}

function groupOrder(config, groupRules) {
	if (config.port_grouping === 'definitions') {
		const order = [...new Set(groupRules.map((rule) => rule.name)), OTHER_GROUP];
		return (a, b) => order.indexOf(a) - order.indexOf(b);
	}
	if (config.port_grouping === 'type') {
		const order = INTERFACE_TYPES.map((type) => type.label);
		return (a, b) => order.indexOf(a) - order.indexOf(b);
	}
	return (a, b) => (a === OTHER_GROUP) - (b === OTHER_GROUP) || naturalCompare(a, b);
}

/**
 * Grid positions for one group of ports (already in port order).
 *
 * Two rows: odd port numbers along the top, even ones beneath them, port 1
 * top-left, port 2 under port 1 and port 3 to the right of port 1; gaps in
 * the numbering stay as empty places. Ports without physical numbers fill the
 * same pattern in their natural order. One row: ports left to right.
 * "Columns" wraps a long panel into blocks while keeping that pattern.
 * Returns { cells: [{ port, column, row }], columns, rows, numbered, duplicates }.
 */
export function placePorts(ports, layout, columnsPerBlock = 0) {
	const numbers = ports.map((port) => port.number);
	const allNumbered = ports.length > 0 && numbers.every((number) => number !== null);
	const duplicates = allNumbered ? [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))] : [];
	const numbered = allNumbered && duplicates.length === 0;
	const mode = layout === 'auto' ? (numbered ? 'two_row' : 'single_row') : layout;
	const limit = Math.max(0, Math.floor(Number(columnsPerBlock) || 0));

	let cells;
	if (mode === 'single_row') {
		cells = ports.map((port, index) => ({ port, column: index, row: 0 }));
		if (limit > 0) {
			cells = cells.map((cell) => ({ ...cell, column: cell.column % limit, row: Math.floor(cell.column / limit) }));
		}
	}
	else {
		let positions;
		if (numbered) {
			const lowest = Math.min(...numbers);
			// The first column starts at an odd number, so odd numbers are always on top.
			const base = Math.abs(lowest % 2) === 1 ? lowest : lowest - 1;
			positions = ports.map((port) => ({ column: Math.floor((port.number - base) / 2), row: (port.number - base) % 2 }));
		}
		else {
			positions = ports.map((_, index) => ({ column: Math.floor(index / 2), row: index % 2 }));
		}
		cells = ports.map((port, index) => {
			const { column, row } = positions[index];
			return limit > 0
				? { port, column: column % limit, row: row + 2 * Math.floor(column / limit) }
				: { port, column, row };
		});
	}
	return {
		cells,
		columns: cells.length === 0 ? 0 : Math.max(...cells.map((cell) => cell.column)) + 1,
		rows: cells.length === 0 ? 0 : Math.max(...cells.map((cell) => cell.row)) + 1,
		numbered,
		duplicates
	};
}

/**
 * The panel: sections per host and stack member, each with its groups laid out.
 * Returns { sections: [{ host, hostid, member, groups: [{ name, layout }] }], ...buildPorts result, ruleErrors }.
 */
export function buildPanel(payload) {
	const { config } = payload;
	const built = buildPorts(payload);
	const typeRules = parseTypeRules(config.port_type_rules);
	const groupRules = parsePortRules(config.port_grouping === 'definitions' ? config.port_groups : '');
	for (const port of built.ports) {
		port.type = interfaceTypeOf(port, config, typeRules.rules);
		port.group = groupOf(port, config, groupRules.rules);
	}

	const sections = new Map();
	for (const port of built.ports) {
		const key = `${port.hostid}\u0000${port.member ?? ''}`;
		if (!sections.has(key)) {
			sections.set(key, { host: port.host, hostid: port.hostid, member: port.member, ports: [] });
		}
		sections.get(key).ports.push(port);
	}
	const byGroup = groupOrder(config, groupRules.rules);
	const list = [...sections.values()].map((section) => {
		const names = [...new Set(section.ports.map((port) => port.group))].sort(byGroup);
		return {
			host: section.host,
			hostid: section.hostid,
			member: section.member,
			groups: names.map((name) => {
				const ports = section.ports.filter((port) => port.group === name);
				return { name, ports, layout: placePorts(ports, config.port_layout ?? 'two_row', config.port_columns) };
			})
		};
	});
	return { ...built, sections: list, typeErrors: typeRules.errors, groupErrors: groupRules.errors };
}

// ---------------------------------------------------------------- speeds

const PREFIXES = { '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
const SPEED_UNIT = /^([kKMGT]?)(bps|b\/s|bits?\/s)$/;

/**
 * Bits per second from speed text such as "1 Gbps", "1 Gbit/s", "10G" or
 * "100M". A bare number has no stated unit and gives null.
 */
export function parseSpeedText(text) {
	const match = /^\s*(\d+(?:\.\d+)?)\s*([kKMGT]?)\s*(bps|b\/s|bits?\/s)?\s*$/.exec(String(text ?? ''));
	if (match === null || (match[2] === '' && match[3] === undefined)) {
		return null;
	}
	return Number(match[1]) * PREFIXES[match[2]];
}

/**
 * A speed item's value in bits per second, or null when it cannot be told
 * safely: numbers need bit-rate units (as Zabbix interface templates set),
 * text needs a unit or prefix, and value-mapped text is read through the map.
 */
export function speedOf(entry) {
	if (entry === undefined || entry === null || entry.value === null || entry.value === undefined) {
		return null;
	}
	if (typeof entry.value === 'number') {
		const match = SPEED_UNIT.exec(displayUnits(entry.units));
		// A link that is down usually reports speed 0: there is no speed to show.
		return match === null || entry.value <= 0 ? null : entry.value * PREFIXES[match[1]];
	}
	const bits = parseSpeedText(mapValue(entry.valuemap, entry.value) ?? entry.value);
	return bits === null || bits <= 0 ? null : bits;
}

/** Short speed text for labels: "10M", "2.5G", "100G". */
export function shortSpeed(bits) {
	if (bits === null) {
		return '';
	}
	for (const [prefix, size] of [['T', 1e12], ['G', 1e9], ['M', 1e6], ['K', 1e3]]) {
		if (bits >= size) {
			return `${Math.round((bits / size) * 100) / 100}${prefix}`;
		}
	}
	return `${bits}`;
}

/**
 * Built-in speed colours, slowest to fastest. They avoid the greens, reds and
 * oranges the status border uses, so fill and border never blur together.
 * Users can change or add to them.
 */
export const SPEED_COLOURS = Object.freeze([
	['10M', '#F0E442'], ['100M', '#CC79A7'], ['1G', '#56B4E9'], ['2.5G', '#80CDC1'], ['5G', '#8DA0CB'], ['10G', '#0072B2'],
	['25G', '#5E3C99'], ['40G', '#B2ABD2'], ['50G', '#998EC3'], ['100G', '#2D004B'], ['200G', '#7A0177'], ['400G', '#AE017E']
]);
const OTHER_SPEED = '#7F7F7F';

/**
 * The speed palette: built-in buckets, then the user's "speed = #colour" lines,
 * which change a bucket or add one; "other" and "unknown" set those colours.
 * Returns { buckets: [{ label, bits, colour }], other, unknown, errors }.
 */
export function speedPalette(text) {
	const buckets = new Map(SPEED_COLOURS.map(([label, colour]) => [parseSpeedText(label), { label, bits: parseSpeedText(label), colour }]));
	let other = OTHER_SPEED;
	let unknown = null;
	const errors = [];
	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === '' || line.startsWith('#') && !line.includes('=')) {
			return;
		}
		const separator = line.lastIndexOf('=');
		const label = separator === -1 ? '' : line.slice(0, separator).trim();
		const colour = separator === -1 ? '' : line.slice(separator + 1).trim();
		if (!isHexColour(colour)) {
			errors.push({ line: index + 1, text: line });
			return;
		}
		if (label.toLowerCase() === 'other') {
			other = colour;
			return;
		}
		if (label.toLowerCase() === 'unknown') {
			unknown = colour;
			return;
		}
		const bits = parseSpeedText(label);
		if (bits === null) {
			errors.push({ line: index + 1, text: line });
			return;
		}
		buckets.set(bits, { label: buckets.get(bits)?.label ?? label, bits, colour });
	});
	return { buckets: [...buckets.values()].sort((a, b) => a.bits - b.bits), other, unknown, errors };
}

/** The bucket of a speed: { label, colour } with colour null for an unknown speed (drawn neutral). */
export function speedBucket(bits, palette) {
	if (bits === null) {
		return { label: 'Unknown speed', colour: palette.unknown, unknown: true };
	}
	const bucket = palette.buckets.find((entry) => Math.abs(entry.bits - bits) <= entry.bits * 1e-6);
	return bucket === undefined
		? { label: `Other speed (${shortSpeed(bits)})`, colour: palette.other, unknown: false }
		: { label: bucket.label, colour: bucket.colour, unknown: false };
}

// ---------------------------------------------------------------- states

/**
 * Status colours used when the status is value-mapped to these words and the
 * user has not set a colour for it. Raw numbers have no built-in meaning.
 */
const STATUS_COLOURS = Object.freeze({
	up: '#009E73', down: '#D55E00', lowerlayerdown: '#D55E00', testing: '#E69F00', dormant: '#56B4E9', notpresent: '#999999'
});

/** A status item's state, with unmapped marking a value its value map does not cover. */
export function portStatus(entry) {
	if (entry === undefined || entry.value === null || entry.value === undefined) {
		return null;
	}
	const state = stateOf(entry, entry.value, true);
	return { ...state, unmapped: Array.isArray(entry.valuemap) && entry.valuemap.length > 0 && state.mapped === null };
}

/** Colour of a status: the user's status colours, then the built-in words, else null (neutral). */
export function statusColour(status, colours) {
	if (status === null) {
		return null;
	}
	return mappedColour(colours, status) ?? STATUS_COLOURS[String(status.mapped ?? '').toLowerCase().replace(/[\s_-]/g, '')] ?? null;
}

/** True when the administrative status is one of the configured "down" values (mapped text or raw value). */
export function isAdminDown(status, downValues) {
	if (status === null) {
		return false;
	}
	const values = String(downValues ?? '').split(',').map((value) => value.trim().toLowerCase()).filter((value) => value !== '');
	return values.includes(String(status.mapped ?? '').toLowerCase()) || values.includes(status.raw.toLowerCase());
}

// ---------------------------------------------------------------- staleness

/**
 * "Stale after" setting: "" (off), a duration such as "10m", or "3x" for a
 * multiple of the item's update interval. Returns { mode, value, error }.
 */
export function parseStale(text) {
	const trimmed = String(text ?? '').trim();
	if (trimmed === '') {
		return { mode: 'off', value: null, error: null };
	}
	const multiple = /^(\d+(?:\.\d+)?)\s*x$/i.exec(trimmed);
	if (multiple !== null && Number(multiple[1]) > 0) {
		return { mode: 'multiple', value: Number(multiple[1]), error: null };
	}
	const seconds = parseBucket(trimmed);
	return seconds === null
		? { mode: 'off', value: null, error: 'Stale after must be a duration such as 10m, or a multiple of the update interval such as 3x.' }
		: { mode: 'seconds', value: seconds, error: null };
}

/** Whether a port's newest value is older than the stale limit; false when it cannot be judged. */
export function isStale(port, stale, now) {
	if (stale.mode === 'off') {
		return false;
	}
	const clocks = port.items.map((entry) => entry.clock).filter((clock) => typeof clock === 'number');
	if (clocks.length === 0) {
		return false;
	}
	const newest = Math.max(...clocks);
	if (stale.mode === 'seconds') {
		return now - newest > stale.value;
	}
	const delays = port.items.map((entry) => entry.delay).filter((delay) => typeof delay === 'number');
	return delays.length > 0 && now - newest > stale.value * Math.max(...delays);
}

// ---------------------------------------------------------------- values and visuals

const METRIC_ROLES = { utilisation: 'util', util_in: 'util_in', util_out: 'util_out', poe_power: 'poe_power', errors_in: 'errors_in',
	errors_out: 'errors_out', discards: 'discards', traffic_in: 'traffic_in', traffic_out: 'traffic_out' };

function numberOf(entry) {
	return entry !== undefined && typeof entry.value === 'number' ? entry.value : null;
}

/** The numeric value the threshold colour reads: { value, units } with value null when missing. */
export function metricOf(port, metric) {
	if (metric === 'util_max') {
		const values = [numberOf(port.values.util_in), numberOf(port.values.util_out)].filter((value) => value !== null);
		return { value: values.length === 0 ? null : Math.max(...values), units: port.values.util_in?.units ?? port.values.util_out?.units ?? '%' };
	}
	const entry = port.values[METRIC_ROLES[metric] ?? 'util'];
	return { value: numberOf(entry), units: entry?.units ?? '' };
}

/** The utilisation bar's percentage (0-100), or null when its data is missing. */
export function utilisationOf(port, source) {
	const inbound = numberOf(port.values.util_in);
	const outbound = numberOf(port.values.util_out);
	let value;
	switch (source) {
		case 'in':
			value = inbound;
			break;
		case 'out':
			value = outbound;
			break;
		case 'max':
			value = inbound === null && outbound === null ? null : Math.max(inbound ?? -Infinity, outbound ?? -Infinity);
			break;
		case 'avg':
			value = inbound === null || outbound === null ? null : (inbound + outbound) / 2;
			break;
		case 'utilisation':
			value = numberOf(port.values.util);
			break;
		default:
			return null;
	}
	return value === null ? null : Math.min(100, Math.max(0, value));
}

const ABBREVIATIONS = [
	['HundredGigabitEthernet', 'Hu'], ['HundredGigE', 'Hu'], ['FortyGigabitEthernet', 'Fo'], ['TwentyFiveGigE', 'Twe'],
	['TwentyFiveGigabitEthernet', 'Twe'], ['TenGigabitEthernet', 'Te'], ['FiveGigabitEthernet', 'Fi'], ['TwoGigabitEthernet', 'Tw'],
	['GigabitEthernet', 'Gi'], ['FastEthernet', 'Fa'], ['Port-channel', 'Po'], ['Ethernet', 'Eth']
];

/** Shorter display form of a long interface name; the identity itself is never changed. */
export function abbreviate(name) {
	for (const [long, short] of ABBREVIATIONS) {
		if (name.startsWith(long) && /^[\s\d]/.test(name.slice(long.length))) {
			return short + name.slice(long.length).trimStart();
		}
	}
	return name;
}

function valueText(entry, decimals) {
	if (entry === undefined || entry.value === null || entry.value === undefined) {
		return null;
	}
	if (typeof entry.value === 'number') {
		const mapped = mapValue(entry.valuemap, entry.value);
		const formatted = formatValue(entry.value, entry.units, decimals);
		return mapped === null ? formatted : `${mapped} (${formatted})`;
	}
	const mapped = mapValue(entry.valuemap, entry.value);
	return mapped === null ? String(entry.value) : `${mapped} (${entry.value})`;
}

function plainText(entry) {
	if (entry === undefined || entry.value === null || entry.value === undefined) {
		return null;
	}
	return mapValue(entry.valuemap, entry.value) ?? String(entry.value);
}

function primaryLabel(port, config) {
	const fallback = config.port_abbreviate === false ? port.identity : abbreviate(port.identity);
	switch (config.port_label) {
		case 'alias':
			return plainText(port.values.alias) || fallback;
		case 'description':
			return plainText(port.values.description) || fallback;
		case 'number':
			return port.number === null ? fallback : String(port.number);
		case 'regex': {
			let regex;
			try {
				regex = new RegExp(String(config.port_label_regex ?? ''));
			}
			catch {
				return fallback;
			}
			const match = regex.exec(port.identity);
			return match === null ? fallback : (match[1] ?? match[0]) || fallback;
		}
		case 'item_name':
			return (port.values.oper ?? port.items[0]).name;
		case 'none':
			return '';
		default:
			return fallback;
	}
}

/**
 * Everything the renderer draws for one port, from the user's channel choices.
 * Returns { label, sublabel, fill, fillLabel, unknownFill, border, borderLabel,
 * borderStyle, adminDown, stale, severity, utilisation, oper, admin, speed, missing, tooltip, aria }.
 */
export function portVisual(port, config, { palette, statusColours, severities, host, now, decimals = 2 }) {
	const oper = portStatus(port.values.oper);
	const admin = portStatus(port.values.admin);
	const speed = speedOf(port.values.speed);
	const configuredSpeed = speedOf(port.values.cfg_speed);
	const adminDown = isAdminDown(admin, config.admin_down);
	const severityColour = port.severity === null ? null : (severities[port.severity]?.color ?? null);

	let fill = null;
	let fillLabel = 'No data';
	let unknownFill = true;
	switch (config.port_fill ?? 'neg_speed') {
		case 'neg_speed':
		case 'cfg_speed': {
			const bits = config.port_fill === 'cfg_speed' ? configuredSpeed : speed;
			const bucket = speedBucket(bits, palette);
			fill = bucket.colour;
			fillLabel = bucket.label;
			unknownFill = bucket.unknown;
			break;
		}
		case 'oper':
		case 'admin': {
			const status = config.port_fill === 'admin' ? admin : oper;
			fill = statusColour(status, statusColours);
			fillLabel = status === null ? 'No status' : (status.mapped ?? status.raw);
			unknownFill = status === null;
			break;
		}
		case 'thresholds': {
			const metric = metricOf(port, config.port_metric);
			const scale = resolveScale({ thresholds: config.thresholds }, host);
			if (metric.value !== null && scale.thresholds.length > 0) {
				const band = bandIndex(metric.value, scale.thresholds);
				fill = bandColours(scale.thresholds.length + 1, config.threshold_order)[band];
				const low = band === 0 ? null : scale.thresholds[band - 1];
				const high = band === scale.thresholds.length ? null : scale.thresholds[band];
				fillLabel = low === null ? `Below ${formatValue(high, metric.units, decimals)}`
					: high === null ? `${formatValue(low, metric.units, decimals)} and above`
						: `${formatValue(low, metric.units, decimals)} to ${formatValue(high, metric.units, decimals)}`;
				unknownFill = false;
			}
			break;
		}
		case 'severity':
			fill = severityColour;
			fillLabel = port.severity === null ? 'No problems' : (severities[port.severity]?.name ?? `Severity ${port.severity}`);
			unknownFill = false;
			break;
		case 'fixed':
			fill = isHexColour(config.port_fixed_colour) ? config.port_fixed_colour.trim() : null;
			fillLabel = '';
			unknownFill = false;
			break;
		default:
			break;
	}

	let border = null;
	let borderLabel = '';
	let borderStyle = 'solid';
	switch (config.port_border ?? 'oper') {
		case 'oper':
			border = statusColour(oper, statusColours);
			borderLabel = oper === null ? 'No operational status' : (oper.mapped ?? oper.raw);
			borderStyle = oper === null ? 'dashed' : 'solid';
			break;
		case 'admin':
			border = statusColour(admin, statusColours);
			borderLabel = admin === null ? 'No administrative status' : (admin.mapped ?? admin.raw);
			borderStyle = admin === null ? 'dashed' : 'solid';
			break;
		case 'severity':
			border = severityColour;
			borderLabel = port.severity === null ? '' : (severities[port.severity]?.name ?? '');
			break;
		default:
			break;
	}
	if (adminDown) {
		borderStyle = 'dotted';
	}

	const stale = isStale(port, parseStale(config.stale_after), now);
	const markerSource = config.port_marker ?? 'admin_problem';
	const sublabel = (() => {
		switch (config.port_sublabel ?? 'speed') {
			case 'speed':
				return shortSpeed(speed);
			case 'alias':
				return plainText(port.values.alias) ?? '';
			case 'description':
				return plainText(port.values.description) ?? '';
			case 'status':
				return oper === null ? '' : (oper.mapped ?? oper.raw);
			case 'utilisation': {
				const value = utilisationOf(port, 'max') ?? utilisationOf(port, 'utilisation');
				return value === null ? '' : `${Math.round(value)}%`;
			}
			default:
				return '';
		}
	})();

	const missing = [];
	if (port.values.oper === undefined || oper === null) {
		missing.push('No operational status');
	}
	else if (oper.unmapped) {
		missing.push(`Operational status ${oper.raw} is not in the value map`);
	}
	if (admin?.unmapped) {
		missing.push(`Administrative status ${admin.raw} is not in the value map`);
	}
	if (port.values.speed !== undefined && speed === null) {
		missing.push('Speed unknown');
	}
	if (stale) {
		missing.push('Data is stale');
	}

	const label = primaryLabel(port, config);
	const tooltip = portTooltip(port, { oper, admin, speed, configuredSpeed, decimals, severities });
	const aria = [
		port.identity,
		`operational status ${oper === null ? 'unknown' : (oper.mapped ?? oper.raw)}`,
		`speed ${speed === null ? 'unknown' : formatValue(speed, 'bps', decimals)}`,
		...(adminDown ? ['administratively down'] : []),
		...(port.severity === null ? [] : [`problem: ${severities[port.severity]?.name ?? port.severity}`]),
		...(stale ? ['stale data'] : [])
	].join(', ');

	return {
		label,
		sublabel,
		fill,
		fillLabel,
		unknownFill,
		border,
		borderLabel,
		borderStyle,
		adminDown,
		stale,
		markAdmin: adminDown && (markerSource === 'admin' || markerSource === 'admin_problem'),
		markProblem: port.severity !== null && (markerSource === 'problem' || markerSource === 'admin_problem') ? severityColour : null,
		utilisation: utilisationOf(port, config.port_util_bar ?? 'none'),
		oper,
		admin,
		speed,
		missing,
		tooltip,
		aria
	};
}

/**
 * Tooltip rows in a fixed order: [{ label, value }], only for data that
 * exists. Values are plain text; the renderer inserts them as text.
 */
export function portTooltip(port, { oper, admin, speed, configuredSpeed, decimals = 2, severities = [] }) {
	const rows = [{ label: 'Interface', value: port.identity }];
	const add = (label, value) => {
		if (value !== null && value !== undefined && value !== '') {
			rows.push({ label, value: String(value) });
		}
	};
	add('Host', port.host);
	add('Member', port.member);
	add('Alias', plainText(port.values.alias));
	add('Description', plainText(port.values.description));
	add('Interface type', port.type?.label);
	add('Operational status', oper === null ? (port.values.oper === undefined ? null : 'no data') : oper.text);
	add('Administrative status', admin === null ? (port.values.admin === undefined ? null : 'no data') : admin.text);
	add('Negotiated speed', speed === null ? (port.values.speed === undefined ? null : `unknown (${plainText(port.values.speed) ?? 'no data'})`) : formatValue(speed, 'bps', decimals));
	add('Configured speed', configuredSpeed === null ? (port.values.cfg_speed === undefined ? null : 'unknown') : formatValue(configuredSpeed, 'bps', decimals));
	for (const role of ['duplex', 'traffic_in', 'traffic_out', 'util', 'util_in', 'util_out', 'errors_in', 'errors_out', 'discards', 'poe_state', 'poe_power']) {
		add(ROLE_LABELS[role], port.values[role] === undefined ? null : (valueText(port.values[role], decimals) ?? 'no data'));
	}
	const vlan = valueText(port.values.vlan, decimals);
	const pvid = valueText(port.values.pvid, decimals);
	add('VLAN / PVID', vlan === null && pvid === null ? null : [vlan ?? '–', pvid ?? '–'].join(' / '));
	add('MTU', valueText(port.values.mtu, decimals));
	add('Last change', valueText(port.values.last_change, decimals));
	if (port.severity !== null) {
		add('Problem severity', severities[port.severity]?.name ?? String(port.severity));
	}
	return rows;
}

/** Status colours from the user's "status = #colour" lines. */
export function statusColourMap(text) {
	return parseColourMap(text);
}

/**
 * A Zabbix page for a port, or null. Only ids (digits) and the identity, as
 * an encoded filter value, go into the address.
 */
export function portLink(port, action) {
	const id = (value) => (/^\d+$/.test(String(value)) ? String(value) : null);
	const hostid = id(port.hostid);
	if (action === 'latest' && hostid !== null) {
		return `zabbix.php?${new URLSearchParams([['action', 'latest.view'], ['hostids[]', hostid], ['name', port.identity], ['filter_set', '1']])}`;
	}
	if (action === 'history') {
		const entry = port.values.oper ?? port.items[0];
		const itemid = id(entry?.itemid);
		return itemid === null ? null
			: `history.php?${new URLSearchParams([['action', entry.numeric ? 'showgraph' : 'showvalues'], ['itemids[]', itemid]])}`;
	}
	if (action === 'problems' && hostid !== null) {
		const params = [['action', 'problem.view'], ['filter_set', '1'], ['hostids[]', hostid]];
		for (const problem of port.problems) {
			if (id(problem.triggerid) !== null) {
				params.push(['triggerids[]', problem.triggerid]);
			}
		}
		return `zabbix.php?${new URLSearchParams(params)}`;
	}
	return null;
}
