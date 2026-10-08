/**
 * Access points and their radios for the Wireless Floor Map (C34).
 *
 * - An access point is a Zabbix host. Its place on the floor plan is given by
 *   the user in percent of the image (0 to 100 across, 0 to 100 down), from
 *   the host's own macros or from the widget's positions list. A host without
 *   a valid position is not drawn: no position is ever guessed.
 * - A radio is the set of band, channel, width and SNR items on one host that
 *   share an identity (a key parameter, an item tag or a part of the item name).
 * - The band comes only from the band item's value or value mapping. It is
 *   never worked out from the channel number, because 6 GHz channel numbers
 *   repeat those of 2.4 and 5 GHz.
 */
import { identityOf, compileRowExpression } from './identity.js';
import { parseNodePositions } from './positions.js';
import { mapValue } from './valuemap.js';
import { toNumber } from './normalise.js';

/** Bands in drawing order, outermost ring first. */
export const BANDS = Object.freeze(['2.4', '5', '6']);

export const BAND_LABELS = Object.freeze({ '2.4': '2.4 GHz', 5: '5 GHz', 6: '6 GHz' });

const WIDTHS = [20, 40, 80, 160, 320];

/** The text an item shows: its value mapping when it has one, else its value. */
export function displayText(series) {
	if (series.value === null) {
		return null;
	}
	return mapValue(series.valuemap, series.value) ?? String(series.value);
}

/**
 * The band of a band item's value: '2.4', '5', '6' or null. Accepts GHz
 * ("2.4", "5 GHz", "6E"), MHz ("2412", "5180", "5955") and mapped text
 * containing either.
 */
export function parseBand(series) {
	const text = displayText(series);
	if (text === null) {
		return null;
	}
	const fromNumber = (number) => {
		if (number >= 2.3 && number <= 2.5) {
			return '2.4';
		}
		if (number >= 4.9 && number < 5.925) {
			return '5';
		}
		if (number >= 5.925 && number <= 7.125) {
			return '6';
		}
		if (number >= 2300 && number <= 2500) {
			return '2.4';
		}
		if (number >= 4900 && number < 5925) {
			return '5';
		}
		if (number >= 5925 && number <= 7125) {
			return '6';
		}
		return null;
	};
	const plain = toNumber(text.trim());
	if (plain !== null) {
		const band = fromNumber(plain);
		if (band !== null || series.valuemap === null) {
			return band;
		}
	}
	const lower = text.toLowerCase();
	if (/\b6\s*e\b|(^|[^\d.])6(\.\d+)?\s*ghz/.test(lower)) {
		return '6';
	}
	if (/2\.4/.test(lower)) {
		return '2.4';
	}
	if (/(^|[^\d.])5(\.\d+)?\s*ghz/.test(lower)) {
		return '5';
	}
	const mhz = lower.match(/(\d{4})\s*mhz/);
	return mhz ? fromNumber(Number(mhz[1])) : null;
}

/** Channel width in MHz from a value or mapped text such as "VHT80", or null. */
export function parseWidth(series) {
	const text = displayText(series);
	if (text === null) {
		return null;
	}
	const numbers = (text.match(/\d+/g) ?? []).map(Number);
	return numbers.find((number) => WIDTHS.includes(number)) ?? null;
}

/** How items are grouped into radios: { source, tag, regex, error }. */
export function radioIdentity(config) {
	const source = config.radio_by ?? 'key';
	if (source === 'regex') {
		const { regex, error } = compileRowExpression(config.radio_regex);
		return { source, tag: '', regex, error };
	}
	return { source, tag: String(config.radio_tag ?? '').trim(), regex: null, error: null };
}

/**
 * Positions of hosts in percent of the floor plan.
 * Returns { placed: Map(hostid -> [x, y]), missing: [name], invalid: [name], listErrors, unknown: [name] }.
 */
export function apPositions(payload) {
	const { config, hosts } = payload;
	const placed = new Map();
	const missing = [];
	const invalid = [];
	let listErrors = [];
	let unknown = [];
	const accept = (host, x, y) => {
		if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
			placed.set(host.hostid, [x, y]);
		}
		else {
			invalid.push(host.name);
		}
	};

	if (config.position_source === 'list') {
		const { positions, errors } = parseNodePositions(config.node_positions);
		listErrors = errors;
		const names = new Set(hosts.map((host) => host.name));
		unknown = [...positions.keys()].filter((name) => !names.has(name));
		for (const host of hosts) {
			const position = positions.get(host.name);
			if (position === undefined) {
				missing.push(host.name);
			}
			else {
				accept(host, position[0], position[1]);
			}
		}
	}
	else {
		for (const host of hosts) {
			const xText = String(host.position?.x ?? '').trim();
			const yText = String(host.position?.y ?? '').trim();
			if (xText === '' && yText === '') {
				missing.push(host.name);
			}
			else {
				accept(host, toNumber(xText) ?? NaN, toNumber(yText) ?? NaN);
			}
		}
	}
	return { placed, missing, invalid, listErrors, unknown };
}

