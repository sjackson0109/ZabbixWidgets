/**
 * Validation rules referenced by name from the chart registry. Each rule
 * receives a context and returns a list of problems; an empty list passes.
 * Messages are written for dashboard users, not developers.
 */
import { displayUnits } from '../data/units.js';
import { alignOhlc, bucketCount, isConsistentCandle, MAX_BUCKETS, parseBucket } from '../data/aggregate.js';
import { parseRanges } from '../data/targets.js';
import { pairSeries } from '../data/pairing.js';
import { parseEdgeList, edgesFromHostTag, resolveEdges } from '../data/edges.js';
import { tagValue, toNumber } from '../data/normalise.js';
import { isRoleRequired } from '../registry/index.js';
import { listNames, seriesLabel, ROLE_LABELS } from './labels.js';

function error(code, message) {
	return { level: 'error', code, message };
}

function warning(code, message) {
	return { level: 'warning', code, message };
}

/** Roles that apply under the current configuration (required or optional). */
export function activeRoles(chart, config) {
	return Object.entries(chart.roles)
		.filter(([, role]) => typeof role.required !== 'string' || isRoleRequired(role, config))
		.map(([name]) => name);
}

function numericRoles(chart, config) {
	return activeRoles(chart, config).filter((name) => chart.roles[name].numeric);
}

function roleSeries({ payload, chart, config }, roles = activeRoles(chart, config)) {
	return payload.series.filter((series) => roles.includes(series.role));
}

function tooManyBuckets(ctx, what) {
	const count = bucketCount(ctx.payload.timePeriod, parseBucket(ctx.config.bucket));
	return count > MAX_BUCKETS ? [error('too_many_buckets',
		`The time period holds ${count} ${what}, more than the ${MAX_BUCKETS} this widget draws. Choose a longer ${what === 'candles' ? 'candle period' : 'bucket'} or a shorter time period.`)] : [];
}

function pairingRoles(chart, config) {
	return activeRoles(chart, config).filter((name) => isRoleRequired(chart.roles[name], config));
}

