/**
 * C20 Funnel: one stage per line of the stage list, each holding the current
 * value of exactly one item. Stages are drawn in the listed order unless the
 * user chose to order them by value. Percentages of the first and of the
 * previous stage are optional.
 */
import { baseOption } from './common.js';
import { funnelStages, orderStages, share } from '../data/funnel.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function funnelView(payload) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const { stages } = funnelStages(series, config.stages);
	const ordered = orderStages(stages.filter((stage) => typeof stage.entry.value === 'number'), config.funnel_order);
	return ordered.map((stage, index) => ({
		...stage,
		value: stage.entry.value,
		ofFirst: share(stage.entry.value, ordered[0].entry.value),
		ofPrevious: index === 0 ? null : share(stage.entry.value, ordered[index - 1].entry.value)
	}));
}

export function buildFunnelOption(payload, context) {
	const { config } = payload;
	const stages = funnelView(payload);
	const max = Math.max(0, ...stages.map((stage) => stage.value));
	const pct = (value) => (value === null ? 'n/a' : `${formatValue(value, '', 1)}%`);

	const describe = (stage, index, separator) => {
		const parts = [];
		if (config.show_value !== false) {
			parts.push(formatValue(stage.value, stage.entry.units, context.decimals));
		}
		if (config.pct_first !== false && index > 0) {
			parts.push(`${pct(stage.ofFirst)} of first`);
		}
		if (config.pct_previous && index > 0) {
			parts.push(`${pct(stage.ofPrevious)} of previous`);
		}
		return parts.join(separator);
	};

	const base = baseOption(context);

	return {
		...base,
		legend: context.showLegend ? { ...base.legend, data: stages.map((stage) => stage.label) } : { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const stage = stages[param.dataIndex];
				const lines = [
					`${param.marker}<b>${escapeHtml(stage.label)}</b>`,
					escapeHtml(formatValue(stage.value, stage.entry.units, context.decimals)),
					`${escapeHtml(stage.entry.host)}: ${escapeHtml(stage.entry.name)}`
				];
				if (param.dataIndex > 0) {
					lines.push(`${escapeHtml(pct(stage.ofFirst))} of first, ${escapeHtml(pct(stage.ofPrevious))} of previous`);
				}
				return lines.join('<br>');
			}
		},
		series: [{
			type: 'funnel',
			sort: 'none',
			min: 0,
			max: max > 0 ? max : 1,
			minSize: '4%',
			gap: 2,
			left: '4%',
			width: '58%',
			top: 12,
			bottom: context.showLegend ? 36 : 12,
			label: {
				show: true,
				position: 'right',
				color: context.theme.text,
				overflow: 'truncate',
				width: 200,
				formatter: (param) => [stages[param.dataIndex].label, describe(stages[param.dataIndex], param.dataIndex, ' · ')].filter(Boolean).join('\n')
			},
			labelLine: { lineStyle: { color: context.theme.axisLine } },
			itemStyle: { borderColor: context.theme.tooltipBackground, borderWidth: 1 },
			data: stages.map((stage) => ({ name: stage.label, value: stage.value }))
		}]
	};
}

export default {
	id: 'funnel',
	buildOption: buildFunnelOption
};
