/**
 * C03 Doughnut: current values as ring segments.
 *
 * Zero and negative values: negative values are rejected by validation, since
 * a share of a whole cannot be negative. Zero values stay in the legend as
 * zero-width segments unless "Hide zero values" is set. Items without a recent
 * value are left out (and listed in a warning by validation).
 *
 * The centre can show the sum or the average of the segments shown.
 */
import { baseOption, commonUnits, seriesLabels, tooltipLine } from './common.js';
import { aggregate } from '../data/aggregate.js';
import { formatValue } from '../data/units.js';

export function buildDoughnutOption(payload, context) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const labels = seriesLabels(series);
	const units = commonUnits(series) ?? '';

	const segments = series
		.map((entry, index) => ({ entry, name: labels[index] }))
		.filter(({ entry }) => typeof entry.value === 'number')
		.filter(({ entry }) => !(config.hide_zero && entry.value === 0));
	const total = segments.reduce((sum, { entry }) => sum + entry.value, 0);

	const centreFn = config.centre_value === 'sum' || config.centre_value === 'avg' ? config.centre_value : null;
	const centre = centreFn === null || segments.length === 0
		? null
		: aggregate(segments.map(({ entry }) => entry.value), centreFn);

	const percent = (value) => (total > 0 ? `${formatValue((value / total) * 100, '', 1)}%` : '');

	const base = baseOption(context);

	return {
		...base,
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const { entry } = segments[param.dataIndex];
				const line = tooltipLine(param.marker, param.name, entry.value, entry.units, context.decimals);
				return config.show_percent ? `${line} (${percent(entry.value)})` : line;
			}
		},
		graphic: centre === null ? [] : [{
			type: 'text',
			left: 'center',
			top: 'middle',
			silent: true,
			style: {
				text: `${formatValue(centre, units, context.decimals)}\n${centreFn === 'sum' ? 'total' : 'average'}`,
				fill: context.theme.text,
				font: '600 16px sans-serif',
				align: 'center'
			}
		}],
		series: [{
			type: 'pie',
			radius: ['45%', '68%'],
			avoidLabelOverlap: true,
			minShowLabelAngle: 4,
			label: {
				color: context.theme.text,
				formatter: (param) => {
					const { entry } = segments[param.dataIndex];
					const value = formatValue(entry.value, entry.units, context.decimals);
					return config.show_percent ? `${param.name}\n${value} (${percent(entry.value)})` : `${param.name}\n${value}`;
				}
			},
			data: segments.map(({ entry, name }) => ({ name, value: entry.value }))
		}]
	};
}

export default {
	id: 'doughnut',
	buildOption: buildDoughnutOption
};
