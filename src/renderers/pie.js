/**
 * C15 Pie: current values as slices of a full pie, one per item or one per
 * host (the host's items added up, for additive units only). Negative values
 * and mixed units are rejected by validation; zero slices stay unless "Hide
 * zero values" is set; items without a recent value are left out and listed
 * in a warning.
 */
import { baseOption } from './common.js';
import { chartEntities, sortEntities } from '../data/groups.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const PIE_SORT = { source: null, desc: 'desc', asc: 'asc' };

export function pieSlices(payload) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const entities = chartEntities(series, config.entity_by === 'host' ? 'host' : 'item')
		.filter((entity) => !(config.hide_zero && entity.value === 0));
	const slices = sortEntities(entities, PIE_SORT[config.pie_sort] ?? null);
	const total = slices.reduce((sum, slice) => sum + slice.value, 0);
	return { slices, total };
}

export function buildPieOption(payload, context) {
	const { config } = payload;
	const { slices, total } = pieSlices(payload);
	const percent = (value) => (total > 0 ? `${formatValue((value / total) * 100, '', 1)}%` : '–');
	const value = (slice) => formatValue(slice.value, slice.units, context.decimals);
	const position = config.label_position === 'inside' ? 'inside' : 'outside';
	const showLabels = config.label_position !== 'none';

	const labelText = (slice) => {
		const parts = [];
		if (config.show_value) {
			parts.push(value(slice));
		}
		if (config.show_percent !== false) {
			parts.push(percent(slice.value));
		}
		return position === 'inside' ? parts.join('\n') : [slice.label, parts.join(' · ')].filter(Boolean).join('\n');
	};

	const base = baseOption(context);

	return {
		...base,
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const slice = slices[param.dataIndex];
				const detail = slice.items.length > 1 ? `<br>${escapeHtml(`sum of ${slice.items.length} items`)}` : '';
				return `${param.marker}<b>${escapeHtml(slice.label)}</b><br>${escapeHtml(value(slice))} (${escapeHtml(percent(slice.value))})${detail}`;
			}
		},
		series: [{
			type: 'pie',
			radius: context.showLegend ? ['0%', '62%'] : ['0%', '70%'],
			center: ['50%', context.showLegend ? '45%' : '50%'],
			avoidLabelOverlap: true,
			minShowLabelAngle: 3,
			itemStyle: { borderColor: context.theme.tooltipBackground, borderWidth: 1 },
			label: {
				show: showLabels,
				position,
				color: position === 'inside' ? '#ffffff' : context.theme.text,
				overflow: 'truncate',
				width: 140,
				formatter: (param) => labelText(slices[param.dataIndex])
			},
			labelLine: { show: showLabels && position === 'outside' },
			labelLayout: { hideOverlap: true },
			data: slices.map((slice) => ({ name: slice.label, value: slice.value }))
		}]
	};
}

export default {
	id: 'pie',
	buildOption: buildPieOption
};
