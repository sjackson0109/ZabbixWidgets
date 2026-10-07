/**
 * C07 Candlestick / OHLC, in one of two modes:
 * - derived: candles from the history of one item per epoch-aligned period
 *   (open = first sample, high = maximum, low = minimum, close = last);
 * - explicit: four items supply open, high, low and close; in each period the
 *   last sample of each is used and periods missing any of them are skipped.
 *
 * Candles are always built from raw history, never from hourly trends, which
 * cannot give a true first or last value (see DataProvider::canUseTrends).
 *
 * Every period in the time range has a slot on the axis, so gaps in the data
 * stay visible instead of being closed up.
 */
import { baseOption, categoryAxis, formatClock, tooltipLine, valueAxis } from './common.js';
import { alignOhlc, deriveOhlc, parseBucket, periodBuckets } from '../data/aggregate.js';
import { escapeHtml } from '../utils/escape.js';

function historyOf(payload, role) {
	return payload.series.find((entry) => entry.role === role)?.history ?? [];
}

export function buildCandles(payload) {
	const bucket = parseBucket(payload.config.bucket);
	if (payload.config.ohlc_mode === 'explicit') {
		return alignOhlc({
			open: historyOf(payload, 'open'),
			high: historyOf(payload, 'high'),
			low: historyOf(payload, 'low'),
			close: historyOf(payload, 'close')
		}, bucket).candles;
	}
	return deriveOhlc(historyOf(payload, 'source'), bucket);
}

export function buildCandlestickOption(payload, context) {
	const bucket = parseBucket(payload.config.bucket);
	const explicit = payload.config.ohlc_mode === 'explicit';
	const units = payload.series.find((entry) => entry.role === (explicit ? 'close' : 'source'))?.units ?? '';
	const starts = periodBuckets(payload.timePeriod, bucket);
	const byStart = new Map(buildCandles(payload).map((candle) => [candle.start, candle]));
	const withTime = bucket < 86400;
	const labels = starts.map((start) => formatClock(start, context.timeZone, { time: withTime }));
	const up = context.theme.palette[2];
	const down = context.theme.palette[5];

	return {
		...baseOption(context),
		legend: { show: false },
		grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
		xAxis: categoryAxis(context, labels),
		yAxis: { ...valueAxis(context, units), scale: true },
		tooltip: {
			...baseOption(context).tooltip,
			trigger: 'axis',
			axisPointer: { type: 'cross' },
			formatter: (params) => {
				const candle = byStart.get(starts[params[0]?.dataIndex]);
				if (candle === undefined) {
					return `<b>${escapeHtml(params[0]?.name ?? '')}</b><br>no data`;
				}
				return [
					`<b>${escapeHtml(params[0].name)}</b>`,
					tooltipLine('', 'Open', candle.open, units, context.decimals),
					tooltipLine('', 'High', candle.high, units, context.decimals),
					tooltipLine('', 'Low', candle.low, units, context.decimals),
					tooltipLine('', 'Close', candle.close, units, context.decimals),
					...(candle.count === undefined ? [] : [`Samples: <b>${candle.count}</b>`])
				].join('<br>');
			}
		},
		series: [{
			type: 'candlestick',
			name: 'OHLC',
			itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
			data: starts.map((start) => {
				const candle = byStart.get(start);
				return candle === undefined ? '-' : [candle.open, candle.close, candle.low, candle.high];
			})
		}]
	};
}

export default {
	id: 'candlestick',
	buildOption: buildCandlestickOption
};
