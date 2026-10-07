/**
 * Chart capability registry.
 *
 * The registry file (modules/extended-charts/registry/charts.json) is the single
 * source of truth: the PHP action reads it to decide what to fetch, the edit
 * form reads it to decide which controls to show, and the runtime reads it to
 * validate data and pick a renderer. ChartRegistry.php implements the same
 * functions for the server; tests/compat/registry-parity.test.js keeps them equal.
 */
import definitions from '../../modules/extended-charts/registry/charts.json';

const charts = new Map(definitions.charts.map((chart) => [chart.id, Object.freeze(chart)]));

export const COMMON_CONTROLS = Object.freeze([...definitions.common_controls]);

/** Item pattern fields, keyed by field name, with their labels. */
export const ITEM_FIELDS = Object.freeze({ ...definitions.item_fields });

/** Radio and select fields, keyed by field name, with their values in stored order. */
export const ENUMS = Object.freeze({ ...definitions.enums });

/** Every control any chart can show. */
export const ALL_CONTROLS = Object.freeze([...new Set([...COMMON_CONTROLS, ...definitions.charts.flatMap((chart) => chart.controls)])]);

export function listCharts() {
	return [...charts.values()];
}

export function getChart(id) {
	return charts.get(id) ?? null;
}

export function chartByFormValue(formValue) {
	return listCharts().find((chart) => chart.form_value === formValue) ?? null;
}

/**
 * Evaluates a registry condition.
 *
 * Conditions are either booleans, the strings "always"/"none", or
 * "when:<field>=<value>[|<value>...]" which is true when the configured field
 * matches one of the listed values.
 */
export function evaluateCondition(condition, config = {}) {
	if (condition === true || condition === 'always') {
		return true;
	}
	if (condition === false || condition === 'none' || condition == null) {
		return false;
	}
	if (typeof condition === 'string' && condition.startsWith('when:')) {
		const separator = condition.indexOf('=');
		const field = condition.slice(5, separator);
		const values = condition.slice(separator + 1);
		return values.split('|').includes(String(config[field] ?? ''));
	}
	throw new Error(`Unknown registry condition: ${condition}`);
}

export function requiresHistory(chart, config) {
	return evaluateCondition(chart.history, config);
}

export function requiresTimePeriod(chart, config) {
	return evaluateCondition(chart.time_period, config);
}

export function isRoleRequired(role, config) {
	return evaluateCondition(role.required, config);
}

/** Names of the roles that apply under the configuration (required or optional). */
export function activeRoles(chart, config) {
	return Object.entries(chart.roles)
		.filter(([, role]) => typeof role.required !== 'string' || isRoleRequired(role, config))
		.map(([name]) => name);
}

/**
 * Controls the edit form should show for a chart. A role's item field is
 * hidden while the role does not apply, and other controls follow their
 * control_conditions, so a user only sees settings for the selected mode.
 */
export function visibleControls(chartId, config = {}) {
	const chart = getChart(chartId);
	if (chart === null) {
		return [...COMMON_CONTROLS];
	}

	const active = new Set(activeRoles(chart, config));
	const conditions = {
		...definitions.control_conditions,
		...chart.control_conditions,
		time_period: chart.time_period
	};

	const fields = chart.controls.filter((field) => {
		// A field shared by several roles (e.g. "items") stays visible while any role using it applies.
		const roles = Object.entries(chart.roles).filter(([, role]) => role.field === field);
		if (roles.length > 0) {
			return roles.some(([name]) => active.has(name));
		}
		return field in conditions ? evaluateCondition(conditions[field], config) : true;
	});

	const common = COMMON_CONTROLS.filter((field) => !(field in conditions) || evaluateCondition(conditions[field], config));
	return [...common, ...fields];
}

/** Shown controls that must not be left empty. */
export function requiredControls(chartId, config = {}) {
	const visible = new Set(visibleControls(chartId, config));
	return definitions.required_controls.filter((field) => visible.has(field));
}
