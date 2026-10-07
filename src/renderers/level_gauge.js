/**
 * C16 Vertical Level Gauge: each value as the fill level of an upright
 * tube, like a tank, thermometer or pressure column.
 *
 * Minimum and maximum are required settings (numbers or user macros, which
 * resolve per host); nothing is derived from the data. The fill is clamped
 * to the tube, while the label always shows the actual value and marks
 * values outside the scale. Thresholds colour the fill by the band the
 * value falls in and are drawn as a strip beside the tube.
 */
import { baseOption, seriesLabels } from './common.js';
import { bandColours, bandIndex, resolveScale } from '../data/thresholds.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const SEGMENT = 6;
const SEGMENT_GAP = 2;

export function gauges(payload) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value' && typeof entry.value === 'number');
	const labels = seriesLabels(series);
	const hosts = new Map(payload.hosts.map((host) => [host.hostid, host]));

	return series.map((entry, index) => {
		const scale = resolveScale(config, hosts.get(entry.hostid) ?? null);
		const span = scale.max - scale.min;
		const fraction = (value) => (value - scale.min) / span;
		const colours = bandColours(scale.thresholds.length + 1, config.threshold_order);
		return {
			entry,
			label: labels[index],
			scale,
			level: Math.min(1, Math.max(0, fraction(entry.value))),
			above: entry.value > scale.max,
			below: entry.value < scale.min,
			target: scale.target === null ? null : Math.min(1, Math.max(0, fraction(scale.target))),
			percent: fraction(entry.value) * 100,
			colour: scale.thresholds.length > 0 ? colours[bandIndex(entry.value, scale.thresholds)] : null,
			bands: scale.thresholds.length === 0 ? [] : [scale.min, ...scale.thresholds, scale.max].slice(1).map((end, band, ends) => ({
				from: Math.min(1, Math.max(0, fraction(band === 0 ? scale.min : ends[band - 1]))),
				to: Math.min(1, Math.max(0, fraction(end))),
				colour: colours[band]
			}))
		};
	});
}

function valueText(gauge, config, decimals) {
	const text = config.gauge_display === 'percent'
		? `${formatValue(gauge.percent, '', 1)}%`
		: formatValue(gauge.entry.value, gauge.entry.units, decimals);
	return gauge.above ? `▲ ${text}` : gauge.below ? `▼ ${text}` : text;
}

export function buildLevelGaugeOption(payload, context) {
	const { config } = payload;
	const list = gauges(payload);
	const { theme } = context;
	const showValue = config.show_value !== false;

	const renderItem = (params, api) => {
		const gauge = list[params.dataIndex];
		const [x, bottom] = api.coord([params.dataIndex, 0]);
		const [, top] = api.coord([params.dataIndex, 1]);
		const slot = api.size([1, 0])[0];
		const width = Math.max(10, Math.min(slot * 0.4, 56));
		const left = x - width / 2;
		const height = bottom - top;
		const y = (fraction) => bottom - fraction * height;
		const fill = gauge.colour ?? theme.palette[params.dataIndex % theme.palette.length];
		const children = [{
			type: 'rect',
			shape: { x: left, y: top, width, height, r: Math.min(6, width / 4) },
			style: { fill: theme.splitLine, stroke: theme.axisLine, lineWidth: 1 }
		}];

		for (const band of gauge.bands) {
			children.push({
				type: 'rect',
				shape: { x: left + width + 3, y: y(band.to), width: 5, height: Math.max(0, y(band.from) - y(band.to)) },
				style: { fill: band.colour }
			});
		}

		const level = y(gauge.level);
		if (config.gauge_segmented) {
			for (let start = bottom - SEGMENT; start >= level - 0.5; start -= SEGMENT + SEGMENT_GAP) {
				children.push({ type: 'rect', shape: { x: left + 2, y: start, width: width - 4, height: SEGMENT }, style: { fill } });
			}
		}
		else if (gauge.level > 0) {
			children.push({ type: 'rect', shape: { x: left + 2, y: level, width: width - 4, height: bottom - level - 1, r: [0, 0, 4, 4] }, style: { fill } });
		}

		if (gauge.target !== null) {
			children.push({
				type: 'line',
				shape: { x1: left - 5, y1: y(gauge.target), x2: left + width + 5, y2: y(gauge.target) },
				style: { stroke: theme.text, lineWidth: 2 }
			});
		}

		if (showValue) {
			children.push({
				type: 'text',
				style: {
					x,
					y: top - 6,
					text: valueText(gauge, config, context.decimals),
					fill: theme.text,
					font: '600 13px sans-serif',
					align: 'center',
					verticalAlign: 'bottom'
				}
			});
		}
		return { type: 'group', children };
	};

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 16, right: 16, top: showValue ? 28 : 12, bottom: 8, containLabel: true },
		xAxis: {
			type: 'category',
			data: list.map((gauge) => gauge.label),
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel: { color: theme.text, interval: 0, overflow: 'truncate', width: 120, hideOverlap: false }
		},
		yAxis: { type: 'value', min: 0, max: 1, show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const gauge = list[param.dataIndex];
				const units = gauge.entry.units;
				const format = (value) => formatValue(value, units, context.decimals);
				const lines = [
					`<b>${escapeHtml(gauge.label)}</b>`,
					`Value: <b>${escapeHtml(format(gauge.entry.value))}</b> (${escapeHtml(formatValue(gauge.percent, '', 1))}% of scale)`,
					`Scale: ${escapeHtml(format(gauge.scale.min))} – ${escapeHtml(format(gauge.scale.max))}`
				];
				if (gauge.scale.target !== null) {
					lines.push(`Target: ${escapeHtml(format(gauge.scale.target))}`);
				}
				if (gauge.scale.thresholds.length > 0) {
					lines.push(`Thresholds: ${escapeHtml(gauge.scale.thresholds.map(format).join(', '))}`);
				}
				if (gauge.above || gauge.below) {
					lines.push(gauge.above ? 'Above the maximum' : 'Below the minimum');
				}
				return lines.join('<br>');
			}
		},
		series: [{
			type: 'custom',
			renderItem,
			clip: false,
			data: list.map((gauge, index) => [index, gauge.level])
		}]
	};
}

export default {
	id: 'level_gauge',
	buildOption: buildLevelGaugeOption
};
