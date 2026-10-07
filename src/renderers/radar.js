/**
 * C05 Radar: one polygon per host across at least three item dimensions.
 * Axis maxima follow the documented rules in data/radar.js; values are never
 * rescaled, so tooltips show the real value and units of every dimension.
 */
import { baseOption } from './common.js';
import { buildRadar } from '../data/radar.js';
import { toNumber } from '../data/normalise.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function buildRadarOption(payload, context) {
	const series = payload.series.filter((entry) => entry.role === 'value');
	const configuredMax = toNumber(String(payload.config.radar_max ?? ''));
	const radar = buildRadar(series, {
		scale: payload.config.radar_scale === 'per_dimension' ? 'per_dimension' : 'shared',
		max: configuredMax !== null && configuredMax > 0 ? configuredMax : null
	});

	const base = baseOption(context);

	return {
		...base,
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const entity = radar.entities[param.dataIndex];
				const lines = radar.dimensions.map((dimension) => {
					const cell = entity.values[dimension];
					const text = cell === undefined || cell.value === null ? 'no data' : formatValue(cell.value, cell.units, context.decimals);
					return `${escapeHtml(dimension)}: <b>${escapeHtml(text)}</b>`;
				});
				return [`${param.marker}<b>${escapeHtml(entity.name)}</b>`, ...lines].join('<br>');
			}
		},
		radar: {
			radius: context.showLegend ? '62%' : '70%',
			center: ['50%', context.showLegend ? '46%' : '50%'],
			indicator: radar.indicators.map((indicator) => ({
				name: indicator.name,
				max: indicator.max !== null && indicator.max > 0 ? indicator.max : undefined
			})),
			axisName: { color: context.theme.mutedText },
			axisLine: { lineStyle: { color: context.theme.axisLine } },
			splitLine: { lineStyle: { color: context.theme.splitLine } },
			splitArea: { show: false }
		},
		series: [{
			type: 'radar',
			symbolSize: 4,
			areaStyle: { opacity: 0.12 },
			data: radar.entities.map((entity) => ({
				name: entity.name,
				value: radar.dimensions.map((dimension) => entity.values[dimension]?.value ?? '-')
			}))
		}]
	};
}

export default {
	id: 'radar',
	buildOption: buildRadarOption
};
