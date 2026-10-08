/**
 * Waterfall steps (C33), written by the user one per line:
 *
 *   = Opening = Balance at start      a measured level: bar from zero, the running total becomes it
 *   + Income = Revenue *              a contribution added to the running total
 *   - Costs = Costs *                 a contribution subtracted from the running total
 *   = Net                             a total: bar from zero to the running total so far
 *
 * A line without a sign is a contribution added (+). Each pattern must
 * match exactly one of the chart's items. A measured level after earlier
 * steps is compared with the running total, and a difference is reported:
 * the steps then do not account for everything between the two levels.
 * Nothing is inferred: a step without a value stops the chart, because
 * every later total would be wrong.
 */
import { wildcard } from './patterns.js';

/** Returns { steps: [{ kind: 'add'|'subtract'|'level'|'total', label, pattern, regex }], errors: [{ line, text }] }. */
export function parseSteps(text) {
	const steps = [];
	const errors = [];
	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		let line = raw.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		let sign = '+';
		if (/^[+\-=]/.test(line)) {
			sign = line[0];
			line = line.slice(1).trim();
		}
		const separator = line.indexOf('=');
		const label = (separator === -1 ? line : line.slice(0, separator)).trim();
		const pattern = separator === -1 ? '' : line.slice(separator + 1).trim();
		if (label === '' || (separator !== -1 && pattern === '') || (sign !== '=' && pattern === '')) {
			errors.push({ line: index + 1, text: raw.trim() });
			return;
		}
		const kind = sign === '=' ? (pattern === '' ? 'total' : 'level') : sign === '-' ? 'subtract' : 'add';
		steps.push({ kind, label, pattern, regex: pattern === '' ? null : wildcard(pattern) });
	});
	return { steps, errors };
}

/**
 * Matches steps to items and works out each bar.
 * Returns { bars: [{ kind, label, entry, from, to, delta }], missing, ambiguous, withoutValue, mismatches, unused, errors }.
 */
export function waterfallModel(series, text) {
	const { steps, errors } = parseSteps(text);
	const missing = [];
	const ambiguous = [];
	const withoutValue = [];
	const used = new Set();
	const matched = steps.map((step) => {
		if (step.regex === null) {
			return { ...step, entry: null };
		}
		const matches = series.filter((entry) => step.regex.test(entry.name));
		matches.forEach((entry) => used.add(entry.itemid));
		if (matches.length === 0) {
			missing.push(step.label);
		}
		else if (matches.length > 1) {
			ambiguous.push({ label: step.label, items: matches });
		}
		else if (typeof matches[0].value !== 'number') {
			withoutValue.push(step.label);
		}
		return { ...step, entry: matches.length === 1 ? matches[0] : null };
	});

	const bars = [];
	const mismatches = [];
	if (missing.length === 0 && ambiguous.length === 0 && withoutValue.length === 0 && errors.length === 0) {
		let running = 0;
		let started = false;
		for (const step of matched) {
			if (step.kind === 'add' || step.kind === 'subtract') {
				const delta = step.kind === 'add' ? step.entry.value : -step.entry.value;
				bars.push({ kind: delta >= 0 ? 'increase' : 'decrease', label: step.label, entry: step.entry, from: running, to: running + delta, delta });
				running += delta;
				started = true;
			}
			else if (step.kind === 'level') {
				const level = step.entry.value;
				// Floating-point sums may differ from a stored level in the last digits; that is not a mismatch.
				if (started && Math.abs(level - running) > 1e-9 * Math.max(1, Math.abs(level), Math.abs(running))) {
					mismatches.push({ label: step.label, expected: running, actual: level });
				}
				bars.push({ kind: 'level', label: step.label, entry: step.entry, from: 0, to: level, delta: null });
				running = level;
				started = true;
			}
			else {
				bars.push({ kind: 'total', label: step.label, entry: null, from: 0, to: running, delta: null });
			}
		}
	}

	return {
		steps: matched,
		bars,
		missing,
		ambiguous,
		withoutValue,
		mismatches,
		unused: series.filter((entry) => !used.has(entry.itemid)),
		errors
	};
}
