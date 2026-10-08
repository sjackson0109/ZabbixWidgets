/**
 * C11 Network / Graph Diagram: selected hosts as nodes and configured
 * relationships as edges. Edges come only from the relationship list or from
 * a host tag naming the linked host (see data/edges.js); hosts with no edges
 * are still shown, unconnected, and no edges are ever inferred.
 *
 * Layouts:
 * - Circle (the default): nodes on a circle in host order, the same on every
 *   refresh and always fitting the widget.
 * - Force-directed: nodes settle by simulated forces. Positions reached on
 *   one refresh (including nodes the user dragged) seed the next one, so the
 *   picture does not jump about.
 * - Fixed positions: the user's "host = x, y" lines. Hosts without a line
 *   are not drawn, and validation lists them.
 *
 * Links are directed (arrows) or undirected (no arrows, and a -> b and b -> a
 * are one link). A link's weight, when the list gives one, is a fixed number
 * or the latest value of a named item on the source host; it sets the line's
 * width. Relationships from tags or from the list say that two hosts are
 * connected; they are not measured traffic unless a weight item says so.
 */
import { baseOption } from './common.js';
import { edgeWeight, edgesFromHostTag, parseEdgeList, resolveEdges } from '../data/edges.js';
import { parseNodePositions } from '../data/positions.js';
import { tagValue } from '../data/normalise.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const MIN_WIDTH = 1.5;
const MAX_WIDTH = 8;

/** The category a node is coloured by: its host groups, a host tag, or none. */
export function nodeCategory(host, config) {
	if (config.node_category === 'group') {
		return host.groups.length > 0 ? [...host.groups].sort().join(', ') : '(no host group)';
	}
	if (config.node_category === 'tag') {
		const tag = String(config.node_category_tag ?? '').trim();
		return tagValue(host.tags, tag) ?? `(no ${tag})`;
	}
	return null;
}

export function networkGraph(payload) {
	const { config, hosts } = payload;
	const edges = config.edge_source === 'tag'
		? edgesFromHostTag(hosts, String(config.edge_tag ?? '').trim())
		: parseEdgeList(config.edge_list).edges;
	const { resolved } = resolveEdges(edges, hosts);
	const undirected = config.edge_direction === 'undirected';
	const values = payload.series.filter((entry) => entry.role === 'value');

	const unique = new Map();
	for (const edge of resolved) {
		const ends = undirected ? [edge.sourceId, edge.targetId].sort() : [edge.sourceId, edge.targetId];
		unique.set(JSON.stringify([...ends, edge.label, edge.weight]), edge);
	}

	const byHost = new Map();
	for (const entry of values) {
		(byHost.get(entry.hostid) ?? byHost.set(entry.hostid, []).get(entry.hostid)).push(entry);
	}

	return {
		nodes: hosts.map((host) => ({ id: host.hostid, name: host.name, category: nodeCategory(host, config), items: byHost.get(host.hostid) ?? [] })),
		links: [...unique.values()].map((edge) => ({
			source: edge.sourceId,
			target: edge.targetId,
			text: edge.label,
			weight: edge.weight === null || edge.weight === undefined ? null : edgeWeight(edge, values)
		}))
	};
}

/** Line width for a weighted link: proportional to the largest weight shown, thin and dashed without a value. */
export function linkWidth(weight, largest) {
	if (weight === null || weight.value === null || !(largest > 0)) {
		return MIN_WIDTH;
	}
	return MIN_WIDTH + (Math.max(0, weight.value) / largest) * (MAX_WIDTH - MIN_WIDTH);
}

/**
 * Node positions and zoom from the chart as last drawn, so a refresh keeps
 * them. Reads the drawn layout through the instance's model; a version of
 * ECharts without it simply keeps nothing.
 */
export function captureNetworkState(instance, state) {
	try {
		const seriesModel = instance.getModel().getSeriesByIndex(0);
		if (seriesModel?.subType !== 'graph') {
			return;
		}
		const data = seriesModel.getData();
		const positions = {};
		data.each((index) => {
			const layout = data.getItemLayout(index);
			if (Array.isArray(layout) && layout.every(Number.isFinite)) {
				positions[data.getId(index)] = [layout[0], layout[1]];
			}
		});
		state.nodePositions = positions;
		state.roam = { zoom: seriesModel.get('zoom'), center: seriesModel.get('center') };
	}
	catch {
		// Nothing to keep.
	}
}

