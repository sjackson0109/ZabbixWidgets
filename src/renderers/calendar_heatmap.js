/**
 * C13 Calendar Heat Map: one cell per calendar day in the dashboard time
 * period, coloured by an aggregate (average, sum, minimum, maximum or count)
 * of the item's real history for that day. Days are calendar days in the
 * user's Zabbix time zone. Days without samples are left blank.
 */
import { baseOption, colourScale } from './common.js';
import { aggregateByDay, calendarDate } from '../data/aggregate.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const FUNCTION_NAMES = { avg: 'Average', sum: 'Sum', min: 'Minimum', max: 'Maximum', count: 'Count' };

export function calendarDays(payload, context) {
	const entry = payload.series.find((series) => series.role === 'value');
	const fn = payload.config.aggregation ?? 'avg';
	return entry === undefined ? [] : aggregateByDay(entry.history, fn, context.timeZone)
		.filter((day) => day.value !== null);
}

export function buildCalendarHeatmapOption(payload, context) {
	const entry = payload.series.find((series) => series.role === 'value');
	const fn = payload.config.aggregation ?? 'avg';
	const units = fn === 'count' ? '' : (entry?.units ?? '');
	const days = calendarDays(payload, context);
	const byDate = new Map(days.map((day) => [day.date, day]));
	const period = payload.timePeriod;
	const range = period === null
		? [days[0]?.date, days[days.length - 1]?.date]
		: [calendarDate(period.from, context.timeZone), calendarDate(period.to, context.timeZone)];

	return {
		...baseOption(context),
		legend: { show: false },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'item',
			formatter: (param) => {
				const day = byDate.get(param.value[0]);
				return [
					`<b>${escapeHtml(param.value[0])}</b>`,
					`${FUNCTION_NAMES[fn] ?? fn}: <b>${escapeHtml(formatValue(day.value, units, context.decimals))}</b>`,
					`Samples: <b>${day.count}</b>`
				].join('<br>');
			}
		},
		visualMap: colourScale(context, days.map((day) => day.value), { units }),
		calendar: {
			range,
			top: 32,
			left: 40,
			right: 16,
			bottom: 56,
			cellSize: ['auto', 'auto'],
			orient: 'horizontal',
			splitLine: { lineStyle: { color: context.theme.axisLine } },
			itemStyle: { color: 'transparent', borderColor: context.theme.splitLine },
			dayLabel: { color: context.theme.mutedText, firstDay: 1 },
			monthLabel: { color: context.theme.mutedText },
			yearLabel: { show: false }
		},
		series: [{
			type: 'heatmap',
			coordinateSystem: 'calendar',
			data: days.map((day) => [day.date, day.value])
		}]
	};
}

export default {
	id: 'calendar_heatmap',
	buildOption: buildCalendarHeatmapOption
};
