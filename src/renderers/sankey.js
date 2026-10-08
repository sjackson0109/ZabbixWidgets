/**
 * C31 Sankey: directed flows between named endpoints. Each item carries a
 * source tag and a target tag naming its two endpoints, and its latest value
 * is the flow (data/relationships.js; several items for the same source and
 * target are added up, as for C12). Validation requires non-negative values,
 * one additive unit, and flows without cycles, since a Sankey diagram cannot
 * lay out a loop.
 *
 * Endpoints come only from tags on items the user can read. Nothing is
 * inferred from item or host names.
 */
import { baseOption } from './common.js';
import { buildRelationships } from '../data/relationships.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function sankeyFlows(payload) {
	const { config } = payload;
	const { flows } = buildRelationships(payload.series.filter((entry) => entry.role === 'weight'), {
		sourceTag: String(config.source_tag ?? '').trim(),
		targetTag: String(config.target_tag ?? '').trim()
	});
	const drawn = flows.filter((flow) => flow.source !== flow.target);
	return { flows: drawn, nodes: [...new Set(drawn.flatMap((flow) => [flow.source, flow.target]))].sort() };
}

/** Endpoints on a cycle (a -> b -> ... -> a), in the order found; empty when the flows form no loop. */
export function findCycle(flows) {
	const next = new Map();
	for (const flow of flows) {
		(next.get(flow.source) ?? next.set(flow.source, []).get(flow.source)).push(flow.target);
	}
	const state = new Map();
	const path = [];
	const visit = (node) => {
		state.set(node, 'open');
		path.push(node);
		for (const target of next.get(node) ?? []) {
			if (state.get(target) === 'open') {
				return [...path.slice(path.indexOf(target)), target];
			}
			if (!state.has(target)) {
				const found = visit(target);
				if (found.length > 0) {
					return found;
				}
			}
		}
		path.pop();
		state.set(node, 'done');
		return [];
	};
	for (const node of [...next.keys()].sort()) {
		if (!state.has(node)) {
			const found = visit(node);
			if (found.length > 0) {
				return found;
			}
		}
	}
	return [];
}

export function buildSankeyOption(payload, context) {
	const { config } = payload;
	const { theme } = context;
	const { flows, nodes } = sankeyFlows(payload);
	const units = payload.series.find((entry) => entry.role === 'weight')?.units ?? '';
	const format = (value) => formatValue(value, units, context.decimals);
	const vertical = config.sankey_orient === 'vertical';
	const outbound = new Map();
	const inbound = new Map();
	for (const flow of flows) {
		outbound.set(flow.source, (outbound.get(flow.source) ?? 0) + flow.weight);
		inbound.set(flow.target, (inbound.get(flow.target) ?? 0) + flow.weight);
	}

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.dataType === 'edge') {
					const flow = flows[param.dataIndex];
					const detail = flow.items.length > 1 ? `<br>${escapeHtml(`sum of ${flow.items.length} items`)}` : '';
					return `${escapeHtml(flow.source)} → ${escapeHtml(flow.target)}: <b>${escapeHtml(format(flow.weight))}</b>${detail}`;
				}
				const name = nodes[param.dataIndex];
				const lines = [`<b>${escapeHtml(name)}</b>`];
				if (inbound.has(name)) {
					lines.push(`In: ${escapeHtml(format(inbound.get(name)))}`);
				}
				if (outbound.has(name)) {
					lines.push(`Out: ${escapeHtml(format(outbound.get(name)))}`);
				}
				return lines.join('<br>');
			}
		},
		series: [{
			type: 'sankey',
			orient: vertical ? 'vertical' : 'horizontal',
			nodeAlign: config.sankey_align === 'left' || config.sankey_align === 'right' ? config.sankey_align : 'justify',
			left: vertical ? 24 : 16,
			right: vertical ? 24 : 120,
			top: vertical ? 24 : 16,
			bottom: vertical ? 48 : 16,
			nodeGap: 10,
			draggable: false,
			emphasis: { focus: 'adjacency' },
			label: {
				color: theme.text,
				position: vertical ? 'bottom' : 'right',
				formatter: (param) => (config.show_value === false ? param.name : `${param.name}\n${format(Math.max(inbound.get(param.name) ?? 0, outbound.get(param.name) ?? 0))}`)
			},
			lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
			itemStyle: { borderWidth: 0 },
			data: nodes.map((name, index) => ({ name, itemStyle: { color: theme.palette[index % theme.palette.length] } })),
			links: flows.map((flow) => ({ source: flow.source, target: flow.target, value: flow.weight }))
		}]
	};
}

export default {
	id: 'sankey',
	buildOption: buildSankeyOption
};
