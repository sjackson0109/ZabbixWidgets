/**
 * C04 Bullet Graph: each actual value as a bar with its target as a marker.
 * Targets come only from the configured source (see data/targets.js), and the
 * optional qualitative ranges are drawn as shaded bands behind the bars.
 */
import { baseOption, categoryAxis, niceCeil, seriesLabels, tooltipLine, valueAxis } from './common.js';
import { bulletBars, parseRanges } from '../data/targets.js';
import { escapeHtml } from '../utils/escape.js';

const BAND_OPACITY = [0.22, 0.14, 0.08, 0.04];

export function buildBulletOption(payload, context) {
	const bars = bulletBars(payload).filter((bar) => typeof bar.actual.value === 'number');
	const pairedByItem = payload.config.target_source === 'item';
	const names = pairedByItem ? bars.map((bar) => bar.label) : seriesLabels(bars.map((bar) => bar.actual));
	const { ranges } = parseRanges(payload.config.ranges);
	const units = bars[0]?.actual.units ?? '';

	const values = bars.flatMap((bar) => [bar.actual.value, bar.target]);
	const min = Math.min(0, ...values, ...ranges);
	let max = niceCeil(Math.max(...values, ...ranges));
	if (max <= min) {
		max = min + 1;
	}

	const edges = [min, ...ranges.filter((value) => value > min && value < max), max];
	const bands = edges.slice(1).map((end, index) => [
		{ xAxis: edges[index], itemStyle: { color: context.theme.text, opacity: BAND_OPACITY[Math.min(index, BAND_OPACITY.length - 1)] } },
		{ xAxis: end }
	]);

	return {
		...baseOption(context),
		legend: context.showLegend
			? { ...baseOption(context).legend, data: ['Actual', 'Target'] }
			: { show: false },
		grid: { left: 8, right: 16, top: 8, bottom: context.showLegend ? 32 : 8, containLabel: true },
		xAxis: { ...valueAxis(context, units), min, max },
		yAxis: { ...categoryAxis(context, names), inverse: true },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'axis',
			axisPointer: { type: 'none' },
			formatter: (params) => {
				const bar = bars[params[0]?.dataIndex];
				if (bar === undefined) {
					return '';
				}
				return [
					`<b>${escapeHtml(names[params[0].dataIndex])}</b>`,
					tooltipLine('', 'Actual', bar.actual.value, bar.actual.units, context.decimals),
					tooltipLine('', 'Target', bar.target, bar.actual.units, context.decimals)
				].join('<br>');
			}
		},
		series: [
			{
				type: 'bar',
				name: 'Actual',
				barWidth: '35%',
				z: 3,
				data: bars.map((bar) => bar.actual.value),
				markArea: ranges.length > 0 ? { silent: true, data: bands } : undefined
			},
			{
				type: 'scatter',
				name: 'Target',
				symbol: 'rect',
				symbolSize: [4, 22],
				z: 4,
				itemStyle: { color: context.theme.text },
				data: bars.map((bar, index) => [bar.target, index])
			}
		]
	};
}

export default {
	id: 'bullet',
	buildOption: buildBulletOption
};
