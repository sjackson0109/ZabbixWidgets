/** Builders for payloads shaped like the PHP action's response. */
import { normalisePayload } from '../../src/data/normalise.js';

let nextItemId = 1000;

export function item({
	role = 'value', hostid = '1', host = 'Host A', name = 'CPU utilization', key, units = '%',
	value_type = 0, value = '10', clock = 1700000000, tags = [], history
} = {}) {
	const itemid = String(nextItemId++);
	return { itemid, role, hostid, host, name, key: key ?? `key.${itemid}`, units, value_type, value, clock, tags, history };
}

export function payload(chart, { config = {}, series = [], hosts = [], time_period = null, errors = [] } = {}) {
	return normalisePayload({ chart, config, series, hosts, time_period, errors });
}

export function host({ hostid = '1', name = 'Host A', groups = [], tags = [], macros = {} } = {}) {
	return { hostid, name, groups, tags, macros };
}
