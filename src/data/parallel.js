/**
 * Parallel coordinates (C30): each axis is one metric the user names, and
 * each line is one entity (a host, or the value of a pairing tag) through
 * its value on every axis.
 *
 * Axes come from the "Axes" setting, one per line:
 *   Label = item name pattern
 *   Label = item name pattern | minimum, maximum
 * The optional range fixes that axis; otherwise it spans the values shown.
 * Every entity needs exactly one item on every axis: a missing or
 * ambiguous match is reported, and that entity is left out rather than
 * drawn with a made-up or a zero value.
 */
import { parseDefinitions } from './patterns.js';
import { tagValue, toNumber } from './normalise.js';
import { displayUnits } from './units.js';

/** Returns { axes: [{ heading, regex, min, max }], errors: [{ line, text, reason }] }. */
export function parseAxes(text) {
	const lines = String(text ?? '').split(/\r?\n/);
	const errors = [];
	const ranges = new Map();
	const stripped = lines.map((raw, index) => {
		const bar = raw.lastIndexOf('|');
		if (bar === -1 || raw.trim().startsWith('#')) {
			return raw;
		}
		const parts = raw.slice(bar + 1).split(',').map((part) => part.trim());
		const [min, max] = parts.map((part) => (part === '' ? null : toNumber(part)));
		if (parts.length !== 2 || (parts[0] !== '' && min === null) || (parts[1] !== '' && max === null)) {
			errors.push({ line: index + 1, text: raw.trim(), reason: 'the range after "|" must be "minimum, maximum"' });
		}
		else if (min !== null && max !== null && min >= max) {
			errors.push({ line: index + 1, text: raw.trim(), reason: 'the minimum must be lower than the maximum' });
		}
		else {
			ranges.set(index + 1, { min, max });
		}
		return raw.slice(0, bar);
	});
	const { entries, errors: lineErrors } = parseDefinitions(stripped.join('\n'));
	errors.push(...lineErrors.map((entry) => ({ ...entry, reason: 'it is not in the form "Label = item name pattern"' })));

	// parseDefinitions skips blank and comment lines; match its entries back to their line numbers.
	const numbered = [];
	stripped.forEach((raw, index) => {
		const line = raw.trim();
		if (line !== '' && !line.startsWith('#') && !lineErrors.some((entry) => entry.line === index + 1)) {
			numbered.push(index + 1);
		}
	});
	const axes = entries.map((entry, index) => ({ ...entry, ...(ranges.get(numbered[index]) ?? { min: null, max: null }) }));
	return { axes, errors: errors.sort((a, b) => a.line - b.line) };
}

function entityKey(entry, pairBy, pairTag) {
	if (pairBy === 'tag') {
		const value = tagValue(entry.tags, pairTag);
		return value === null ? null : { key: `tag:${value}`, label: value };
	}
	return { key: `host:${entry.hostid}`, label: entry.host };
}

/**
 * Lines for the chart and the problems found while building them.
 * Returns { axes, entities: [{ key, label, members: [series per axis] }],
 * incomplete, ambiguous, untagged, unused, mixedUnits }.
 */
export function parallelModel(series, config) {
	const { axes } = parseAxes(config.parallel_axes);
	const pairBy = config.pair_by === 'tag' ? 'tag' : 'host';
	const pairTag = String(config.pair_tag ?? '').trim();
	const groups = new Map();
	const untagged = [];
	const used = new Set();

	for (const entry of series) {
		const axisIndexes = axes.map((axis, index) => (axis.regex.test(entry.name) ? index : -1)).filter((index) => index !== -1);
		if (axisIndexes.length === 0) {
			continue;
		}
		used.add(entry.itemid);
		const key = entityKey(entry, pairBy, pairTag);
		if (key === null) {
			untagged.push(entry);
			continue;
		}
		const group = groups.get(key.key) ?? groups.set(key.key, { key: key.key, label: key.label, byAxis: axes.map(() => []) }).get(key.key);
		for (const index of axisIndexes) {
			group.byAxis[index].push(entry);
		}
	}

	const entities = [];
	const incomplete = [];
	const ambiguous = [];
	for (const group of groups.values()) {
		const missing = axes.filter((_, index) => group.byAxis[index].length === 0 || typeof group.byAxis[index][0].value !== 'number');
		const doubled = axes.filter((_, index) => group.byAxis[index].length > 1);
		if (doubled.length > 0) {
			ambiguous.push({ label: group.label, axes: doubled.map((axis) => axis.heading) });
		}
		else if (missing.length > 0) {
			incomplete.push({ label: group.label, axes: missing.map((axis) => axis.heading) });
		}
		else {
			entities.push({ key: group.key, label: group.label, members: group.byAxis.map((members) => members[0]) });
		}
	}

	const mixedUnits = axes.filter((_, index) => {
		const units = new Set([...groups.values()].flatMap((group) => group.byAxis[index].map((entry) => displayUnits(entry.units))));
		return units.size > 1;
	}).map((axis) => axis.heading);

	return { axes, entities, incomplete, ambiguous, untagged, unused: series.filter((entry) => !used.has(entry.itemid)), mixedUnits };
}