export const RULES = {
	numeric_only(ctx) {
		const offending = roleSeries(ctx, numericRoles(ctx.chart, ctx.config)).filter((series) => !series.numeric);
		return offending.length === 0 ? [] : [error('numeric_only',
			`${ctx.chart.name} needs numeric items. These items hold text or log values: ${listNames(offending.map(seriesLabel))}.`)];
	},

	has_values(ctx) {
		const series = roleSeries(ctx);
		const invalid = series.filter((entry) => entry.invalidValue);
		const withValues = series.filter((entry) => entry.value !== null);
		const problems = [];

		if (invalid.length > 0) {
			problems.push(error('invalid_value',
				`These items returned values that are not valid numbers: ${listNames(invalid.map(seriesLabel))}.`));
		}
		if (series.length > 0 && withValues.length === 0) {
			problems.push(error('no_values', 'None of the selected items has a recent value.'));
		}
		else {
			const missing = series.filter((entry) => entry.value === null && !entry.invalidValue);
			if (missing.length > 0) {
				problems.push(warning('missing_values',
					`No recent value for ${listNames(missing.map(seriesLabel))}; shown as no data.`));
			}
		}
		return problems;
	},

	same_units(ctx) {
		const units = [...new Set(roleSeries(ctx, numericRoles(ctx.chart, ctx.config)).map((series) => displayUnits(series.units)))];
		if (units.length <= 1) {
			return [];
		}
		const shown = units.map((unit) => (unit === '' ? '(no units)' : `"${unit}"`));
		return [error('mixed_units',
			`These series cannot be combined because they use incompatible units: ${listNames(shown, 4)}.`)];
	},

	non_negative(ctx) {
		const negative = roleSeries(ctx).filter((series) => typeof series.value === 'number' && series.value < 0);
		return negative.length === 0 ? [] : [error('negative_values',
			`${ctx.chart.name} cannot show negative values: ${listNames(negative.map(seriesLabel))}.`)];
	},

	non_negative_size(ctx) {
		const negative = ctx.payload.series.filter((series) => series.role === 'size' && typeof series.value === 'number' && series.value < 0);
		return negative.length === 0 ? [] : [error('negative_size',
			`Bubble size cannot be negative: ${listNames(negative.map(seriesLabel))}.`)];
	},

	has_target(ctx) {
		const { config, payload } = ctx;
		const actual = payload.series.filter((series) => series.role === 'actual');

		switch (config.target_source) {
			case 'item': {
				const { incomplete, ambiguous, untagged } = pairSeries(payload.series, ['actual', 'target'], {
					pairBy: config.pair_by,
					pairTag: config.pair_tag
				});
				const problems = [];
				const noTarget = incomplete.filter((entry) => entry.missing.includes('target'));
				if (noTarget.length > 0) {
					problems.push(error('missing_target', `No target item found for ${listNames(noTarget.map((entry) => entry.label))}.`));
				}
				if (ambiguous.length > 0) {
					problems.push(error('ambiguous_target',
						`More than one target item matches ${listNames(ambiguous.map((entry) => entry.label))}. Narrow the target item pattern.`));
				}
				if (untagged.length > 0) {
					problems.push(error('untagged_items',
						`These items have no "${config.pair_tag}" tag to pair them by: ${listNames(untagged.map(seriesLabel))}.`));
				}
				return problems;
			}
			case 'macro': {
				const macro = String(config.target_macro ?? '').trim();
				if (macro === '') {
					return [error('missing_target', 'Bullet Graph requires a target macro name, for example {$CPU.TARGET}.')];
				}
				const hosts = new Map(payload.hosts.map((host) => [host.hostid, host]));
				const unresolved = actual.filter((series) => toNumber(hosts.get(series.hostid)?.macros?.[macro]) === null);
				return unresolved.length === 0 ? [] : [error('missing_target',
					`Macro ${macro} is not defined as a number on ${listNames(unresolved.map((series) => series.host))}.`)];
			}
			case 'constant':
				return toNumber(String(config.target_constant ?? '')) === null
					? [error('missing_target', 'Bullet Graph requires a numeric target value.')]
					: [];
			default:
				return [error('missing_target',
					'Bullet Graph requires a target: choose a target item, a macro or a constant.')];
		}
	},

	min_dimensions(ctx) {
		const minimum = ctx.chart.min_dimensions ?? 1;
		const dimensions = new Set(roleSeries(ctx).map((series) => series.name));
		return dimensions.size >= minimum ? [] : [error('too_few_dimensions',
			`${ctx.chart.name} requires at least ${minimum} different items as axes; ${dimensions.size} selected.`)];
	},

	radar_scale(ctx) {
		const problems = [];
		if (ctx.config.radar_scale !== 'per_dimension') {
			problems.push(...RULES.same_units(ctx).map((problem) => ({
				...problem,
				message: `${problem.message} Use per-axis scaling to compare metrics with different units.`
			})));
			const max = toNumber(String(ctx.config.radar_max ?? ''));
			if (ctx.config.radar_max !== undefined && ctx.config.radar_max !== '' && (max === null || max <= 0)) {
				problems.push(error('invalid_max', 'Radar maximum must be a positive number.'));
			}
		}
		const values = roleSeries(ctx).map((series) => series.value).filter((value) => typeof value === 'number');
		if (values.length > 0 && Math.max(...values) <= 0 && !(toNumber(String(ctx.config.radar_max ?? '')) > 0)) {
			problems.push(error('invalid_max', 'Radar needs at least one positive value, or a configured maximum, to scale its axes.'));
		}
		return problems;
	},

	colour_bounds(ctx) {
		const min = ctx.config.colour_min;
		const max = ctx.config.colour_max;
		const problems = [];
		const parsedMin = min === undefined || min === '' ? null : toNumber(String(min));
		const parsedMax = max === undefined || max === '' ? null : toNumber(String(max));

		if (min !== undefined && min !== '' && parsedMin === null) {
			problems.push(error('invalid_bounds', 'Colour scale minimum must be a number.'));
		}
		if (max !== undefined && max !== '' && parsedMax === null) {
			problems.push(error('invalid_bounds', 'Colour scale maximum must be a number.'));
		}
		if (parsedMin !== null && parsedMax !== null && parsedMin >= parsedMax) {
			problems.push(error('invalid_bounds', 'Colour scale minimum must be lower than the maximum.'));
		}
		if (ctx.config.heat_x === 'time' && parseBucket(ctx.config.bucket) === null) {
			problems.push(error('invalid_bucket', 'Time buckets must look like 15m, 1h or 1d.'));
		}
		return problems;
	},

	has_history(ctx) {
		const series = roleSeries(ctx);
		const empty = series.filter((entry) => entry.history.length === 0);
		const problems = [];
		if (empty.length > 0) {
			problems.push(error('no_history',
				`No history in the selected time period for ${listNames(empty.map(seriesLabel))}.`));
		}
		const maxItems = activeRoles(ctx.chart, ctx.config)
			.map((name) => [name, ctx.chart.roles[name].max_items])
			.filter(([, max]) => max !== undefined);
		for (const [name, max] of maxItems) {
			const count = ctx.payload.series.filter((entry) => entry.role === name).length;
			if (count > max) {
				problems.push(error('too_many_items',
					`${ctx.chart.name} uses ${max === 1 ? 'one item' : `${max} items`} for ${ROLE_LABELS[name]}; ${count} matched. Narrow the item pattern.`));
			}
		}
		return problems;
	},

	ohlc_consistent(ctx) {
		const bucket = parseBucket(ctx.config.bucket);
		if (bucket === null) {
			return [error('invalid_bucket', 'Candle period must look like 15m, 1h or 1d.')];
		}
		const limit = tooManyBuckets(ctx, 'candles');
		if (limit.length > 0) {
			return limit;
		}
		if (ctx.config.ohlc_mode !== 'explicit') {
			return [];
		}
		const history = (role) => ctx.payload.series.find((series) => series.role === role)?.history ?? [];
		const { candles, incomplete } = alignOhlc({
			open: history('open'), high: history('high'), low: history('low'), close: history('close')
		}, bucket);
		const problems = [];
		if (candles.length === 0) {
			problems.push(error('no_candles', 'The open, high, low and close items have no values in the same periods.'));
		}
		const inconsistent = candles.filter((candle) => !isConsistentCandle(candle));
		if (inconsistent.length > 0) {
			problems.push(error('inconsistent_ohlc',
				`${inconsistent.length} candle(s) have a high below or a low above the open/close values. Check the item mapping.`));
		}
		if (incomplete.length > 0) {
			problems.push(warning('incomplete_candles', `${incomplete.length} period(s) are missing one of open, high, low or close and are not drawn.`));
		}
		return problems;
	},

	complete_tuples(ctx) {
		const roles = pairingRoles(ctx.chart, ctx.config);
		const { tuples, incomplete, ambiguous, untagged } = pairSeries(ctx.payload.series, roles, {
			pairBy: ctx.config.pair_by,
			pairTag: ctx.config.pair_tag
		});
		const problems = [];
		const roleList = listNames(roles.map((role) => ROLE_LABELS[role]), roles.length);

		if (incomplete.length > 0) {
			const detail = incomplete.map((entry) => `${entry.label} (no ${entry.missing.map((role) => ROLE_LABELS[role]).join(', ')})`);
			problems.push(error('incomplete_tuples', `${ctx.chart.name} requires ${roleList} values for each entry. Missing: ${listNames(detail)}.`));
		}
		if (ambiguous.length > 0) {
			problems.push(error('ambiguous_tuples',
				`More than one item matches the same role for ${listNames(ambiguous.map((entry) => entry.label))}. Narrow the item patterns or pair by tag.`));
		}
		if (untagged.length > 0) {
			problems.push(error('untagged_items',
				`These items have no "${ctx.config.pair_tag}" tag to pair them by: ${listNames(untagged.map(seriesLabel))}.`));
		}
		if (tuples.length === 0 && problems.length === 0) {
			problems.push(error('no_tuples', `${ctx.chart.name} requires ${roleList} data mappings.`));
		}
		return problems;
	},

	valid_intervals(ctx) {
		const roles = pairingRoles(ctx.chart, ctx.config);
		const { tuples } = pairSeries(ctx.payload.series, roles, { pairBy: ctx.config.pair_by, pairTag: ctx.config.pair_tag });
		const invalid = tuples.filter(({ members }) => {
			const start = members.start?.value;
			if (typeof start !== 'number' || start <= 0) {
				return true;
			}
			if (ctx.config.gantt_timing === 'start_duration') {
				return typeof members.duration?.value !== 'number' || members.duration.value < 0;
			}
			return typeof members.end?.value !== 'number' || members.end.value < start;
		});
		const problems = invalid.length === 0 ? [] : [error('invalid_interval',
			`Gantt Chart requires a start timestamp and an end at or after it for each task. Invalid: ${listNames(invalid.map((tuple) => tuple.label))}.`)];
		const progress = ctx.payload.series.filter((series) => series.role === 'progress'
			&& typeof series.value === 'number' && (series.value < 0 || series.value > 100));
		if (progress.length > 0) {
			problems.push(error('invalid_progress',
				`Progress must be a percentage from 0 to 100: ${listNames(progress.map(seriesLabel))}.`));
		}
		return problems;
	},

	hierarchy_source(ctx) {
		switch (ctx.config.tree_source) {
			case 'host_group':
				return [];
			case 'tags': {
				const tags = String(ctx.config.tree_tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
				return tags.length > 0 ? [] : [error('missing_hierarchy', 'Tree Diagram requires at least one tag name to build levels from.')];
			}
			case 'item_path':
				return String(ctx.config.tree_delimiter ?? '') !== '' ? []
					: [error('missing_hierarchy', 'Tree Diagram requires a delimiter to split item names into levels.')];
			default:
				return [error('missing_hierarchy', 'Tree Diagram requires a hierarchy source: host groups, tags or item name paths.')];
		}
	},

	has_edges(ctx) {
		const { config, payload } = ctx;
		if (config.edge_source === 'list') {
			const { edges, errors } = parseEdgeList(config.edge_list);
			const problems = errors.map((entry) => error('invalid_edge',
				`Line ${entry.line} of the relationship list is not in the form "source -> target".`));
			if (edges.length === 0 && errors.length === 0) {
				problems.push(error('no_edges', 'Network diagram requires relationships. Add one "source host -> target host" per line.'));
			}
			return problems;
		}
		if (config.edge_source === 'tag') {
			const tag = String(config.edge_tag ?? '').trim();
			if (tag === '') {
				return [error('no_edges', 'Network diagram requires the name of the host tag that names each linked host.')];
			}
			return edgesFromHostTag(payload.hosts, tag).length > 0 ? []
				: [error('no_edges', `None of the selected hosts has a "${tag}" tag naming a linked host.`)];
		}
		return [error('no_edges', 'Network diagram requires a relationship source: a relationship list or a host tag.')];
	},

	edges_resolve(ctx) {
		const { config, payload } = ctx;
		const edges = config.edge_source === 'list'
			? parseEdgeList(config.edge_list).edges
			: edgesFromHostTag(payload.hosts, String(config.edge_tag ?? '').trim());
		const { unresolved } = resolveEdges(edges, payload.hosts);
		const names = unresolved.flatMap((edge) => edge.missing);
		return names.length === 0 ? [] : [error('unknown_hosts',
			`These relationship endpoints are not among the selected hosts: ${listNames(names)}.`)];
	},

	relationship_tags(ctx) {
		const sourceTag = String(ctx.config.source_tag ?? '').trim();
		const targetTag = String(ctx.config.target_tag ?? '').trim();
		if (sourceTag === '' || targetTag === '') {
			return [error('missing_relationship_tags', 'Chord / Relationship Diagram requires source and target tag names.')];
		}
		const untagged = roleSeries(ctx).filter((series) => {
			const source = tagValue(series.tags, sourceTag);
			const target = tagValue(series.tags, targetTag);
			return source === null || source === '' || target === null || target === '';
		});
		const problems = untagged.length === 0 ? [] : [error('untagged_items',
			`These items need both "${sourceTag}" and "${targetTag}" tags: ${listNames(untagged.map(seriesLabel))}.`)];
		const loops = roleSeries(ctx).filter((series) => {
			const source = tagValue(series.tags, sourceTag);
			return source !== null && source !== '' && source === tagValue(series.tags, targetTag);
		});
		if (loops.length > 0) {
			problems.push(warning('self_flows',
				`These items flow from an endpoint to itself and are not drawn: ${listNames(loops.map(seriesLabel))}.`));
		}
		return problems;
	},

	bullet_ranges(ctx) {
		const { error: problem } = parseRanges(ctx.config.ranges);
		return problem === null ? [] : [error('invalid_ranges', problem)];
	},

	heat_axes(ctx) {
		const { heat_x: x, heat_y: y } = ctx.config;
		if (x === y) {
			return [error('invalid_axes', 'Heat Map needs different X and Y axes: choose hosts against items, or time against hosts or items.')];
		}
		return x === 'time' && parseBucket(ctx.config.bucket) !== null ? tooManyBuckets(ctx, 'buckets') : [];
	}
};
