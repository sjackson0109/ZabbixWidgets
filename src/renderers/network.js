/**
 * C11 Network / Graph Diagram: selected hosts as nodes and configured
 * relationships as edges. Edges come only from the relationship list or from
 * a host tag naming the linked host (see data/edges.js); hosts with no edges
 * are still shown, unconnected, and no edges are ever inferred.
 *
 * Nodes are placed on a circle in host order, so the layout is the same on
 * every refresh and always fits the widget.
 */
import { baseOption } from './common.js';
import { edgesFromHostTag, parseEdgeList, resolveEdges } from '../data/edges.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function networkGraph(payload) {
	const { config, hosts } = payload;
	const edges = config.edge_source === 'tag'
		? edgesFromHostTag(hosts, String(config.edge_tag ?? '').trim())
		: parseEdgeList(config.edge_list).edges;
	const { resolved } = resolveEdges(edges, hosts);

	const unique = new Map();
	for (const edge of resolved) {
		const key = JSON.stringify([edge.sourceId, edge.targetId, edge.label]);
		unique.set(key, edge);
	}

	const values = new Map();
	for (const entry of payload.series) {
		if (entry.role === 'value') {
			(values.get(entry.hostid) ?? values.set(entry.hostid, []).get(entry.hostid)).push(entry);
		}
	}

	return {
		nodes: hosts.map((host) => ({ id: host.hostid, name: host.name, items: values.get(host.hostid) ?? [] })),
		links: [...unique.values()].map((edge) => ({ source: edge.sourceId, target: edge.targetId, text: edge.label }))
	};
}

export function buildNetworkOption(payload, context) {
	const graph = networkGraph(payload);
	const degree = new Map();
	for (const link of graph.links) {
		degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
		degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
	}
	const count = graph.nodes.length;

	return {
		...baseOption(context),
		legend: { show: false },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.dataType === 'edge') {
					const source = graph.nodes.find((node) => node.id === param.data.source)?.name ?? '';
					const target = graph.nodes.find((node) => node.id === param.data.target)?.name ?? '';
					const label = param.data.text ? `<br>${escapeHtml(param.data.text)}` : '';
					return `${escapeHtml(source)} → ${escapeHtml(target)}${label}`;
				}
				const node = graph.nodes[param.dataIndex];
				const lines = node.items.map((entry) => {
					const value = entry.value === null ? 'no data' : formatValue(entry.value, entry.units, context.decimals);
					return `${escapeHtml(entry.name)}: <b>${escapeHtml(value)}</b>`;
				});
				return [`<b>${escapeHtml(node.name)}</b>`, ...lines].join('<br>');
			}
		},
		series: [{
			type: 'graph',
			layout: 'circular',
			circular: { rotateLabel: count > 12 },
			top: 24,
			bottom: 24,
			left: 80,
			right: 80,
			roam: true,
			edgeSymbol: ['none', 'arrow'],
			edgeSymbolSize: 7,
			label: { show: true, position: 'right', color: context.theme.text },
			edgeLabel: { show: graph.links.some((link) => link.text), color: context.theme.mutedText, formatter: (param) => param.data.text ?? '' },
			lineStyle: { color: context.theme.axisLine, width: 1.5, curveness: 0.1 },
			emphasis: { focus: 'adjacency' },
			data: graph.nodes.map((node) => ({
				id: node.id,
				name: node.name,
				symbolSize: 10 + Math.min(degree.get(node.id) ?? 0, 10) * 2,
				itemStyle: { color: (degree.get(node.id) ?? 0) === 0 ? context.theme.mutedText : context.theme.palette[0] }
			})),
			links: graph.links.map((link) => ({ source: link.source, target: link.target, text: link.text }))
		}]
	};
}

export default {
	id: 'network',
	buildOption: buildNetworkOption
};
