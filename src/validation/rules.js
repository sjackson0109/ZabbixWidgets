/**
 * Validation rules referenced by name from the chart registry. Each rule
 * receives a context and returns a list of problems; an empty list passes.
 * Messages are written for dashboard users, not developers.
 */
import { displayUnits } from '../data/units.js';
import { alignOhlc, bucketCount, isConsistentCandle, MAX_BUCKETS, parseBucket } from '../data/aggregate.js';
import { parseRanges } from '../data/targets.js';
import { pairSeries } from '../data/pairing.js';
import { edgeWeight, parseEdgeList, edgesFromHostTag, resolveEdges } from '../data/edges.js';
import { parseNodePositions } from '../data/positions.js';
import { incompleteCategories } from '../renderers/stacked_bar.js';
import { barUnits } from '../renderers/mixed.js';
import { findCycle, sankeyFlows } from '../renderers/sankey.js';
import { MAX_BINS } from '../data/distribution.js';
import { parseAxes, parallelModel } from '../data/parallel.js';
import { waterfallModel } from '../data/waterfall.js';
import { zoneOffset } from '../data/buckets.js';
import { tagValue, toNumber } from '../data/normalise.js';
import { activeRoles, isRoleRequired } from '../registry/index.js';
import { buildTable } from '../data/table.js';
import { parseDefinitions } from '../data/patterns.js';
import { isAdditive } from '../data/groups.js';
import { resolveScale, sharedScale } from '../data/thresholds.js';
import { buildLevelTree, parseLevels } from '../data/levels.js';
import { funnelStages } from '../data/funnel.js';
import { pairColours } from '../renderers/treemap.js';
import { parseGap, unitGroups } from '../data/temporal.js';
import { parseColourMap } from '../data/states.js';
import { buildPanel, compileCapture, parseStale, speedPalette, ROLE_LABELS as PORT_ROLE_LABELS } from '../data/ports.js';
import { isHexColour } from '../utils/colour.js';
import { listNames, seriesLabel, ROLE_LABELS } from './labels.js';

function error(code, message) {
	return { level: 'error', code, message };
}

