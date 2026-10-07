/**
 * Funnel stages come only from the user's stage list ("Stage = item name
 * pattern", one per line). Each stage must match exactly one item, so a
 * stage's value is never a guess between several candidates.
 */
import { parseDefinitions } from './patterns.js';

/**
 * Returns { stages: [{ label, entry }], missing, ambiguous: [{ label, items }], unused, errors }.
 */
export function funnelStages(series, text) {
	const { entries, errors } = parseDefinitions(text);
	const stages = [];
	const missing = [];
	const ambiguous = [];
	const used = new Set();

	for (const definition of entries) {
		const matches = series.filter((entry) => definition.regex.test(entry.name));
		matches.forEach((entry) => used.add(entry.itemid));
		if (matches.length === 0) {
			missing.push(definition.heading);
		}
		else if (matches.length > 1) {
			ambiguous.push({ label: definition.heading, items: matches });
		}
		else {
			stages.push({ label: definition.heading, entry: matches[0] });
		}
	}

	return { stages, missing, ambiguous, unused: series.filter((entry) => !used.has(entry.itemid)), errors, defined: entries.length };
}

/** Stages in the configured order: as listed, or by value. */
export function orderStages(stages, order) {
	if (order !== 'asc' && order !== 'desc') {
		return [...stages];
	}
	const sign = order === 'asc' ? 1 : -1;
	return stages.map((stage, index) => ({ stage, index }))
		.sort((a, b) => sign * (a.stage.entry.value - b.stage.entry.value) || a.index - b.index)
		.map(({ stage }) => stage);
}

/** Share of a value in a reference value, or null when the reference is zero or missing. */
export function share(value, reference) {
	return typeof reference === 'number' && reference > 0 && typeof value === 'number' ? (value / reference) * 100 : null;
}
