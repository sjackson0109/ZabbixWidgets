/**
 * C24 State Timeline: one lane per item, with a block for each period the
 * item stayed in one state and hatched "no data" blocks where its state is
 * unknown (see data/states.js). Value mappings name the states; the colour
 * map can fix their colours.
 */
import { baseOption, categoryAxis, formatClock } from './common.js';
import { timeLabel } from './temporal.js';
import { stateLanes } from '../data/states.js';
import { formatDuration } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function buildStateTimelineOption(payload, context) {
	const { theme } = context;
	const { lanes, colours } = stateLanes(payload, theme.palette);
	const period = payload.timePeriod ?? { from: 0, to: 1 };
	const span = period.to - period.from;
	const blocks = lanes.flatMap((lane, row) => lane.segments.map((segment) => ({ lane, row, segment })));

	const base = baseOption(context);
	const legendStates = [...colours.keys()];

	return {
		...base,
		legend: { show: false },
		grid: { left: 8, right: 16, top: 8, bottom: context.showLegend ? 58 : 34, containLabel: true },
		xAxis: {
			type: 'time',
			min: period.from * 1000,
			max: period.to * 1000,
			axisLine: { lineStyle: { color: theme.axisLine } },
			splitLine: { show: true, lineStyle: { color: theme.splitLine } },
			axisLabel: { color: theme.mutedText, hideOverlap: true, formatter: (ms) => timeLabel(ms, span, context.timeZone) }
		},
		yAxis: { ...categoryAxis(context, lanes.map((lane) => lane.label)), inverse: true, axisLabel: { color: theme.text, overflow: 'truncate', width: 180 } },
		dataZoom: [
			{ type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter', zoomOnMouseWheel: 'shift', moveOnMouseWheel: false },
			{
				type: 'slider', xAxisIndex: 0, filterMode: 'weakFilter', height: 14, bottom: context.showLegend ? 30 : 6, showDetail: false,
				brushSelect: false, borderColor: theme.splitLine, textStyle: { color: theme.mutedText }
			}
		],
		graphic: context.showLegend ? [{
			type: 'group',
			left: 8,
			bottom: 4,
			children: [...legendStates.map((key) => ({ key, colour: colours.get(key) })), { key: 'No data', colour: null }].flatMap((item, index) => [
				{ type: 'rect', left: index * 110, top: 3, shape: { width: 10, height: 10 }, style: item.colour === null ? { fill: theme.neutral, stroke: theme.axisLine, lineDash: [2, 2] } : { fill: item.colour } },
				{ type: 'text', left: index * 110 + 14, top: 1, style: { text: item.key, fill: theme.text, font: '12px sans-serif', width: 92, overflow: 'truncate' } }
			])
		}] : [],
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const { lane, segment } = blocks[param.dataIndex];
				return [
					`<b>${escapeHtml(lane.entry.host)}: ${escapeHtml(lane.entry.name)}</b>`,
					`State: <b>${escapeHtml(segment.state === null ? 'no data' : segment.state.text)}</b>`,
					`Start: ${escapeHtml(formatClock(segment.start, context.timeZone, { seconds: true }))}`,
					`End: ${escapeHtml(formatClock(segment.end, context.timeZone, { seconds: true }))}`,
					`Duration: ${escapeHtml(formatDuration(segment.end - segment.start))}`
				].join('<br>');
			}
		},
		series: [{
			type: 'custom',
			clip: true,
			encode: { x: [1, 2], y: 0 },
			data: blocks.map(({ row, segment }) => [row, segment.start * 1000, segment.end * 1000]),
			renderItem: (params, api) => {
				const { segment } = blocks[params.dataIndex];
				const [left, centre] = api.coord([api.value(1), api.value(0)]);
				const [width, rowHeight] = api.size([api.value(2) - api.value(1), 1]);
				const height = Math.min(28, rowHeight * 0.7);
				const shape = { x: left, y: centre - height / 2, width: Math.max(width, 1), height };
				if (segment.state === null) {
					return { type: 'rect', shape, style: { fill: theme.neutral, opacity: 0.6, stroke: theme.axisLine, lineDash: [2, 2], lineWidth: 1 } };
				}
				const fill = colours.get(segment.state.key);
				return {
					type: 'rect',
					shape,
					style: { fill, stroke: theme.tooltipBackground, lineWidth: 0.5 },
					textContent: width > 48 ? { style: { text: segment.state.mapped ?? segment.state.text, fill: '#ffffff', font: '11px sans-serif', width: width - 6, overflow: 'truncate', textBorderColor: 'rgba(0,0,0,0.35)', textBorderWidth: 2 } } : undefined,
					textConfig: width > 48 ? { position: 'inside' } : undefined
				};
			}
		}]
	};
}

export default {
	id: 'state_timeline',
	buildOption: buildStateTimelineOption
};
