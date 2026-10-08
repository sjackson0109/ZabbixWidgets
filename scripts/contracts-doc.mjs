/**
 * Generates docs/CHART-CONTRACTS.md from the chart registry so the document
 * cannot drift from the code. `--check` fails if the file is out of date.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const registry = JSON.parse(await readFile(path.join(root, 'modules/extended-charts/registry/charts.json'), 'utf8'));
const target = path.join(root, 'docs/CHART-CONTRACTS.md');

const RULE_TEXT = {
	numeric_only: 'Mapped items must be numeric (float or unsigned).',
	has_values: 'At least one item has a recent value; items without one are shown as no data, never zero.',
	same_units: 'All series share units; otherwise the widget reports the incompatible units.',
	non_negative: 'Values must not be negative.',
	non_negative_size: 'Bubble sizes must not be negative.',
	has_target: 'Every actual value has a target from an item, a macro or a constant. Targets are never derived from the actual value.',
	min_dimensions: 'At least `min_dimensions` distinct items act as axes.',
	radar_scale: 'Shared scale requires common units and a positive maximum; per-axis scale uses each axis\'s largest real value.',
	colour_bounds: 'Configured colour bounds are numbers with minimum below maximum.',
	has_history: 'Every mapped item has history in the period.',
	ohlc_consistent: 'The candle period is valid and yields at most 1000 candles; explicit OHLC candles satisfy low <= open, close <= high; periods missing a component are skipped and reported.',
	complete_tuples: 'Every pairing key (host or tag value) has exactly one item for each required role.',
	valid_intervals: 'Each task has a positive start and an end at or after it (or a non-negative duration); progress is a percentage from 0 to 100.',
	hierarchy_source: 'The hierarchy comes from host groups, named tags, or item names split by an explicit delimiter.',
	has_edges: 'Relationships come from an explicit list or a host tag naming the peer host. None are inferred.',
	edges_resolve: 'Every relationship endpoint is one of the selected hosts.',
	relationship_tags: 'Every item carries both the source and the target tag; flows from an endpoint to itself are reported and not drawn.',
	bullet_ranges: 'Qualitative ranges, when set, are ascending numbers.',
	heat_axes: 'X and Y are different dimensions; a time axis has a valid bucket size and yields at most 1000 buckets.',
	additive_groups: 'Host totals add up a host\'s items only for additive units; shares (%), timestamps, temperatures, levels and rotation rates are rejected.',
	gauge_scale: 'Minimum and maximum are set (numbers or user macros resolved per host) with minimum below maximum; target and thresholds, when set, are numbers or macros, thresholds ascending. Nothing is derived from the data.',
	shared_thresholds: 'Thresholds are numbers or macros that resolve to the same values on every selected host.',
	size_units: 'All sized items share units.',
	hierarchy_levels: 'Levels are group, host, tag:<name>, hosttag:<name> or path (last, with a delimiter). Items that appear more than once, such as hosts in several groups, are reported.',
	positive_sizes: 'Sizes are positive: negative values are rejected, zero values take no space and are reported.',
	colour_pairs: 'Each sized item has at most one colour item with the same host (or host and tag value); sized items without one are drawn neutral and reported.',
	funnel_stages: 'At least two stages, one per line ("Stage = item name pattern"), each matching exactly one item with a value. Order is as listed unless ordered by value.',
	some_history: 'At least one item has history in the period; items without any are listed and kept in the legend. Gaps are drawn as breaks, never bridged or filled with zero.',
	temporal_units: 'At most two distinct units, each on its own Y-axis.',
	temporal_settings: 'Maximum gap is empty (automatic: 2.5 update intervals, 2 hours for hourly trends), 0 (never break) or a duration. Axis limits, thresholds and target are numbers or macros that resolve to the same values on every selected host, with the minimum below the maximum.',
	stack_units: 'Stacked areas need one additive unit. Series are averaged into shared buckets and a bucket missing any series is left empty, so a stack never adds up a partial set.',
	has_thresholds: 'At least one threshold is set. Bands come only from configured thresholds, never from the data.',
	state_settings: 'Value colour lines read "value = #rrggbb"; maximum gap is valid. States last until the next sample, up to the gap threshold; unknown time is shown as no data.',
	matrix_settings: 'Cells are coloured only by the chosen source: value colours ("value = #rrggbb"), thresholds (numbers or macros per host, numeric items only) or the severity of the item\'s triggers in the problem state. Otherwise cells stay neutral.',
	table_rows: 'Column lines read "Heading = item name pattern". Each item goes in the first column whose pattern matches its whole name, and in the row of its host and row identity (the item itself, its first key parameter, the text the column pattern\'s "*" matched, an item tag, or the first capture group of a regular expression). Two items in one cell are an error; items without a column or an identity are reported and left out.'
};

const lines = [
	'# Chart contracts',
	'',
	'<!-- Generated by scripts/contracts-doc.mjs from modules/extended-charts/registry/charts.json. Do not edit by hand. -->',
	'',
	'A chart renders only when its contract is met. Otherwise the widget shows the reasons. No chart invents targets, OHLC values, timestamps, durations, topology, hierarchy or flow weights.',
	'',
	'Conditions such as `when:ohlc_mode=explicit` mean the requirement applies only for that setting.',
	'',
	'Every chart also needs items for each required role, no more than `Max items` per role, and at least `min_series` series in total.',
	''
];

for (const chart of registry.charts) {
	lines.push(`## ${chart.code} ${chart.name} (\`${chart.id}\`)`, '');
	lines.push('| Role | Form field | Required | Numeric | Max items |', '|---|---|---|---|---|');
	for (const [name, role] of Object.entries(chart.roles)) {
		lines.push(`| ${name} | \`${role.field}\` | ${role.required === true ? 'yes' : role.required === false ? 'no' : `\`${role.required}\``} | ${role.numeric ? 'yes' : 'no'} | ${role.max_items ?? ''} |`);
	}
	lines.push('');
	lines.push(`- **Data fetched:** ${chart.data.join(', ')}`);
	lines.push(`- **History:** \`${chart.history}\`; **time period:** \`${chart.time_period}\`; **min_series:** ${chart.min_series}`);
	if (chart.min_dimensions) {
		lines.push(`- **Minimum dimensions:** ${chart.min_dimensions}`);
	}
	lines.push(`- **Controls:** ${chart.controls.map((control) => `\`${control}\``).join(', ')}`);
	lines.push('- **Rules:**');
	for (const rule of chart.rules) {
		lines.push(`  - \`${rule}\`: ${RULE_TEXT[rule] ?? 'undocumented rule'}`);
	}
	lines.push('');
}

const retired = registry.retired ?? [];
if (retired.length > 0) {
	lines.push('## Removed charts', '');
	lines.push('These chart types were removed. Their form values stay reserved and are never reused; a widget saved with one says the chart was removed.', '');
	for (const chart of retired) {
		lines.push(`- ${chart.code} ${chart.name} (\`${chart.id}\`), form value ${chart.form_value}`);
	}
	lines.push('');
}

const text = `${lines.join('\n').trimEnd()}\n`;

if (process.argv.includes('--check')) {
	const current = await readFile(target, 'utf8').catch(() => '');
	if (current !== text) {
		console.error('docs/CHART-CONTRACTS.md is out of date. Run: npm run docs:contracts');
		process.exit(1);
	}
	console.log('docs/CHART-CONTRACTS.md is up to date.');
}
else {
	await writeFile(target, text);
	console.log('Wrote docs/CHART-CONTRACTS.md');
}
