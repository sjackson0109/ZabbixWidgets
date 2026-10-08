/**
 * C33 Waterfall: how contributions take a running total from one level to
 * the next (see data/waterfall.js for the steps and their meaning).
 * Increases and decreases float between the running totals before and
 * after them; levels and totals stand on zero. Dotted connectors join each
 * bar's end to the next bar's start, so the arithmetic can be followed.
 */
import { baseOption, categoryAxis, commonUnits, valueAxis } from './common.js';
import { waterfallModel } from '../data/waterfall.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const KIND_NAMES = { increase: 'Increase', decrease: 'Decrease', level: 'Measured level', total: 'Total' };

export function waterfallColours(theme) {
	return theme.mode === 'dark'
		? { increase: '#009E73', decrease: '#D55E00', level: '#56B4E9', total: '#56B4E9' }
		: { increase: '#009E73', decrease: '#D55E00', level: '#0072B2', total: '#0072B2' };
}

export function buildWaterfallOption(payload, context) {
	const { theme } = context;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const model = waterfallModel(series, payload.config.waterfall_steps);
	const units = commonUnits(model.bars.filter((bar) => bar.entry !== null).map((bar) => bar.entry)) ?? '';
	const colours = waterfallColours(theme);
	const format = (value) => formatValue(value, units, context.decimals);
	const showValue = payload.config.show_value !== false;
	const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;

	const renderItem = (params, api) => {
		const bar = model.bars[params.dataIndex];
		const [x, low] = api.coord([params.dataIndex, Math.min(bar.from, bar.to)]);
		const [, high] = api.coord([params.dataIndex, Math.max(bar.from, bar.to)]);
		const width = api.size([1, 0])[0] * 0.6;
		const children = [{
			type: 'rect',
			shape: { x: x - width / 2, y: high, width, height: Math.max(1, low - high) },
			style: { fill: colours[bar.kind] }
		}];
		const next = model.bars[params.dataIndex + 1];
		if (next !== undefined) {
			const [nextX, level] = api.coord([params.dataIndex + 1, bar.to]);
			children.push({
				type: 'line',
				shape: { x1: x + width / 2, y1: level, x2: nextX - width / 2, y2: level },
				style: { stroke: theme.mutedText, lineDash: [2, 2], lineWidth: 1 }
			});
		}
		if (showValue) {
			const text = bar.delta === null ? format(bar.to) : signed(bar.delta);
			children.push({
				type: 'text',
				style: { x, y: high - 4, text, fill: theme.text, font: '12px sans-serif', align: 'center', verticalAlign: 'bottom' }
			});
		}
		return { type: 'group', children };
	};

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 8, right: 16, top: showValue ? 28 : 16, bottom: 8, containLabel: true },
		xAxis: { ...categoryAxis(context, model.bars.map((bar) => bar.label)), axisLabel: { color: theme.mutedText, interval: 0, overflow: 'truncate', width: 100 } },
		// A value axis keeps zero in view, which levels and totals stand on.
		yAxis: valueAxis(context, units),
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const bar = model.bars[param.dataIndex];
				const lines = [`<b>${escapeHtml(bar.label)}</b>`, escapeHtml(KIND_NAMES[bar.kind])];
				if (bar.delta !== null) {
					lines.push(`Change: <b>${escapeHtml(signed(bar.delta))}</b>`, `From ${escapeHtml(format(bar.from))} to ${escapeHtml(format(bar.to))}`);
				}
				else {
					lines.push(`Value: <b>${escapeHtml(format(bar.to))}</b>`);
				}
				if (bar.entry !== null) {
					lines.push(`<span style="opacity:0.7">${escapeHtml(`${bar.entry.host}: ${bar.entry.name}`)}</span>`);
				}
				const mismatch = model.mismatches.find((entry) => entry.label === bar.label);
				if (mismatch) {
					lines.push(`The steps before it add up to ${escapeHtml(format(mismatch.expected))}`);
				}
				return lines.join('<br>');
			}
		},
		series: [{
			type: 'custom',
			renderItem,
			encode: { x: 0, y: [1, 2] },
			data: model.bars.map((bar, index) => [index, bar.from, bar.to])
		}]
	};
}

export default {
	id: 'waterfall',
	buildOption: buildWaterfallOption
};
