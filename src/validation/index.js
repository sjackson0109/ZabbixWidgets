import { activeRoles, isRoleRequired, ITEM_FIELDS } from '../registry/index.js';
import { RULES } from './rules.js';
import { ROLE_LABELS } from './labels.js';

function countOf(payload, role) {
	return payload.series.filter((series) => series.role === role).length;
}

/** Checks that apply to every chart: each required role has items and no role has more than it takes. */
function roleProblems(chart, payload) {
	const problems = [];

	for (const name of activeRoles(chart, payload.config)) {
		const role = chart.roles[name];
		const count = countOf(payload, name);
		if (count === 0 && isRoleRequired(role, payload.config)) {
			problems.push({
				level: 'error',
				code: 'missing_role',
				message: `${chart.name} requires ${ITEM_FIELDS[role.field] ?? role.field}: no matching items were found.`
			});
		}
		else if (role.max_items !== undefined && count > role.max_items) {
			problems.push({
				level: 'error',
				code: 'too_many_items',
				message: `${chart.name} uses ${role.max_items === 1 ? 'one item' : `${role.max_items} items`} for ${ROLE_LABELS[name]}; ${count} matched. Narrow the item pattern.`
			});
		}
	}

	return problems;
}

function seriesCountProblems(chart, payload) {
	const total = activeRoles(chart, payload.config).reduce((sum, name) => sum + countOf(payload, name), 0);
	return total >= chart.min_series ? [] : [{
		level: 'error',
		code: 'too_few_series',
		message: `${chart.name} requires at least ${chart.min_series} series; ${total} matched.`
	}];
}

/**
 * Validates a normalised payload against a chart's contract.
 *
 * Returns { ok, errors, warnings }. A chart renders only when ok is true;
 * otherwise the widget shows the error messages instead of a chart.
 */
export function validate(chart, payload) {
	if (payload.errors.length > 0) {
		// Server-side problems (no hosts, limits exceeded) explain everything that follows from them.
		return {
			ok: false,
			errors: payload.errors.map((message) => ({ level: 'error', code: 'server', message })),
			warnings: []
		};
	}

	const problems = roleProblems(chart, payload);

	// Data rules are meaningless while the inputs themselves are wrong.
	if (problems.length === 0) {
		const ctx = { chart, config: payload.config, payload };
		for (const rule of chart.rules) {
			const check = RULES[rule];
			if (check === undefined) {
				throw new Error(`Chart ${chart.id} references unknown rule "${rule}".`);
			}
			problems.push(...check(ctx));
		}
		problems.push(...seriesCountProblems(chart, payload));
	}

	const errors = problems.filter((problem) => problem.level === 'error');
	return {
		ok: errors.length === 0,
		errors,
		warnings: problems.filter((problem) => problem.level === 'warning')
	};
}

export { RULES };