function warning(code, message) {
	return { level: 'warning', code, message };
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

/**
 * Axis limits, thresholds and target of a time-series chart, resolved once
 * for all its hosts. Only the settings the chart shows are read.
 */
function temporalScale(ctx) {
	const shown = (field) => (ctx.chart.controls.includes(field) ? ctx.config[field] : '');
	const hostids = new Set(roleSeries(ctx).map((entry) => entry.hostid));
	return sharedScale({ scale_min: shown('y_min'), scale_max: shown('y_max'), target_value: shown('target_value'), thresholds: shown('thresholds') },
		ctx.payload.hosts.filter((host) => hostids.has(host.hostid)));
}

function capitalise(message) {
	return `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
}

function colourMapErrors(text) {
	return parseColourMap(text).errors.map((line) => error('invalid_colours',
		`Line ${line.line} of the value colours is not in the form "value = #rrggbb".`));
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
		return problems;
	},

	has_history(ctx) {
		const empty = roleSeries(ctx).filter((entry) => entry.history.length === 0);
		return empty.length === 0 ? [] : [error('no_history',
			`No history in the selected time period for ${listNames(empty.map(seriesLabel))}.`)];
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
		if (config.edge_source !== 'list') {
			// A tag can name a host this user may not see. Such peers are counted, never named.
			const edges = edgesFromHostTag(payload.hosts, String(config.edge_tag ?? '').trim());
			const { resolved, unresolved } = resolveEdges(edges, payload.hosts);
			if (unresolved.length === 0) {
				return [];
			}
			const message = `${unresolved.length} link${unresolved.length === 1 ? ' names a host' : 's name hosts'} that ${unresolved.length === 1 ? 'is' : 'are'} not among the selected hosts, or not visible to you, and ${unresolved.length === 1 ? 'is' : 'are'} not drawn.`;
			return [(resolved.length === 0 ? error : warning)('unknown_hosts', message)];
		}
		const { unresolved } = resolveEdges(parseEdgeList(config.edge_list).edges, payload.hosts);
		const names = unresolved.flatMap((edge) => edge.missing);
		return names.length === 0 ? [] : [error('unknown_hosts',
			`These relationship endpoints are not among the selected hosts: ${listNames(names)}.`)];
	},

	/** C11: layout, categories and link weights. */
	network_settings(ctx) {
		const { config, payload } = ctx;
		const problems = [];
		if (config.network_layout === 'fixed') {
			const { positions, errors, duplicates } = parseNodePositions(config.node_positions);
			problems.push(...errors.map((line) => error('invalid_positions', `Line ${line.line} of the node positions is not in the form "host name = x, y".`)));
			if (duplicates.length > 0) {
				problems.push(error('invalid_positions', `These hosts have more than one position: ${listNames(duplicates)}.`));
			}
			if (errors.length === 0 && duplicates.length === 0) {
				const unplaced = payload.hosts.filter((entry) => !positions.has(entry.name));
				if (unplaced.length === payload.hosts.length && unplaced.length > 0) {
					problems.push(error('no_positions', 'None of the selected hosts has a position. Add one "host name = x, y" line per host.'));
				}
				else if (unplaced.length > 0) {
					problems.push(warning('unplaced_hosts', `These hosts have no position and are not drawn: ${listNames(unplaced.map((entry) => entry.name))}.`));
				}
				const hostNames = new Set(payload.hosts.map((entry) => entry.name));
				const unknown = [...positions.keys()].filter((name) => !hostNames.has(name));
				if (unknown.length > 0) {
					problems.push(warning('unknown_positions', `These positions name hosts that are not selected: ${listNames(unknown)}.`));
				}
			}
		}
		if (config.node_category === 'tag' && String(config.node_category_tag ?? '').trim() === '') {
			problems.push(error('missing_category_tag', 'Colouring nodes by host tag requires the tag name.'));
		}
		if (config.edge_source === 'list') {
			const { resolved } = resolveEdges(parseEdgeList(config.edge_list).edges, payload.hosts);
			const values = payload.series.filter((entry) => entry.role === 'value');
			const missing = [];
			const noValue = [];
			for (const edge of resolved) {
				const weight = edgeWeight(edge, values);
				const where = `${edge.source} -> ${edge.target} (${edge.weight?.key})`;
				if (weight.error === 'missing_item') {
					missing.push(where);
				}
				else if (weight.error === 'no_value') {
					noValue.push(where);
				}
				else if (weight.value !== null && weight.value < 0) {
					problems.push(error('negative_weight', `Link weights cannot be negative: ${edge.source} -> ${edge.target}.`));
				}
			}
			if (missing.length > 0) {
				problems.push(error('missing_weight_item',
					`No item with the weight key was found on the source host for ${listNames(missing)}. The item must also match the item pattern.`));
			}
			if (noValue.length > 0) {
				problems.push(warning('missing_weight_value', `No recent value for the weight of ${listNames(noValue)}; drawn as a dashed line.`));
			}
			const units = [...new Set(resolved.map((edge) => edgeWeight(edge, values)).filter((weight) => weight.entry !== null).map((weight) => displayUnits(weight.units)))];
			if (units.length > 1) {
				problems.push(error('mixed_units', `Link weights must share units to be compared, but they use ${listNames(units.map((unit) => (unit === '' ? '(no units)' : `"${unit}"`)))}.`));
			}
		}
		return problems;
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

	/** C02: percentage and diverging stacks. */
	stack_presentation(ctx) {
		const { config, payload } = ctx;
		if (config.stack_mode !== 'percent' && config.stack_mode !== 'diverging') {
			return [];
		}
		const series = roleSeries(ctx);
		const problems = [];
		const negative = series.filter((entry) => typeof entry.value === 'number' && entry.value < 0);
		if (negative.length > 0) {
			problems.push(error('negative_values', `${config.stack_mode === 'percent' ? 'Shares' : 'Diverging bars'} need values of zero or more: ${listNames(negative.map(seriesLabel))}.`));
		}
		const units = unitGroups(series);
		if (units.length === 1 && !isAdditive(units[0])) {
			problems.push(error('non_additive', `Values in "${units[0]}" cannot be added up, so they cannot be stacked into ${config.stack_mode === 'percent' ? 'shares of a total' : 'totals'}. Use stacked values or another chart.`));
		}
		if (config.stack_mode === 'diverging') {
			const both = series.filter((entry) => entry.role === 'value' && series.some((other) => other.role === 'opposing' && other.itemid === entry.itemid));
			if (both.length > 0) {
				problems.push(error('shared_item', `These items match both the item and the opposing item patterns: ${listNames(both.map(seriesLabel))}. Make the patterns more specific.`));
			}
		}
		if (config.stack_mode === 'percent' && problems.length === 0) {
			const incomplete = incompleteCategories(payload);
			if (incomplete.length > 0) {
				problems.push(warning('incomplete_categories',
					`These categories have members without a value, so their shares are not drawn: ${listNames(incomplete.map((category) => category.label))}.`));
			}
		}
		return problems;
	},

	/** C28: bar buckets, aggregation and axes. */
	mixed_settings(ctx) {
		const { config, payload } = ctx;
		const bars = roleSeries(ctx, ['bar']);
		const lines = roleSeries(ctx, ['line']);
		const problems = [];
		const aggregation = config.aggregation ?? 'avg';
		const units = [...new Set([
			...bars.map((entry) => displayUnits(barUnits(entry, aggregation))),
			...lines.map((entry) => displayUnits(entry.units))
		])];
		if (units.length > 2) {
			problems.push(error('too_many_units',
				`${ctx.chart.name} draws at most two units, one per Y-axis, but the series use ${listNames(units.map((unit) => (unit === '' ? '(no units)' : `"${unit}"`)))}.`));
		}
		if (bars.length === 0) {
			return problems;
		}
		const bucket = parseBucket(config.bucket);
		if (bucket === null) {
			return [...problems, error('invalid_bucket', 'The bar period must look like 15m, 1h or 1d.')];
		}
		problems.push(...tooManyBuckets(ctx, 'bars'));
		if (payload.historySource === 'mixed' && bucket % 3600 !== 0) {
			problems.push(error('trend_buckets',
				'Periods longer than two days are read from hourly trends, so each bar must cover whole hours. Choose a bar period such as 1h or 1d.'));
		}
		if (payload.historySource === 'mixed' && bucket % 86400 === 0 && payload.timePeriod !== null) {
			const zone = config.time_zone || 'UTC';
			const offsets = [payload.timePeriod.from, payload.timePeriod.to].map((clock) => zoneOffset(clock, zone));
			if (offsets.some((offset) => offset % 3600 !== 0)) {
				problems.push(warning('trend_days',
					'Hourly trends do not start at local midnight in this time zone, so up to half an hour of samples may fall in the neighbouring day\'s bar.'));
			}
		}
		if (aggregation === 'sum') {
			const nonAdditive = [...new Set(bars.map((entry) => displayUnits(entry.units)).filter((unit) => !isAdditive(unit)))];
			if (nonAdditive.length > 0) {
				problems.push(error('non_additive', `Values in ${listNames(nonAdditive.map((unit) => `"${unit}"`))} cannot be added up. Use the average, minimum or maximum for the bars.`));
			}
			const rates = bars.filter((entry) => /(ps|\/s)$/i.test(displayUnits(entry.units)));
			if (rates.length > 0) {
				problems.push(warning('summed_rates',
					`Adding up samples of a rate does not give a volume: ${listNames(rates.map(seriesLabel))}. The bars show the sum of the samples taken.`));
			}
		}
		return problems;
	},

	/** C29: bins, and enough samples to describe a distribution. */
	distribution_settings(ctx) {
		const problems = [];
		const bins = Number(ctx.config.hist_bins) || 0;
		if (bins < 0 || bins > MAX_BINS) {
			problems.push(error('invalid_bins', `The number of bins must be between 1 and ${MAX_BINS}, or 0 for automatic.`));
		}
		if (ctx.payload.historySource === 'mixed') {
			problems.push(error('trends_not_allowed', 'Distributions need every raw sample; hourly trends cannot give quartiles, outliers or bins.'));
		}
		const few = roleSeries(ctx).filter((entry) => entry.history.length > 0 && entry.history.length < 5);
		if (few.length > 0) {
			problems.push(warning('few_samples', `Fewer than five samples in the period for ${listNames(few.map(seriesLabel))}; their quartiles say little.`));
		}
		return problems;
	},

	/** C30: the axes and one complete set of values per line. */
	parallel_axes(ctx) {
		const { axes, errors } = parseAxes(ctx.config.parallel_axes);
		if (errors.length > 0) {
			return errors.map((line) => error('invalid_axes', `Line ${line.line} of the axes is not valid: ${line.reason}.`));
		}
		if (axes.length < 2) {
			return [error('invalid_axes', 'Parallel Coordinates needs at least two axes, one per line: "Label = item name pattern".')];
		}
		const model = parallelModel(roleSeries(ctx), ctx.config);
		const problems = [];
		if (model.mixedUnits.length > 0) {
			problems.push(error('mixed_units', `Every item on an axis needs the same units. They differ on ${listNames(model.mixedUnits.map((heading) => `"${heading}"`))}.`));
		}
		if (model.ambiguous.length > 0) {
			const detail = model.ambiguous.map((entry) => `${entry.label} (${entry.axes.join(', ')})`);
			problems.push(error('ambiguous_axes', `More than one item matches the same axis for ${listNames(detail)}. Narrow the axis pattern or pair by tag.`));
		}
		if (model.untagged.length > 0) {
			problems.push(error('untagged_items', `These items have no "${ctx.config.pair_tag}" tag to pair them by: ${listNames(model.untagged.map(seriesLabel))}.`));
		}
		if (model.incomplete.length > 0) {
			const detail = model.incomplete.map((entry) => `${entry.label} (no ${entry.axes.join(', ')})`);
			problems.push((model.entities.length === 0 ? error : warning)('incomplete_lines',
				`These lines have no value on every axis and are not drawn: ${listNames(detail)}.`));
		}
		if (model.unused.length > 0) {
			problems.push(warning('unused_items', `These items match no axis and are not shown: ${listNames(model.unused.map(seriesLabel))}.`));
		}
		if (model.entities.length === 0 && problems.every((problem) => problem.level !== 'error')) {
			problems.push(error('no_lines', 'No host or tag value has an item on every axis.'));
		}
		return problems;
	},

	/** C31: additive flows that form no loop. */
	sankey_flows(ctx) {
		const units = unitGroups(roleSeries(ctx));
		const problems = [];
		if (units.length === 1 && !isAdditive(units[0])) {
			problems.push(error('non_additive', `Flows in "${units[0]}" cannot be added up, so they cannot be drawn as a Sankey diagram.`));
		}
		const { flows } = sankeyFlows(ctx.payload);
		const cycle = findCycle(flows);
		if (cycle.length > 0) {
			problems.push(error('flow_cycle', `The flows form a loop (${cycle.join(' → ')}), which a Sankey diagram cannot draw. Use the Chord / Relationship Diagram for flows in both directions.`));
		}
		if (flows.length === 0 && problems.length === 0) {
			problems.push(error('no_flows', 'No flow between two different endpoints has a value.'));
		}
		return problems;
	},

	/** C32: every site needs coordinates from its inventory. */
	geo_sites(ctx) {
		const { payload } = ctx;
		const hosts = payload.hosts;
		const placed = hosts.filter((host) => host.location?.valid);
		const empty = hosts.filter((host) => !host.location || (host.location.latText === '' && host.location.lonText === ''));
		const invalid = hosts.filter((host) => host.location && !host.location.valid && !(host.location.latText === '' && host.location.lonText === ''));
		const problems = [];
		if (invalid.length > 0) {
			problems.push((placed.length === 0 ? error : warning)('invalid_location',
				`These hosts have inventory coordinates that are not a latitude from -90 to 90 and a longitude from -180 to 180, and are not drawn: ${listNames(invalid.map((host) => host.name))}.`));
		}
		if (empty.length > 0) {
			problems.push((placed.length === 0 && invalid.length === 0 ? error : warning)('no_location',
				`These hosts have no latitude and longitude in their inventory and are not drawn: ${listNames(empty.map((host) => host.name))}.`));
		}
		return problems;
	},

	/** C32: links, colours and the map file. */
	geo_settings(ctx) {
		const { config, payload } = ctx;
		const problems = [];
		const { edges, errors } = parseEdgeList(config.geo_links);
		problems.push(...errors.map((entry) => error('invalid_edge', `Line ${entry.line} of the links is not in the form "site -> site".`)));
		const { resolved, unresolved } = resolveEdges(edges, payload.hosts);
		if (unresolved.length > 0) {
			problems.push(error('unknown_hosts', `These link endpoints are not among the selected hosts: ${listNames(unresolved.flatMap((edge) => edge.missing))}.`));
		}
		const unplaced = resolved.filter((edge) => [edge.sourceId, edge.targetId].some((hostid) => !payload.hosts.find((host) => host.hostid === hostid)?.location?.valid));
		if (unplaced.length > 0) {
			problems.push(warning('unplaced_links', `These links join a host without coordinates and are not drawn: ${listNames(unplaced.map((edge) => `${edge.source} -> ${edge.target}`))}.`));
		}
		const values = roleSeries(ctx);
		const missingItems = resolved.filter((edge) => edgeWeight(edge, values).error === 'missing_item');
		if (missingItems.length > 0) {
			problems.push(error('missing_weight_item',
				`No item with the weight key was found on the source host for ${listNames(missingItems.map((edge) => `${edge.source} -> ${edge.target} (${edge.weight.key})`))}. The item must also match the item pattern.`));
		}
		if (config.site_colour === 'thresholds') {
			const found = new Map();
			const several = [];
			for (const host of payload.hosts.filter((entry) => entry.location?.valid)) {
				const scale = resolveScale({ thresholds: config.thresholds }, host);
				for (const message of scale.errors) {
					found.set(message, error('invalid_thresholds', `${capitalise(message)}.`));
				}
				if (scale.errors.length === 0 && scale.thresholds.length === 0) {
					found.set('none', error('no_thresholds', 'Colouring sites by thresholds requires at least one threshold (numbers or user macros, separated by commas).'));
				}
				if (values.filter((entry) => entry.hostid === host.hostid).length > 1) {
					several.push(host.name);
				}
			}
			problems.push(...found.values());
			if (several.length > 0) {
				problems.push(error('ambiguous_site_value', `Thresholds colour a site by one item, but several items match on ${listNames(several)}. Narrow the item pattern.`));
			}
		}
		return problems;
	},

	/** C33: steps that each match one item with a value, in one additive unit. */
	waterfall_steps(ctx) {
		const series = roleSeries(ctx);
		const model = waterfallModel(series, ctx.config.waterfall_steps);
		const problems = model.errors.map((line) => error('invalid_steps',
			`Line ${line.line} of the steps is not in the form "+ Label = item name pattern", "- Label = pattern", "= Label = pattern" or "= Label".`));
		if (model.steps.length === 0 && model.errors.length === 0) {
			problems.push(error('invalid_steps', 'Waterfall requires steps, one per line, such as "= Opening = Balance at start" and "+ Income = Revenue *".'));
		}
		if (model.steps.length > 0 && model.steps.every((step) => step.kind === 'total')) {
			problems.push(error('invalid_steps', 'Waterfall requires at least one step that reads an item.'));
		}
		if (model.missing.length > 0) {
			problems.push(error('missing_step', `No item matches the step ${listNames(model.missing.map((label) => `"${label}"`))}.`));
		}
		if (model.ambiguous.length > 0) {
			problems.push(error('ambiguous_step',
				`Each step needs exactly one item, but ${listNames(model.ambiguous.map((step) => `"${step.label}" matches ${step.items.length}`))}. Narrow the step pattern or select one host.`));
		}
		if (model.withoutValue.length > 0) {
			problems.push(error('missing_step', `No recent value for the step ${listNames(model.withoutValue.map((label) => `"${label}"`))}, so the totals after it cannot be worked out.`));
		}
		const used = model.steps.filter((step) => step.entry !== null).map((step) => step.entry);
		const units = unitGroups(used);
		if (units.length > 1) {
			problems.push(error('mixed_units', `Every step needs the same units, but they use ${listNames(units.map((unit) => (unit === '' ? '(no units)' : `"${unit}"`)))}.`));
		}
		else if (units.length === 1 && !isAdditive(units[0])) {
			problems.push(error('non_additive', `Values in "${units[0]}" cannot be added up, so they cannot make a waterfall.`));
		}
		for (const mismatch of model.mismatches) {
			problems.push(warning('steps_do_not_add_up',
				`The steps before "${mismatch.label}" add up to ${mismatch.expected}, but it measures ${mismatch.actual}. Something between them is not listed.`));
		}
		if (model.unused.length > 0) {
			problems.push(warning('unused_items', `These items match no step and are not shown: ${listNames(model.unused.map(seriesLabel))}.`));
		}
		return problems;
	},

	/** C03, C15: the inner radius must leave a ring inside the outer one. */
	pie_geometry(ctx) {
		const inner = Number(ctx.config.inner_radius) || 0;
		const outer = Number(ctx.config.outer_radius) || 0;
		return inner > 0 && outer > 0 && inner >= outer
			? [error('invalid_radius', 'The inner radius must be smaller than the outer radius.')]
			: [];
	},

	bullet_ranges(ctx) {
		const { error: problem } = parseRanges(ctx.config.ranges);
		return problem === null ? [] : [error('invalid_ranges', problem)];
	},

	table_rows(ctx) {
		const { errors: lines } = parseDefinitions(ctx.config.table_columns);
		if (lines.length > 0) {
			return [error('invalid_columns',
				`Line ${lines[0].line} of the column list is not in the form "Heading = item name pattern".`)];
		}
		const table = buildTable(ctx.payload);
		if (table.error !== null) {
			return [error('invalid_row_expression', table.error)];
		}
		const problems = [];
		if (table.collisions.length > 0) {
			const detail = table.collisions.map(({ row, column }) => `${row.host} / ${row.label} / ${column}`);
			problems.push(error('ambiguous_cells',
				`More than one item falls in the same cell: ${listNames(detail)}. Choose a more specific row identity or narrower column patterns.`));
		}
		if (table.unresolved.length > 0) {
			const why = {
				key: 'have no key parameter',
				name: 'have no text where the column pattern has "*"',
				tag: `have no "${String(ctx.config.row_tag ?? '').trim()}" tag`,
				regex: 'do not match the row expression'
			}[ctx.config.row_identity] ?? 'have no row identity';
			problems.push((table.rows.length === 0 ? error : warning)('unresolved_rows',
				`These items ${why} and are not shown: ${listNames(table.unresolved.map(seriesLabel))}.`));
		}
		if (table.unmatched.length > 0) {
			problems.push((table.rows.length === 0 && table.unresolved.length === 0 ? error : warning)('unmatched_columns',
				`These items match no column pattern and are not shown: ${listNames(table.unmatched.map(seriesLabel))}.`));
		}
		return problems;
	},

	additive_groups(ctx) {
		if (ctx.config.entity_by !== 'host') {
			return [];
		}
		const series = roleSeries(ctx).filter((entry) => typeof entry.value === 'number');
		const perHost = new Map();
		for (const entry of series) {
			perHost.set(entry.hostid, [...(perHost.get(entry.hostid) ?? []), entry]);
		}
		const summed = [...perHost.values()].filter((items) => items.length > 1);
		const units = [...new Set(summed.flat().map((entry) => displayUnits(entry.units)).filter((unit) => !isAdditive(unit)))];
		return summed.length > 0 && units.length > 0 ? [error('non_additive',
			`Values in ${listNames(units.map((unit) => `"${unit}"`))} cannot be added up into host totals. Show each item instead, or select one item per host.`)] : [];
	},

	gauge_scale(ctx) {
		const hosts = new Map(ctx.payload.hosts.map((host) => [host.hostid, host]));
		const problems = [];
		const seen = new Set();
		for (const entry of roleSeries(ctx)) {
			const host = hosts.get(entry.hostid) ?? null;
			const scale = resolveScale(ctx.config, host);
			const messages = [...scale.errors];
			// Settings that did not resolve are already reported; the scale itself can only be checked once they do.
			if (messages.length === 0 && (scale.min === null || scale.max === null)) {
				messages.push('set both a minimum and a maximum (numbers or user macros)');
			}
			else if (messages.length === 0 && scale.min >= scale.max) {
				messages.push('the minimum must be lower than the maximum');
			}
			for (const message of messages) {
				const text = `${ctx.chart.name}: ${message}.`;
				if (!seen.has(text)) {
					seen.add(text);
					problems.push(error('invalid_scale', text));
				}
			}
		}
		return problems;
	},

	shared_thresholds(ctx) {
		const hostids = new Set(roleSeries(ctx).map((entry) => entry.hostid));
		const { errors } = sharedScale({ thresholds: ctx.config.thresholds }, ctx.payload.hosts.filter((host) => hostids.has(host.hostid)));
		return errors.map((message) => error('invalid_thresholds', `${capitalise(message)}.`));
	},

	size_units(ctx) {
		return RULES.same_units({ ...ctx, payload: { ...ctx.payload, series: ctx.payload.series.filter((entry) => entry.role === 'size') } });
	},

	hierarchy_levels(ctx) {
		const { levels, error: problem } = parseLevels(ctx.config.levels);
		if (problem !== null) {
			return [error('invalid_levels', problem)];
		}
		if (levels.some((level) => level.type === 'path') && String(ctx.config.path_delimiter ?? '') === '') {
			return [error('invalid_levels', 'The "path" level needs a path delimiter to split item names.')];
		}
		const sized = roleSeries(ctx, [ctx.chart.roles.size ? 'size' : 'value']);
		const { duplicated } = buildLevelTree(sized, ctx.payload.hosts, levels, { delimiter: String(ctx.config.path_delimiter ?? '') });
		return duplicated.length === 0 ? [] : [warning('duplicated_leaves',
			`These items appear in more than one place (for example, hosts in several host groups), so totals above them count them more than once: ${listNames(duplicated.map(seriesLabel))}.`)];
	},

	positive_sizes(ctx) {
		const sized = roleSeries(ctx, [ctx.chart.roles.size ? 'size' : 'value']).filter((entry) => typeof entry.value === 'number');
		const negative = sized.filter((entry) => entry.value < 0);
		const zero = sized.filter((entry) => entry.value === 0);
		const problems = [];
		if (negative.length > 0) {
			problems.push(error('negative_values', `${ctx.chart.name} areas cannot be negative: ${listNames(negative.map(seriesLabel))}.`));
		}
		if (zero.length > 0) {
			problems.push((zero.length === sized.length ? error : warning)('zero_values',
				`These items are zero and take no space: ${listNames(zero.map(seriesLabel))}.`));
		}
		return problems;
	},

	colour_pairs(ctx) {
		const { missing, ambiguous, used } = pairColours(ctx.payload);
		if (!used) {
			return [];
		}
		const by = ctx.config.pair_by === 'tag' ? `host and "${ctx.config.pair_tag}" tag` : 'host';
		const problems = [];
		if (ambiguous.length > 0) {
			problems.push(error('ambiguous_colour',
				`More than one colour item matches the same ${by} for ${listNames(ambiguous.map(seriesLabel))}. Narrow the colour item pattern.`));
		}
		if (missing.length > 0) {
			problems.push(warning('missing_colour', `No colour item for ${listNames(missing.map(seriesLabel))}; shown in a neutral colour.`));
		}
		return problems;
	},

	funnel_stages(ctx) {
		const { missing, ambiguous, unused, errors: lines, defined, stages } = funnelStages(roleSeries(ctx), ctx.config.stages);
		const problems = lines.map((line) => error('invalid_stages', `Line ${line.line} of the stage list is not in the form "Stage = item name pattern".`));
		if (defined < 2 && lines.length === 0) {
			problems.push(error('invalid_stages', 'Funnel requires at least two stages, one per line: "Stage = item name pattern".'));
		}
		if (missing.length > 0) {
			problems.push(error('missing_stage', `No item matches the stage ${listNames(missing.map((label) => `"${label}"`))}.`));
		}
		if (ambiguous.length > 0) {
			problems.push(error('ambiguous_stage',
				`Each stage needs exactly one item, but ${listNames(ambiguous.map((stage) => `"${stage.label}" matches ${stage.items.length}`))}. Narrow the stage pattern or select one host.`));
		}
		const withoutValue = stages.filter((stage) => typeof stage.entry.value !== 'number');
		if (withoutValue.length > 0) {
			problems.push(error('missing_stage', `No recent value for the stage ${listNames(withoutValue.map((stage) => `"${stage.label}"`))}.`));
		}
		if (unused.length > 0) {
			problems.push(warning('unused_items', `These items match no stage and are not shown: ${listNames(unused.map(seriesLabel))}.`));
		}
		return problems;
	},

	some_history(ctx) {
		const series = roleSeries(ctx);
		const empty = series.filter((entry) => entry.history.length === 0);
		if (series.length > 0 && empty.length === series.length) {
			return [error('no_history', 'No history in the selected time period for any of the selected items.')];
		}
		return empty.length === 0 ? [] : [warning('no_history',
			`No history in the selected time period for ${listNames(empty.map(seriesLabel))}; shown in the legend only.`)];
	},

	temporal_units(ctx) {
		const units = unitGroups(roleSeries(ctx));
		return units.length <= 2 ? [] : [error('too_many_units',
			`${ctx.chart.name} draws at most two units, one per Y-axis, but the items use ${listNames(units.map((unit) => `"${unit}"`))}. Select items with at most two units.`)];
	},

	temporal_settings(ctx) {
		const problems = [];
		const gap = parseGap(ctx.config.max_gap);
		if (gap.error !== null) {
			problems.push(error('invalid_gap', gap.error));
		}
		const { scale, errors } = temporalScale(ctx);
		problems.push(...errors.map((message) => error('invalid_scale', `${capitalise(message.replace(/^Minimum/, 'Y-axis minimum').replace(/^Maximum/, 'Y-axis maximum'))}.`)));
		if (errors.length === 0 && scale.min !== null && scale.max !== null && scale.min >= scale.max) {
			problems.push(error('invalid_scale', 'Y-axis minimum must be lower than the maximum.'));
		}
		return problems;
	},

	stack_units(ctx) {
		if (ctx.config.area_mode !== 'stacked') {
			return [];
		}
		const units = unitGroups(roleSeries(ctx));
		if (units.length > 1) {
			return [error('mixed_units', `Stacked areas add values up, so all items need the same units, but they use ${listNames(units.map((unit) => `"${unit}"`))}. Use overlapping areas instead.`)];
		}
		return units.length === 1 && !isAdditive(units[0]) && roleSeries(ctx).length > 1 ? [error('non_additive',
			`Values in "${units[0]}" cannot be added up, so they cannot be stacked. Use overlapping areas instead.`)] : [];
	},

	has_thresholds(ctx) {
		const { scale, errors } = temporalScale(ctx);
		return errors.length === 0 && scale.thresholds.length === 0 ? [error('no_thresholds',
			`${ctx.chart.name} requires at least one threshold (numbers or user macros, separated by commas).`)] : [];
	},

	state_settings(ctx) {
		const problems = colourMapErrors(ctx.config.colour_map);
		const gap = parseGap(ctx.config.max_gap);
		if (gap.error !== null) {
			problems.push(error('invalid_gap', gap.error));
		}
		return problems;
	},

	matrix_settings(ctx) {
		const { colour_by: by } = ctx.config;
		if (by === 'value_map') {
			const problems = colourMapErrors(ctx.config.colour_map);
			if (problems.length === 0 && parseColourMap(ctx.config.colour_map).entries.size === 0) {
				problems.push(warning('no_colours', 'No value colours are set, so every cell stays neutral. Add lines such as "up = #2e7d32".'));
			}
			return problems;
		}
		if (by !== 'thresholds') {
			return [];
		}
		const hosts = new Map(ctx.payload.hosts.map((host) => [host.hostid, host]));
		const problems = new Map();
		for (const entry of roleSeries(ctx)) {
			const scale = resolveScale({ thresholds: ctx.config.thresholds }, hosts.get(entry.hostid) ?? null);
			for (const message of scale.errors) {
				problems.set(message, error('invalid_thresholds', `${message}.`));
			}
			if (scale.errors.length === 0 && scale.thresholds.length === 0) {
				problems.set('none', error('no_thresholds', 'Colouring by thresholds requires at least one threshold (numbers or user macros, separated by commas).'));
			}
		}
		const text = roleSeries(ctx).filter((entry) => !entry.numeric);
		const list = [...problems.values()];
		if (text.length > 0) {
			list.push(warning('text_values', `Thresholds apply to numbers only; these items stay neutral: ${listNames(text.map(seriesLabel))}.`));
		}
		return list;
	},

	heat_axes(ctx) {
		const { heat_x: x, heat_y: y } = ctx.config;
		if (x === y) {
			return [error('invalid_axes', 'Heat Map needs different X and Y axes: choose hosts against items, or time against hosts or items.')];
		}
		if (x !== 'time') {
			return [];
		}
		return parseBucket(ctx.config.bucket) === null
			? [error('invalid_bucket', 'Time buckets must look like 15m, 1h or 1d.')]
			: tooManyBuckets(ctx, 'buckets');
	},

	/**
	 * C27: every item must belong to exactly one port and role. Ambiguity is
	 * an error naming the port, role and items; it is never resolved by
	 * picking one of them.
	 */
	port_mapping(ctx) {
		const series = roleSeries(ctx);
		if (series.length === 0) {
			return [error('no_port_items',
				'No interface items were found. Enter an item pattern for at least one port role, for example operational status.')];
		}
		const panel = buildPanel(ctx.payload);
		if (panel.error !== null) {
			return [error('invalid_port_identity', panel.error)];
		}
		const problems = [];
		const itemText = (entry) => `${seriesLabel(entry)} (item ${entry.itemid})`;
		if (panel.shared.length > 0) {
			const detail = panel.shared.map(({ item, roles }) => `${itemText(item)} as ${listNames(roles.map((role) => PORT_ROLE_LABELS[role] ?? role))}`);
			problems.push(error('shared_port_item',
				`One item cannot fill several port roles: ${listNames(detail)}. Make the role patterns more specific.`));
		}
		if (panel.ambiguous.length > 0) {
			const detail = panel.ambiguous.map(({ host, identity, role, items }) =>
				`${host} / ${identity} / ${PORT_ROLE_LABELS[role] ?? role}: ${items.map((entry) => `${entry.name} (item ${entry.itemid})`).join(', ')}`);
			problems.push(error('ambiguous_port',
				`More than one item matches the same port and role: ${listNames(detail, 2)}. Make the role pattern or the port identity more specific.`));
		}
		if (panel.badNumbers.length > 0) {
			problems.push(error('invalid_port_number',
				`The port number capture group must hold a whole number, but not for: ${listNames(panel.badNumbers.map(seriesLabel))}.`));
		}
		if (panel.unresolved.length > 0) {
			const why = {
				tag: `have no "${String(ctx.config.port_tag ?? '').trim()}" tag`,
				key: 'have no key parameter',
				regex: 'do not match the port expression'
			}[ctx.config.port_identity ?? 'tag'] ?? 'have no port identity';
			problems.push((panel.ports.length === 0 ? error : warning)('unresolved_ports',
				`These items ${why} and are not shown: ${listNames(panel.unresolved.map(seriesLabel))}.`));
		}
		for (const section of panel.sections) {
			for (const group of section.groups) {
				if (group.layout.duplicates.length > 0) {
					const where = [section.host, section.member === null ? null : `member ${section.member}`, group.name || null].filter(Boolean).join(' / ');
					problems.push(warning('duplicate_port_numbers',
						`Port number${group.layout.duplicates.length === 1 ? '' : 's'} ${listNames(group.layout.duplicates.map(String))} appear${group.layout.duplicates.length === 1 ? 's' : ''} more than once on ${where}, so its ports are placed in name order. Capture the stack member as well as the port number.`));
				}
			}
		}
		return problems;
	},

	/** C27: the panel's own settings (type and group rules, colours, labels, thresholds). */
	port_settings(ctx) {
		const { config } = ctx;
		const problems = [];
		const panel = buildPanel(ctx.payload);
		for (const rule of panel.typeErrors) {
			problems.push(error('invalid_port_types', rule.line === null
				? `${capitalise(rule.reason)}.`
				: `Line ${rule.line} of the interface types is not valid: ${rule.reason}.`));
		}
		for (const rule of panel.groupErrors) {
			problems.push(error('invalid_port_groups', `Line ${rule.line} of the port groups is not valid: ${rule.reason}.`));
		}
		if (config.port_fill === 'neg_speed' || config.port_fill === 'cfg_speed') {
			for (const line of speedPalette(config.speed_colours).errors) {
				problems.push(error('invalid_speed_colours', `Line ${line.line} of the speed colours is not in the form "1G = #rrggbb".`));
			}
		}
		problems.push(...parseColourMap(config.state_colours).errors.map((line) => error('invalid_colours',
			`Line ${line.line} of the status colours is not in the form "value = #rrggbb".`)));
		if (config.port_fill === 'fixed' && !isHexColour(config.port_fixed_colour)) {
			problems.push(error('invalid_fixed_colour', 'The port colour must be a colour such as #2e7d32.'));
		}
		if (config.port_label === 'regex') {
			const { error: message } = compileCapture(config.port_label_regex, 'label expression', []);
			if (message !== null) {
				problems.push(error('invalid_label_regex', message));
			}
		}
		const stale = parseStale(config.stale_after);
		if (stale.error !== null) {
			problems.push(error('invalid_stale', stale.error));
		}
		if (config.port_fill === 'thresholds') {
			const hosts = new Map(ctx.payload.hosts.map((host) => [host.hostid, host]));
			const found = new Map();
			for (const hostid of new Set(panel.ports.map((port) => port.hostid))) {
				const scale = resolveScale({ thresholds: config.thresholds }, hosts.get(hostid) ?? null);
				for (const message of scale.errors) {
					found.set(message, error('invalid_thresholds', `${message}.`));
				}
				if (scale.errors.length === 0 && scale.thresholds.length === 0) {
					found.set('none', error('no_thresholds', 'Colouring ports by thresholds requires at least one threshold (numbers or user macros, separated by commas).'));
				}
			}
			problems.push(...found.values());
		}
		return problems;
	}
};