export function buildNetworkOption(payload, context) {
	const { config } = payload;
	const graph = networkGraph(payload);
	const layout = config.network_layout === 'force' || config.network_layout === 'fixed' ? config.network_layout : 'circular';
	const fixed = layout === 'fixed' ? parseNodePositions(config.node_positions).positions : null;
	const nodes = fixed === null ? graph.nodes : graph.nodes.filter((node) => fixed.has(node.name));
	const shown = new Set(nodes.map((node) => node.id));
	const links = graph.links.filter((link) => shown.has(link.source) && shown.has(link.target));
	const remembered = layout === 'force' ? context.state?.nodePositions ?? {} : {};
	const roam = layout === 'circular' ? null : context.state?.roam ?? null;

	const degree = new Map();
	for (const link of links) {
		degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
		degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
	}
	const categories = [...new Set(nodes.map((node) => node.category).filter((category) => category !== null))].sort();
	const largest = Math.max(0, ...links.map((link) => link.weight?.value ?? 0));
	const directed = config.edge_direction !== 'undirected';
	const nameOf = new Map(graph.nodes.map((node) => [node.id, node.name]));

	const base = baseOption(context);

	return {
		...base,
		legend: categories.length > 0 && context.showLegend
			? { ...base.legend, data: categories }
			: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.dataType === 'edge') {
					const link = links[param.dataIndex];
					const lines = [`${escapeHtml(nameOf.get(link.source))} ${directed ? '→' : '–'} ${escapeHtml(nameOf.get(link.target))}`];
					if (link.text) {
						lines.push(escapeHtml(link.text));
					}
					if (link.weight !== null) {
						const what = link.weight.entry === null ? 'Weight' : link.weight.entry.name;
						const value = link.weight.value === null ? 'no data' : formatValue(link.weight.value, link.weight.units, context.decimals);
						lines.push(`${escapeHtml(what)}: <b>${escapeHtml(value)}</b>`);
					}
					return lines.join('<br>');
				}
				const node = nodes[param.dataIndex];
				const lines = node.items.map((entry) => {
					const value = entry.value === null ? 'no data' : formatValue(entry.value, entry.units, context.decimals);
					return `${escapeHtml(entry.name)}: <b>${escapeHtml(value)}</b>`;
				});
				const category = node.category === null ? [] : [escapeHtml(node.category)];
				return [`<b>${escapeHtml(node.name)}</b>`, ...category, ...lines].join('<br>');
			}
		},
		series: [{
			type: 'graph',
			layout: layout === 'fixed' ? 'none' : layout,
			circular: { rotateLabel: nodes.length > 12 },
			force: { repulsion: 220, edgeLength: [50, 140], gravity: 0.08, layoutAnimation: false },
			top: 24,
			bottom: categories.length > 0 && context.showLegend ? 40 : 24,
			left: 80,
			right: 80,
			roam: true,
			zoom: roam?.zoom ?? 1,
			center: roam?.center ?? undefined,
			draggable: layout === 'force',
			categories: categories.map((name) => ({ name })),
			edgeSymbol: directed ? ['none', 'arrow'] : ['none', 'none'],
			edgeSymbolSize: 7,
			label: { show: config.show_node_labels !== false, position: 'right', color: context.theme.text },
			edgeLabel: {
				show: config.show_edge_labels !== false && links.some((link) => link.text),
				color: context.theme.mutedText,
				formatter: (param) => param.data.text ?? ''
			},
			lineStyle: { color: context.theme.axisLine, width: MIN_WIDTH, curveness: 0.1 },
			emphasis: { focus: 'adjacency' },
			data: nodes.map((node) => {
				const position = fixed?.get(node.name) ?? remembered[node.id];
				const connected = (degree.get(node.id) ?? 0) > 0;
				return {
					id: node.id,
					name: node.name,
					...(position ? { x: position[0], y: position[1] } : {}),
					...(node.category === null
						? { itemStyle: { color: connected ? context.theme.palette[0] : context.theme.mutedText } }
						: { category: categories.indexOf(node.category) }),
					symbolSize: 10 + Math.min(degree.get(node.id) ?? 0, 10) * 2
				};
			}),
			links: links.map((link) => ({
				source: link.source,
				target: link.target,
				text: link.text,
				lineStyle: link.weight === null ? undefined : {
					width: linkWidth(link.weight, largest),
					type: link.weight.value === null ? 'dashed' : 'solid'
				}
			}))
		}]
	};
}

export default {
	id: 'network',
	buildOption: buildNetworkOption,
	captureState: captureNetworkState
};
