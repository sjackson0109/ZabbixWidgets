/**
 * C30 Parallel Coordinates: one vertical axis per configured metric and one
 * line per entity (host or pairing tag value) through its latest value on
 * each axis (see data/parallel.js). Every axis has its own unit and scale:
 * the range the user fixed, or the values shown.
 *
 * Lines compare current values side by side. They do not show how the
 * metrics move together over time.
 */
import { baseOption } from './common.js';
import { parallelModel } from '../data/parallel.js';
import { axisRange } from '../data/scale.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function buildParallelOption(payload, context) {
	const { theme } = context;
	const model = parallelModel(payload.series.filter((entry) => entry.role === 'value'), payload.config);
	const { axes, entities } = model;
	const unitsOf = (index) => entities[0]?.members[index].units ?? '';
	const base = baseOption(context);
	const many = entities.length > 12;

	return {
		...base,
		legend: context.showLegend && !many ? { ...base.legend, data: entities.map((entity) => entity.label) } : { show: false },
		parallel: {
			left: 48,
			right: 64,
			top: 32,
			bottom: context.showLegend && !many ? 40 : 20,
			parallelAxisDefault: {
				nameLocation: 'end',
				nameGap: 12,
				nameTextStyle: { color: theme.text },
				axisLine: { lineStyle: { color: theme.axisLine } },
				axisTick: { lineStyle: { color: theme.axisLine } },
				splitLine: { show: false },
				axisLabel: { color: theme.mutedText }
			}
		},
		parallelAxis: axes.map((axis, index) => {
			const range = axisRange({
				values: entities.map((entity) => entity.members[index].value),
				min: axis.min,
				max: axis.max,
				pad: 0.05
			});
			return {
				dim: index,
				name: axis.heading,
				min: range.min,
				max: range.max,
				axisLabel: { color: theme.mutedText, formatter: (value) => formatValue(value, unitsOf(index), context.decimals) }
			};
		}),
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const entity = entities[param.seriesIndex];
				const lines = axes.map((axis, index) => {
					const member = entity.members[index];
					return `${escapeHtml(axis.heading)}: <b>${escapeHtml(formatValue(member.value, member.units, context.decimals))}</b> <span style="opacity:0.7">${escapeHtml(member.name)}</span>`;
				});
				return [`${param.marker}<b>${escapeHtml(entity.label)}</b>`, ...lines].join('<br>');
			}
		},
		series: entities.map((entity, index) => ({
			type: 'parallel',
			name: entity.label,
			color: theme.palette[index % theme.palette.length],
			lineStyle: { width: many ? 1 : 2, opacity: many ? 0.5 : 0.85 },
			emphasis: { lineStyle: { width: 3, opacity: 1 } },
			data: [entity.members.map((member) => member.value)]
		}))
	};
}

export default {
	id: 'parallel',
	buildOption: buildParallelOption
};
