/**
 * C10 Tree Diagram: items placed in a hierarchy that comes from real
 * structure only: nested host group names, an ordered list of tag names, or
 * item names split by a delimiter the user chose (see data/hierarchy.js).
 *
 * The layout grows the tree left to right (the default), right to left,
 * top down, bottom up or radially from the centre. Zoom and pan are kept
 * across refreshes.
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

/**
 * Placement and label sides per layout: inner nodes label towards the root,
 * leaves away from it, so labels never sit on the links.
 */
const LAYOUTS = {
	lr: { orient: 'LR', margins: { left: 96, right: 160, top: 16, bottom: 16 }, inner: { position: 'left', align: 'right' }, leaf: { position: 'right', align: 'left' } },
	rl: { orient: 'RL', margins: { left: 160, right: 96, top: 16, bottom: 16 }, inner: { position: 'right', align: 'left' }, leaf: { position: 'left', align: 'right' } },
	tb: { orient: 'TB', margins: { left: 24, right: 24, top: 40, bottom: 110 }, inner: { position: 'top', align: 'center' }, leaf: { position: 'bottom', rotate: -90, align: 'left', verticalAlign: 'middle' } },
	bt: { orient: 'BT', margins: { left: 24, right: 24, top: 110, bottom: 40 }, inner: { position: 'bottom', align: 'center' }, leaf: { position: 'top', rotate: 90, align: 'left', verticalAlign: 'middle' } },
	radial: { layout: 'radial', margins: { left: 80, right: 80, top: 40, bottom: 40 }, inner: {}, leaf: {} }
};

export function captureTreeState(instance, state) {
	try {
		const seriesModel = instance.getModel().getSeriesByIndex(0);
		if (seriesModel?.subType === 'tree') {
			state.roam = { zoom: seriesModel.get('zoom'), center: seriesModel.get('center') };
		}
	}
	catch {
		// Nothing to keep.
	}
}

export function buildTreeOption(payload, context) {
	const data = buildTreeData(payload, context);
	const large = countNodes(data) > EXPAND_ALL_LIMIT;
	const layout = LAYOUTS[payload.config.tree_layout] ?? LAYOUTS.lr;
	const roam = context.state?.roam ?? null;

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
			...(layout.layout === 'radial' ? { layout: 'radial' } : { orient: layout.orient }),
			...layout.margins,
			roam: true,
			zoom: roam?.zoom ?? 1,
			center: roam?.center ?? undefined,
			expandAndCollapse: true,
			initialTreeDepth: large ? 2 : -1,
			symbolSize: 7,
			lineStyle: { color: context.theme.axisLine },
			label: { verticalAlign: 'middle', ...layout.inner, color: context.theme.text },
			leaves: {
				label: {
					...layout.leaf,
					formatter: (param) => `${param.name}: ${param.data.detail}`
				}
			}
		}]
	};
}

export default {
	id: 'tree',
	buildOption: buildTreeOption,
	captureState: captureTreeState
};