/** Whether a band is switched on in the settings. */
export function bandShown(config, band) {
	const field = { '2.4': 'show_band_24', 5: 'show_band_5', 6: 'show_band_6' }[band];
	return config[field] !== false;
}

/**
 * Builds the access points: placed hosts with their radios and rogue count.
 *
 * Returns { aps, problems } where problems lists what was left out:
 *   unidentified: items without a radio identity
 *   ambiguous: radios with more than one item for one role
 *   noBand: radios whose band item has no value or an unrecognised one
 *   noChannel / noSnr: radios drawn without that reading
 */
export function wirelessModel(payload) {
	const { config, series, hosts } = payload;
	const identity = radioIdentity(config);
	const { placed } = apPositions(payload);
	const problems = { unidentified: [], ambiguous: [], noBand: [], noChannel: [], noSnr: [], hidden: 0 };
	const snrConfigured = series.some((entry) => entry.role === 'snr');
	const aps = [];

	for (const host of hosts) {
		if (!placed.has(host.hostid)) {
			continue;
		}
		const own = series.filter((entry) => entry.hostid === host.hostid);
		const groups = new Map();
		for (const entry of own.filter((item) => ['band', 'channel', 'width', 'snr'].includes(item.role))) {
			const id = identity.error === null ? identityOf(entry, identity.source, { tag: identity.tag, regex: identity.regex }) : null;
			if (id === null) {
				problems.unidentified.push(`${host.name}: ${entry.name}`);
				continue;
			}
			if (!groups.has(id)) {
				groups.set(id, {});
			}
			(groups.get(id)[entry.role] ??= []).push(entry);
		}

		const radios = [];
		for (const [id, members] of groups) {
			const label = `${host.name} radio ${id}`;
			if (Object.values(members).some((list) => list.length > 1)) {
				problems.ambiguous.push(label);
				continue;
			}
			const band = members.band ? parseBand(members.band[0]) : null;
			if (band === null) {
				problems.noBand.push(label);
				continue;
			}
			if (!bandShown(config, band)) {
				problems.hidden++;
				continue;
			}
			const channelEntry = members.channel?.[0] ?? null;
			const channel = channelEntry === null ? null : displayText(channelEntry);
			if (channel === null) {
				problems.noChannel.push(label);
			}
			const snrEntry = members.snr?.[0] ?? null;
			const snr = snrEntry !== null && typeof snrEntry.value === 'number' ? snrEntry.value : null;
			if (snr === null && snrConfigured) {
				problems.noSnr.push(label);
			}
			const widthEntry = members.width?.[0] ?? null;
			radios.push({
				id,
				band,
				channel,
				width: widthEntry === null ? null : parseWidth(widthEntry),
				widthText: widthEntry === null ? null : displayText(widthEntry),
				snr,
				snrUnits: snrEntry?.units || 'dB',
				clock: Math.min(...Object.values(members).map(([entry]) => entry.clock ?? Infinity))
			});
		}
		radios.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

		const rogueItems = own.filter((entry) => entry.role === 'rogue');
		let rogues = null;
		if (rogueItems.length > 0) {
			rogues = config.rogue_count === 'items'
				? { count: rogueItems.length, names: rogueItems.map((entry) => entry.name) }
				: { count: rogueItems.reduce((sum, entry) => sum + (typeof entry.value === 'number' ? entry.value : 0), 0), names: [] };
			if (config.rogue_count !== 'items' && rogueItems.every((entry) => typeof entry.value !== 'number')) {
				rogues = null;
			}
		}

		aps.push({ hostid: host.hostid, name: host.name, host, position: placed.get(host.hostid), radios, rogues });
	}

	return { aps, problems, identity };
}

/** Radios on the same band and channel as another placed radio: band|channel -> count. */
export function sharedChannels(aps) {
	const counts = new Map();
	for (const ap of aps) {
		for (const radio of ap.radios) {
			if (radio.channel !== null) {
				const key = `${radio.band}|${radio.channel}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
	}
	return counts;
}
