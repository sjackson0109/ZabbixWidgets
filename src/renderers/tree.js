/**
 * C10 Tree Diagram: items placed in a hierarchy that comes from real
 * structure only: nested host group names, an ordered list of tag names, or
 * item names split by a delimiter the user chose (see data/hierarchy.js).
 */
import { baseOption } from './common.js';
import { buildHierarchy } from '../data/hierarchy.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const ROOT_NAMES = { host_group: 'Host groups', tags: 'Tags', item_path: 'Items' };
const EXPAND_ALL_LIMIT = 150;

function countNodes(node) {
	return 1 + (node.children ?? []).reduce((total, child) => total + countNodes(child), 0);
}

function decorate(node, context) {
	if (!node.children) {
		const value = node.value === null || node.value === undefined ? 'no data' : formatValue(node.value, node.units, context.decimals);
		return { name: node.name, value: node.value, detail: value, itemid: node.itemid };
	}
	return { name: node.name, children: node.children.map((child) => decorate(child, context)) };
}

export function buildTreeData(payload, context) {
	const { config } = payload;
	const tags = String(config.tree_tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
	const root = buildHierarchy(payload.series.filter((entry) => entry.role === 'value'), payload.hosts, {
		source: config.tree_source,
		tags,
		delimiter: String(config.tree_delimiter ?? '')
	});
	return { ...decorate(root, context), name: ROOT_NAMES[config.tree_source] ?? '' };
}

export function buildTreeOption(payload, context) {
	const data = buildTreeData(payload, context);
	const large = countNodes(data) > EXPAND_ALL_LIMIT;

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => (param.data.children
				? `<b>${escapeHtml(param.name)}</b>`
				: `${escapeHtml(param.name)}: <b>${escapeHtml(param.data.detail)}</b>`)
		},
		series: [{
			type: 'tree',
			data: [data],
			orient: 'LR',
			left: 96,
			right: 160,
			top: 16,
			bottom: 16,
			roam: true,
			expandAndCollapse: true,
			initialTreeDepth: large ? 2 : -1,
			symbolSize: 7,
			lineStyle: { color: context.theme.axisLine },
			label: { position: 'left', verticalAlign: 'middle', align: 'right', color: context.theme.text },
			leaves: {
				label: {
					position: 'right',
					align: 'left',
					formatter: (param) => `${param.name}: ${param.data.detail}`
				}
			}
		}]
	};
}

export default {
	id: 'tree',
	buildOption: buildTreeOption
};
