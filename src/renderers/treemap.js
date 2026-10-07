/**
 * C18 Treemap: item values as nested rectangles whose area is the value.
 * The hierarchy comes from the configured levels (data/levels.js); nothing
 * is grouped by name similarity or invented. An optional colour item, paired
 * with each sized item by host (or host and tag value), colours the tiles on
 * a continuous scale; tiles without one stay neutral.
 */
import { baseOption } from './common.js';
import { buildLevelTree, parseLevels } from '../data/levels.js';
import { tagValue } from '../data/normalise.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const RAMP = { light: ['#e8f1f8', '#0072B2', '#08306b'], dark: ['#1d3b53', '#56B4E9', '#F0E442'] };

function hexToRgb(hex) {
	const value = parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Colour at a position from 0 to 1 along a three-stop ramp. */
export function rampColour(stops, position) {
	const clamped = Math.min(1, Math.max(0, position));
	const scaled = clamped * (stops.length - 1);
	const index = Math.min(stops.length - 2, Math.floor(scaled));
	const [from, to] = [hexToRgb(stops[index]), hexToRgb(stops[index + 1])];
	const mix = from.map((channel, i) => Math.round(channel + (to[i] - channel) * (scaled - index)));
	return `rgb(${mix.join(', ')})`;
}

function pairKey(entry, config) {
	if (config.pair_by === 'tag') {
		const value = tagValue(entry.tags, String(config.pair_tag ?? '').trim());
		return value === null ? null : `${entry.hostid}\u0000${value}`;
	}
	return entry.hostid;
}

/**
 * Colour item for each sized item. Returns { colourOf: Map(itemid -> entry), missing, ambiguous }.
 */
export function pairColours(payload) {
	const { config } = payload;
	const colours = payload.series.filter((entry) => entry.role === 'colour');
	const byKey = new Map();
	for (const entry of colours) {
		const key = pairKey(entry, config);
		if (key !== null) {
			byKey.set(key, [...(byKey.get(key) ?? []), entry]);
		}
	}
	const colourOf = new Map();
	const missing = [];
	const ambiguous = [];
	if (colours.length === 0) {
		return { colourOf, missing, ambiguous, used: false };
	}
	for (const entry of payload.series.filter((item) => item.role === 'size')) {
		const matches = byKey.get(pairKey(entry, config)) ?? [];
		if (matches.length === 1) {
			colourOf.set(entry.itemid, matches[0]);
		}
		else if (matches.length > 1) {
			ambiguous.push(entry);
		}
		else {
			missing.push(entry);
		}
	}
	return { colourOf, missing, ambiguous, used: true };
}

export function treemapData(payload) {
	const { config } = payload;
	const sized = payload.series.filter((entry) => entry.role === 'size' && typeof entry.value === 'number' && entry.value > 0);
	const { levels } = parseLevels(config.levels);
	const { root } = buildLevelTree(sized, payload.hosts, levels, { delimiter: String(config.path_delimiter ?? '') });
	const { colourOf, used } = pairColours(payload);
	const colourValues = [...colourOf.values()].map((entry) => entry.value).filter((value) => typeof value === 'number');
	const low = colourValues.length ? Math.min(...colourValues) : 0;
	const high = colourValues.length ? Math.max(...colourValues) : 0;

	const convert = (node, path) => {
		const here = node.name === '' ? path : [...path, node.name];
		if (!node.children) {
			const colour = colourOf.get(node.entry.itemid) ?? null;
			return {
				name: node.name,
				value: node.value,
				path: here,
				entry: node.entry,
				colourEntry: colour,
				colourPosition: colour !== null && typeof colour.value === 'number' ? (high === low ? 0.5 : (colour.value - low) / (high - low)) : null
			};
		}
		return { name: node.name, path: here, children: node.children.map((child) => convert(child, here)) };
	};

	return { nodes: root.children.map((child) => convert(child, [])), colours: used ? { low, high, units: [...colourOf.values()][0]?.units ?? '' } : null };
}

export function buildTreemapOption(payload, context) {
	const { config } = payload;
	const { nodes, colours } = treemapData(payload);
	const ramp = RAMP[context.theme.mode] ?? RAMP.light;
	const units = payload.series.find((entry) => entry.role === 'size')?.units ?? '';
	const depth = Math.max(0, Number(config.max_depth) || 0);

	const decorate = (node) => (node.children
		? { ...node, children: node.children.map(decorate) }
		: {
			...node,
			itemStyle: colours === null ? undefined : {
				color: node.colourPosition === null ? context.theme.neutral : rampColour(ramp, node.colourPosition)
			},
			// Dark text on the light end of the ramp, light text on the dark end.
			label: colours === null ? undefined : {
				color: node.colourPosition !== null && (context.theme.mode === 'dark' ? node.colourPosition < 0.75 : node.colourPosition > 0.4)
					? '#ffffff' : '#1f2c33'
			}
		});

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const data = param.data ?? {};
				const path = (param.treePathInfo ?? []).map((step) => step.name).filter(Boolean);
				const lines = [`<b>${escapeHtml(path.join(' / '))}</b>`, `${escapeHtml(formatValue(param.value, units, context.decimals))}`];
				if (data.colourEntry) {
					lines.push(`${escapeHtml(data.colourEntry.name)}: ${escapeHtml(formatValue(data.colourEntry.value, data.colourEntry.units, context.decimals))}`);
				}
				return lines.join('<br>');
			}
		},
		graphic: colours === null ? [] : [{
			type: 'text',
			right: 8,
			bottom: 4,
			silent: true,
			style: {
				text: `Colour: ${formatValue(colours.low, colours.units, context.decimals)} – ${formatValue(colours.high, colours.units, context.decimals)}`,
				fill: context.theme.mutedText,
				font: '11px sans-serif'
			}
		}],
		series: [{
			type: 'treemap',
			name: 'All',
			data: nodes.map(decorate),
			roam: false,
			nodeClick: 'zoomToNode',
			leafDepth: depth > 0 ? depth : undefined,
			top: 8,
			left: 4,
			right: 4,
			bottom: colours === null ? 30 : 44,
			breadcrumb: {
				show: true,
				bottom: colours === null ? 4 : 18,
				itemStyle: { color: context.theme.splitLine, borderColor: context.theme.axisLine, textStyle: { color: context.theme.text } }
			},
			label: { show: true, formatter: (param) => `${param.name}\n${formatValue(param.value, units, context.decimals)}`, overflow: 'truncate' },
			upperLabel: { show: true, height: 18, color: context.theme.text },
			itemStyle: { borderColor: context.theme.tooltipBackground, borderWidth: 1, gapWidth: 1 },
			levels: [{ itemStyle: { borderWidth: 2, gapWidth: 2, borderColor: context.theme.axisLine } }],
			color: context.theme.palette
		}]
	};
}

export default {
	id: 'treemap',
	buildOption: buildTreemapOption
};
