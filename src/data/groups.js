/**
 * Entities for charts that show one value per host or per item (pie,
 * ranking). Grouping by item keeps every item; grouping by host adds up the
 * host's items, which is only allowed for additive units (see isAdditive).
 */
import { displayUnits } from './units.js';
import { seriesLabels } from '../renderers/common.js';

/**
 * Units whose values cannot be added up: shares, timestamps, temperatures,
 * levels and rates of rotation. A total of these would be a made-up number.
 */
const NON_ADDITIVE_UNITS = new Set(['%', 'unixtime', 'uptime', '°C', '°F', 'C', 'F', 'K', 'dB', 'dBm', 'rpm', 'RPM']);

export function isAdditive(units) {
	return !NON_ADDITIVE_UNITS.has(displayUnits(units));
}

/**
 * Returns [{ id, label, value, units, items: [series] }] in source order.
 * Items without a value are left out of host totals (and listed in a
 * validation warning); a host whose items all lack values has no entity.
 */
export function chartEntities(series, groupBy) {
	if (groupBy !== 'host') {
		const labels = seriesLabels(series);
		return series
			.map((entry, index) => ({ id: `item:${entry.itemid}`, label: labels[index], value: entry.value, units: entry.units, items: [entry] }))
			.filter((entity) => typeof entity.value === 'number');
	}

	const hosts = new Map();
	for (const entry of series) {
		if (typeof entry.value !== 'number') {
			continue;
		}
		if (!hosts.has(entry.hostid)) {
			hosts.set(entry.hostid, { id: `host:${entry.hostid}`, label: entry.host, value: 0, units: entry.units, items: [] });
		}
		const host = hosts.get(entry.hostid);
		host.value += entry.value;
		host.items.push(entry);
	}
	const list = [...hosts.values()];
	const counts = new Map();
	for (const entity of list) {
		counts.set(entity.label, (counts.get(entity.label) ?? 0) + 1);
	}
	return list.map((entity) => (counts.get(entity.label) > 1
		? { ...entity, label: `${entity.label} (${entity.items[0].hostid})` }
		: entity));
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Orders entities by value. Equal values keep a stable order: by label, then
 * by id, so the same data always ranks the same way.
 */
export function sortEntities(entities, order) {
	if (order !== 'asc' && order !== 'desc') {
		return [...entities];
	}
	const sign = order === 'asc' ? 1 : -1;
	return [...entities].sort((a, b) => sign * (a.value - b.value) || collator.compare(a.label, b.label) || collator.compare(a.id, b.id));
}
