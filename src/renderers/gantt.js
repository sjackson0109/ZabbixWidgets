/**
 * C09 Gantt: one bar per task from explicit timing items.
 *
 * Start and end items hold Unix timestamps in seconds; a duration item holds
 * seconds. Items are paired into tasks by host or by tag value. The optional
 * progress item is a percentage (0-100) drawn as a darker fill. Item polling
 * intervals are never used as durations: validation rejects tasks without
 * real timing values.
 */
import { baseOption, categoryAxis, formatClock } from './common.js';
import { pairSeries } from '../data/pairing.js';
import { formatDuration } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function ganttTasks(payload) {
	const { config } = payload;
	const byDuration = config.gantt_timing === 'start_duration';
	const options = { pairBy: config.pair_by, pairTag: config.pair_tag };
	const { tuples } = pairSeries(payload.series, byDuration ? ['start', 'duration'] : ['start', 'end'], options);
	const progress = new Map(pairSeries(payload.series, ['progress'], options).tuples
		.map(({ key, members }) => [key, members.progress.value]));

	return tuples
		.map(({ key, label, members }) => {
			const start = members.start.value;
			const end = byDuration ? start + members.duration.value : members.end.value;
			const done = progress.get(key);
			return { label, start, end, progress: typeof done === 'number' ? Math.min(100, Math.max(0, done)) : null };
		})
		.filter((task) => Number.isFinite(task.start) && Number.isFinite(task.end) && task.end >= task.start)
		.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
}

export function buildGanttOption(payload, context) {
	const tasks = ganttTasks(payload);
	const span = tasks.length ? Math.max(...tasks.map((task) => task.end)) - Math.min(...tasks.map((task) => task.start)) : 0;
	const withTime = span < 7 * 86400;

	return {
		...baseOption(context),
		legend: { show: false },
		grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
		xAxis: {
			type: 'value',
			scale: true,
			axisLine: { lineStyle: { color: context.theme.axisLine } },
			splitLine: { lineStyle: { color: context.theme.splitLine } },
			axisLabel: { color: context.theme.mutedText, hideOverlap: true, formatter: (value) => formatClock(value, context.timeZone, { time: withTime }) }
		},
		yAxis: { ...categoryAxis(context, tasks.map((task) => task.label)), inverse: true },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'item',
			formatter: (param) => {
				const task = tasks[param.dataIndex];
				return [
					`<b>${escapeHtml(task.label)}</b>`,
					`Start: <b>${escapeHtml(formatClock(task.start, context.timeZone))}</b>`,
					`End: <b>${escapeHtml(formatClock(task.end, context.timeZone))}</b>`,
					`Duration: <b>${escapeHtml(formatDuration(task.end - task.start))}</b>`,
					...(task.progress === null ? [] : [`Progress: <b>${escapeHtml(String(Math.round(task.progress * 10) / 10))}%</b>`])
				].join('<br>');
			}
		},
		series: [{
			type: 'custom',
			encode: { x: [1, 2], y: 0 },
			data: tasks.map((task, index) => [index, task.start, task.end, task.progress ?? -1]),
			renderItem: (params, api) => {
				const index = api.value(0);
				const from = api.coord([api.value(1), index]);
				const to = api.coord([api.value(2), index]);
				const height = api.size([0, 1])[1] * 0.6;
				const width = Math.max(to[0] - from[0], 2);
				const colour = context.theme.palette[index % context.theme.palette.length];
				const shape = { x: from[0], y: from[1] - height / 2, width, height };
				const children = [{ type: 'rect', shape, style: { fill: colour, opacity: 0.45 } }];
				const done = api.value(3);
				if (done >= 0) {
					children.push({ type: 'rect', shape: { ...shape, width: width * (done / 100) }, style: { fill: colour } });
				}
				else {
					children[0].style.opacity = 1;
				}
				return { type: 'group', children };
			}
		}]
	};
}

export default {
	id: 'gantt',
	buildOption: buildGanttOption
};
