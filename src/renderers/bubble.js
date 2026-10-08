/**
 * C08 Bubble: one bubble per entry, with X, Y and size each taken from an
 * explicitly mapped item. Entries are paired by host or by a tag value (see
 * data/pairing.js); unpaired items are reported by validation, never matched
 * up by position.
 *
 * Bubble area is proportional to the size value. Bubbles with a size of zero
 * are drawn at a small minimum so they remain visible and hoverable. With
 * "Bubble size" set to none the chart is a plain XY scatter: every point has
 * the same size and no size items are read.
 *
 * Points compare latest values. Nothing here pairs samples over time, so the
 * chart shows where each entry is now, not how two metrics correlate.
 */
import { baseOption, valueAxis } from './common.js';
import { pairSeries } from '../data/pairing.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const MAX_DIAMETER = 48;
const MIN_DIAMETER = 4;
const SCATTER_DIAMETER = 10;

export function bubbleDiameter(size, maxSize) {
	if (!(maxSize > 0) || !(size > 0)) {
		return MIN_DIAMETER;
	}
	return Math.max(MIN_DIAMETER, Math.sqrt(size / maxSize) * MAX_DIAMETER);
}

export function buildBubbleOption(payload, context) {
	const { config } = payload;
	const sized = config.bubble_size !== 'none';
	const roles = sized ? ['x', 'y', 'size'] : ['x', 'y'];
	const { tuples } = pairSeries(payload.series, roles, { pairBy: config.pair_by, pairTag: config.pair_tag });
	const points = tuples.filter(({ members }) => roles.every((role) => typeof members[role].value === 'number'));
	const maxSize = sized ? Math.max(0, ...points.map(({ members }) => members.size.value)) : 0;
	const unitsOf = (role) => points[0]?.members[role].units ?? '';
	const axisName = (role) => points[0]?.members[role].name ?? '';

	const line = (label, member) => `${escapeHtml(label)}: <b>${escapeHtml(formatValue(member.value, member.units, context.decimals))}</b>`;

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 16, right: 24, top: 24, bottom: 32, containLabel: true },
		xAxis: {
			...valueAxis(context, unitsOf('x')),
			scale: true,
			boundaryGap: ['10%', '10%'],
			name: axisName('x'),
			nameLocation: 'middle',
			nameGap: 24,
			nameTextStyle: { color: context.theme.mutedText }
		},
		yAxis: {
			...valueAxis(context, unitsOf('y')),
			scale: true,
			boundaryGap: ['15%', '15%'],
			name: axisName('y'),
			nameTextStyle: { color: context.theme.mutedText }
		},
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const { label, members } = points[param.dataIndex];
				return [
					`${param.marker}<b>${escapeHtml(label)}</b>`,
					line(`X (${members.x.name})`, members.x),
					line(`Y (${members.y.name})`, members.y),
					...(sized ? [line(`Size (${members.size.name})`, members.size)] : [])
				].join('<br>');
			}
		},
		series: [{
			type: 'scatter',
			colorBy: 'data',
			itemStyle: { opacity: 0.75 },
			label: { show: points.length <= 20, position: 'top', color: context.theme.mutedText, formatter: (param) => points[param.dataIndex].label },
			data: points.map(({ members }) => ({
				value: [members.x.value, members.y.value],
				symbolSize: sized ? bubbleDiameter(members.size.value, maxSize) : SCATTER_DIAMETER
			}))
		}]
	};
}

export default {
	id: 'bubble',
	buildOption: buildBubbleOption
};
