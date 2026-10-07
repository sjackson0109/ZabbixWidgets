/**
 * C12 Chord / Relationship Diagram: flows between named endpoints, drawn with
 * the native chord series that ECharts provides from version 6.
 *
 * Each item carries a source tag and a target tag naming the two endpoints,
 * and its latest value is the flow weight; several items describing the same
 * pair are summed (see data/relationships.js). Flows from an endpoint to
 * itself have no chord to draw and are left out, with a warning.
 */
import { baseOption, commonUnits } from './common.js';
import { buildRelationships } from '../data/relationships.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function relationshipFlows(payload) {
	const { flows, nodes } = buildRelationships(payload.series.filter((entry) => entry.role === 'weight'), {
		sourceTag: String(payload.config.source_tag ?? '').trim(),
		targetTag: String(payload.config.target_tag ?? '').trim()
	});
	return { flows: flows.filter((flow) => flow.source !== flow.target), nodes };
}

export function buildRelationshipOption(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'weight');
	const units = commonUnits(series) ?? '';
	const { flows, nodes } = relationshipFlows(payload);
	const format = (value) => formatValue(value, units, context.decimals);

	return {
		...baseOption(context),
		legend: context.showLegend ? { ...baseOption(context).legend, data: nodes } : { show: false },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.dataType === 'edge') {
					return `${escapeHtml(param.data.source)} → ${escapeHtml(param.data.target)}: <b>${escapeHtml(format(param.data.value))}</b>`;
				}
				const out = flows.filter((flow) => flow.source === param.name).reduce((sum, flow) => sum + flow.weight, 0);
				const into = flows.filter((flow) => flow.target === param.name).reduce((sum, flow) => sum + flow.weight, 0);
				return [
					`${param.marker}<b>${escapeHtml(param.name)}</b>`,
					`Outgoing: <b>${escapeHtml(format(out))}</b>`,
					`Incoming: <b>${escapeHtml(format(into))}</b>`
				].join('<br>');
			}
		},
		series: [{
			type: 'chord',
			radius: ['62%', '70%'],
			center: ['50%', context.showLegend ? '46%' : '50%'],
			label: { show: true, color: context.theme.text },
			lineStyle: { color: 'source', opacity: 0.35 },
			data: nodes.map((name) => ({ name })),
			links: flows.map((flow) => ({ source: flow.source, target: flow.target, value: flow.weight }))
		}]
	};
}

export default {
	id: 'relationship',
	buildOption: buildRelationshipOption
};
