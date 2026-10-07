/**
 * Pairs series from different roles into tuples, e.g. the X, Y and size items
 * of one bubble or the start and end items of one Gantt task.
 *
 * Pairing is explicit: by host, or by the value of a named item tag. Series
 * that cannot be paired are reported, never matched up by position.
 */
import { tagValue } from './normalise.js';

function pairKey(series, pairBy, pairTag) {
	if (pairBy === 'tag') {
		const value = tagValue(series.tags, pairTag);
		return value === null ? null : { key: `tag:${value}`, label: value };
	}
	return { key: `host:${series.hostid}`, label: series.host };
}

export function pairSeries(series, roles, { pairBy = 'host', pairTag = '' } = {}) {
	const groups = new Map();
	const untagged = [];

	for (const entry of series) {
		if (!roles.includes(entry.role)) {
			continue;
		}
		const key = pairKey(entry, pairBy, pairTag);
		if (key === null) {
			untagged.push(entry);
			continue;
		}
		if (!groups.has(key.key)) {
			groups.set(key.key, { key: key.key, label: key.label, members: {} });
		}
		const group = groups.get(key.key);
		(group.members[entry.role] ??= []).push(entry);
	}

	const tuples = [];
	const incomplete = [];
	const ambiguous = [];

	for (const group of groups.values()) {
		const missing = roles.filter((role) => !group.members[role]);
		const duplicated = roles.filter((role) => (group.members[role]?.length ?? 0) > 1);

		if (missing.length > 0) {
			incomplete.push({ key: group.key, label: group.label, missing });
		}
		else if (duplicated.length > 0) {
			ambiguous.push({ key: group.key, label: group.label, roles: duplicated });
		}
		else {
			tuples.push({
				key: group.key,
				label: group.label,
				members: Object.fromEntries(roles.map((role) => [role, group.members[role][0]]))
			});
		}
	}

	return { tuples, incomplete, ambiguous, untagged };
}
