/**
 * Chart capability registry.
 *
 * The registry file (modules/extended-charts/registry/charts.json) is the single
 * source of truth: the PHP action reads it to decide what to fetch, the edit
 * form reads it to decide which controls to show, and the runtime reads it to
 * validate data and pick a renderer.
 */
import definitions from '../../modules/extended-charts/registry/charts.json';

const charts = new Map(definitions.charts.map((chart) => [chart.id, Object.freeze(chart)]));

export const COMMON_CONTROLS = Object.freeze([...definitions.common_controls]);

export function listCharts() {
	return [...charts.values()];
}

export function getChart(id) {
	return charts.get(id) ?? null;
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
		const [field, values] = condition.slice(5).split('=');
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

/**
 * Controls the edit form should show for a chart. Role fields that are not
 * required and not optional under the current configuration are hidden, so a
 * user only sees mappings that apply to the selected input mode.
 */
export function visibleControls(chartId, config = {}) {
	const chart = getChart(chartId);
	if (chart === null) {
		return [...COMMON_CONTROLS];
	}

	const hiddenRoleFields = new Set();
	for (const role of Object.values(chart.roles)) {
		if (typeof role.required === 'string' && !evaluateCondition(role.required, config)) {
			hiddenRoleFields.add(role.field);
		}
	}

	const conditional = {
		target_items: config.target_source === 'item',
		target_macro: config.target_source === 'macro',
		target_constant: config.target_source === 'constant',
		pair_tag: config.pair_by === 'tag',
		radar_max: config.radar_scale === 'shared',
		tree_tags: config.tree_source === 'tags',
		tree_delimiter: config.tree_source === 'item_path',
		edge_list: config.edge_source === 'list',
		edge_tag: config.edge_source === 'tag',
		bucket: chart.id !== 'heatmap' || config.heat_x === 'time',
		aggregation: chart.id !== 'heatmap' || config.heat_x === 'time',
		time_period: requiresTimePeriod(chart, config)
	};

	const fields = chart.controls.filter((field) => {
		// A field shared by several roles (e.g. "items") stays visible while any role using it applies.
		const rolesUsingField = Object.values(chart.roles).filter((role) => role.field === field);
		if (rolesUsingField.length > 0 && rolesUsingField.every((role) => hiddenRoleFields.has(role.field))) {
			return false;
		}
		return conditional[field] ?? true;
	});

	return [...COMMON_CONTROLS, ...fields];
}
