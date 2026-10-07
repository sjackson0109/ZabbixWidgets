/**
 * C19 Sunburst: the same hierarchy as the treemap (data/levels.js), drawn
 * as rings from the centre outwards. Clicking a ring zooms into it; the
 * centre then shows the parent to click back to. "Maximum depth" folds
 * deeper levels into their parent, which then holds their total.
 */
import { baseOption } from './common.js';
import { buildLevelTree, limitDepth, parseLevels, treeDepth } from '../data/levels.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function sunburstData(payload) {
	const { config } = payload;
	const values = payload.series.filter((entry) => entry.role === 'value' && typeof entry.value === 'number' && entry.value > 0);
	const { levels } = parseLevels(config.levels);
	const { root } = buildLevelTree(values, payload.hosts, levels, { delimiter: String(config.path_delimiter ?? '') });
	const limited = limitDepth(root, Math.max(0, Number(config.max_depth) || 0));
	const strip = (node) => (node.children
		? { name: node.name, children: node.children.map(strip) }
		: { name: node.name, value: node.value, itemid: node.entry?.itemid, collapsed: node.collapsed === true });
	return { nodes: limited.children.map(strip), depth: treeDepth(limited) };
}

export function buildSunburstOption(payload, context) {
	const { nodes, depth } = sunburstData(payload);
	const units = payload.series.find((entry) => entry.role === 'value')?.units ?? '';
	const ring = Math.max(1, depth);
	const inner = 12;
	const outer = 88;
	const step = (outer - inner) / ring;

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const path = (param.treePathInfo ?? []).map((node) => node.name).filter(Boolean);
				const folded = param.data?.collapsed ? '<br>(total of deeper levels)' : '';
				return `<b>${escapeHtml(path.join(' / '))}</b><br>${escapeHtml(formatValue(param.value, units, context.decimals))}${folded}`;
			}
		},
		series: [{
			type: 'sunburst',
			data: nodes,
			radius: [0, `${outer}%`],
			nodeClick: 'rootToNode',
			emphasis: { focus: 'ancestor' },
			itemStyle: { borderColor: context.theme.tooltipBackground, borderWidth: 1 },
			// Text runs along each ring, so it is limited by the ring's arc; segments too narrow for it stay unlabelled.
			label: { color: '#ffffff', rotate: 'tangential', minAngle: 14, fontSize: 11, overflow: 'truncate', width: 80, textBorderColor: 'rgba(0, 0, 0, 0.35)', textBorderWidth: 2 },
			levels: [
				{},
				...Array.from({ length: ring }, (_, index) => ({
					r0: `${inner + index * step}%`,
					r: `${inner + (index + 1) * step}%`
				}))
			]
		}]
	};
}

export default {
	id: 'sunburst',
	buildOption: buildSunburstOption
};
