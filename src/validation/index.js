import { isRoleRequired } from '../registry/index.js';
import { activeRoles, RULES } from './rules.js';
import { FIELD_LABELS } from './labels.js';

/**
 * Validates a normalised payload against a chart's contract.
 *
 * Returns { ok, errors, warnings }. A chart renders only when ok is true;
 * otherwise the widget shows the error messages instead of a chart.
 */
export function validate(chart, payload) {
	const config = payload.config;
	if (payload.errors.length > 0) {
		// Server-side problems (no hosts, limits exceeded) explain everything that follows from them.
		return {
			ok: false,
			errors: payload.errors.map((message) => ({ level: 'error', code: 'server', message })),
			warnings: []
		};
	}

	const problems = [];

	for (const name of activeRoles(chart, config)) {
		const role = chart.roles[name];
		const count = payload.series.filter((series) => series.role === name).length;
		if (isRoleRequired(role, config) && count === 0) {
			problems.push({
				level: 'error',
				code: 'missing_role',
				message: `${chart.name} requires ${FIELD_LABELS[role.field] ?? role.field}: no matching items were found.`
			});
		}
	}

	// Data rules are meaningless while required inputs are missing.
	if (!problems.some((problem) => problem.level === 'error')) {
		const ctx = { chart, config, payload };
		for (const rule of chart.rules) {
			const check = RULES[rule];
			if (check === undefined) {
				throw new Error(`Chart ${chart.id} references unknown rule "${rule}".`);
			}
			problems.push(...check(ctx));
		}
	}

	const errors = problems.filter((problem) => problem.level === 'error');
	return {
		ok: errors.length === 0,
		errors,
		warnings: problems.filter((problem) => problem.level === 'warning')
	};
}

export { RULES };
