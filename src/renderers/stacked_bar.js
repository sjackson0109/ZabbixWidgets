/**
 * C02 Stacked Bar: current values as bars stacked per category. The grouping
 * dimension is explicit (host or item, as for C01) and every stack shares
 * one unit, which validation enforces.
 *
 * Stacking:
 * - Values (the default): positive and negative values stack on their own
 *   sides of zero, as ECharts does by default.
 * - Percentage of category: each bar is its share of the category's total.
 *   A category in which any member has no value is left empty, because a
 *   share of an incomplete total would be wrong; validation names it.
 * - Diverging: the "Opposing items" are drawn to the other side of zero
 *   (for example received against sent). Their values are never changed:
 *   the axis and tooltip show them as they are, only the direction differs.
 */
import { baseOption, categoryAxis, commonUnits, tooltipLine, valueAxis } from './common.js';
import { distinct, hostDimension, itemDimension } from './dimensions.js';
import { escapeHtml } from '../utils/escape.js';
import { formatValue } from '../data/units.js';

/**
 * Categories and bar groups for both roles. Every group has one cell per
 * category: the series, or null where it has none.
 * Returns { categories, groups: [{ name, role, cells }] }.
 */
export function stackGroups(payload) {
	const byHost = payload.config.group_by !== 'item';
	const categoryOf = byHost ? hostDimension : itemDimension;
	const groupOf = byHost ? itemDimension : hostDimension;
	const roles = payload.config.stack_mode === 'diverging' ? ['value', 'opposing'] : ['value'];
	const series = payload.series.filter((entry) => roles.includes(entry.role));
	const categories = distinct(series, categoryOf);

	const groups = roles.flatMap((role) => {
		const members = series.filter((entry) => entry.role === role);
		const cells = new Map(members.map((entry) => [`${groupOf(entry).id}|${categoryOf(entry).id}`, entry]));
		return distinct(members, groupOf).map((dimension) => ({
			name: dimension.label,
			role,
			cells: categories.map((category) => cells.get(`${dimension.id}|${category.id}`) ?? null)
		}));
	});

	// Legend names must be unique; a name used on both sides says which side it is.
	const counts = new Map();
	for (const group of groups) {
		counts.set(group.name, (counts.get(group.name) ?? 0) + 1);
	}
	for (const group of groups) {
		if (counts.get(group.name) > 1 && group.role === 'opposing') {
			group.name = `${group.name} (opposing)`;
		}
	}

	return { categories: categories.map((category) => category.label), groups };
}

/**
 * Category totals for percentage stacking: the sum of every member's value,
 * or null when a member has no value or no item (the category is then left empty).
 */
export function categoryTotals(groups, count) {
	return Array.from({ length: count }, (_, index) => {
		const cells = groups.map((group) => group.cells[index]);
		if (cells.some((cell) => cell === null || typeof cell.value !== 'number')) {
			return null;
		}
		return cells.reduce((sum, cell) => sum + cell.value, 0);
	});
}

/** Categories whose percentage bars are left empty, with the members that have no value. */
export function incompleteCategories(payload) {
	const { categories, groups } = stackGroups(payload);
	return categories.flatMap((label, index) => {
		const missing = groups.filter((group) => group.cells[index] === null || typeof group.cells[index].value !== 'number');
		return missing.length === 0 ? [] : [{ label, missing }];
	});
}

export function buildStackedBarOption(payload, context) {
	const { config } = payload;
	const mode = config.stack_mode === 'percent' || config.stack_mode === 'diverging' ? config.stack_mode : 'absolute';
	const { categories, groups } = stackGroups(payload);
	const units = commonUnits(payload.series.filter((entry) => groups.some((group) => group.role === entry.role))) ?? '';
	const totals = mode === 'percent' ? categoryTotals(groups, categories.length) : [];
	const vertical = config.stack_orientation === 'vertical';

	const share = (cell, index) => (totals[index] > 0 && typeof cell?.value === 'number' ? (cell.value / totals[index]) * 100 : null);
	const plotted = (group, cell, index) => {
		if (cell === null || typeof cell.value !== 'number') {
			return null;
		}
		if (mode === 'percent') {
			return share(cell, index);
		}
		return group.role === 'opposing' ? -cell.value : cell.value;
	};

	const values = valueAxis(context, mode === 'percent' ? '%' : units);
	if (mode === 'percent') {
		Object.assign(values, { min: 0, max: 100 });
	}
	if (mode === 'diverging') {
		// Both sides show magnitudes; which side a bar is on says which role it belongs to.
		values.axisLabel = { ...values.axisLabel, formatter: (value) => formatValue(Math.abs(value), units, context.decimals) };
	}
	const categoryAxisOption = { ...categoryAxis(context, categories), inverse: !vertical };

	const base = baseOption(context);

	return {
		...base,
		grid: { left: 8, right: 16, top: 8, bottom: context.showLegend ? 32 : 8, containLabel: true },
		xAxis: vertical ? categoryAxisOption : values,
		yAxis: vertical ? values : categoryAxisOption,
		tooltip: {
			...base.tooltip,
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			formatter: (params) => {
				const index = params[0]?.dataIndex ?? 0;
				const cells = params
					.map((param) => ({ param, group: groups[param.seriesIndex], cell: groups[param.seriesIndex].cells[param.dataIndex] }))
					.filter(({ cell }) => cell !== null);
				const lines = cells.map(({ param, cell }) => {
					const line = tooltipLine(param.marker, param.seriesName, cell.value, cell.units, context.decimals);
					const percent = mode === 'percent' ? share(cell, index) : null;
					return percent === null ? line : `${line} (${escapeHtml(formatValue(percent, '', 1))}%)`;
				});
				const sum = (role) => cells.filter(({ group }) => group.role === role).reduce((total, { cell }) => total + (cell.value ?? 0), 0);
				const footer = mode === 'diverging'
					? [`Total: <b>${escapeHtml(formatValue(sum('value'), units, context.decimals))}</b>`,
						`Opposing total: <b>${escapeHtml(formatValue(sum('opposing'), units, context.decimals))}</b>`]
					: mode === 'percent' && totals[index] === null
						? ['Not every member has a value, so no shares are drawn.']
						: [`Total: <b>${escapeHtml(formatValue(sum('value'), units, context.decimals))}</b>`];
				return [`<b>${escapeHtml(params[0]?.name ?? '')}</b>`, ...lines, ...footer].join('<br>');
			}
		},
		series: groups.map((group) => ({
			type: 'bar',
			name: group.name,
			// One stack: ECharts stacks positive and negative values separately, so opposing bars grow from zero the other way.
			stack: 'total',
			data: group.cells.map((cell, index) => plotted(group, cell, index)),
			emphasis: { focus: 'series' }
		}))
	};
}

export default {
	id: 'stacked_bar',
	buildOption: buildStackedBarOption
};
