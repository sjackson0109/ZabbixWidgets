/**
 * C16 Gauge: each value against a fixed scale, drawn as the fill level of an
 * upright tube (the default, like a tank, thermometer or pressure column),
 * a dial with a needle, a progress arc or a ring.
 *
 * Minimum and maximum are required settings (numbers or user macros, which
 * resolve per host); nothing is derived from the data. The fill is clamped
 * to the tube, while the label always shows the actual value and marks
 * values outside the scale. Thresholds colour the fill by the band the
 * value falls in and are drawn as a strip beside the tube (or as the
 * coloured rim of a dial). The style changes the drawing only: every style
 * reads the same values, scale, thresholds and target.
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

/**
 * Centre and radius (percentages) of each dial in a grid. The grid is the
 * one that gives the largest dials for the widget's shape (width / height),
 * and the radius leaves room for the title under each dial.
 */
export function dialLayout(count, aspect = 2) {
	const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 2;
	let best = null;
	for (let columns = 1; columns <= Math.max(1, count); columns++) {
		const rows = Math.max(1, Math.ceil(count / columns));
		// In units of the widget height: a cell is ratio / columns wide and 1 / rows high.
		const radius = Math.min((ratio / columns) * 0.45, (1 / rows) * 0.4);
		if (best === null || radius > best.radius + 1e-9) {
			best = { columns, rows, radius };
		}
	}
	const { columns, rows, radius } = best;
	// ECharts reads a percentage radius against half the smaller side.
	const percent = (radius / (Math.min(ratio, 1) / 2)) * 100;
	return Array.from({ length: count }, (_, index) => ({
		center: [`${((index % columns) + 0.5) * (100 / columns)}%`, `${(Math.floor(index / columns) + 0.5) * (100 / rows)}%`],
		radius: `${Math.round(percent * 10) / 10}%`
	}));
}

const DIAL_ANGLES = { dial: [210, -30], progress: [210, -30], ring: [90, -270] };

/** One ECharts gauge (two with a target) per value: dial, progress arc or ring. */
export function buildDialOption(payload, context, style) {
	const { config } = payload;
	const list = gauges(payload);
	const { theme } = context;
	const layout = dialLayout(list.length, context.aspect);
	const [startAngle, endAngle] = DIAL_ANGLES[style];
	const showValue = config.show_value !== false;
	const base = baseOption(context);

	const series = list.flatMap((gauge, index) => {
		const { min, max } = gauge.scale;
		const fill = gauge.colour ?? theme.palette[index % theme.palette.length];
		const rim = gauge.bands.length > 0
			? gauge.bands.map((band) => [band.to, band.colour])
			: [[1, theme.splitLine]];
		const width = style === 'dial' ? 10 : 14;
		const shared = {
			type: 'gauge',
			center: layout[index].center,
			radius: layout[index].radius,
			startAngle,
			endAngle,
			min,
			max
		};
		const main = {
			...shared,
			name: gauge.label,
			// The needle and arc stop at the scale ends; the value text shows the real value.
			data: [{ value: Math.min(max, Math.max(min, gauge.entry.value)), name: gauge.label }],
			axisLine: { lineStyle: { width, color: style === 'dial' ? rim : [[1, theme.splitLine]] } },
			progress: { show: style !== 'dial', width, roundCap: style === 'ring', itemStyle: { color: fill } },
			pointer: { show: style === 'dial', length: '62%', width: 4, itemStyle: { color: theme.text } },
			anchor: { show: style === 'dial', size: 8, itemStyle: { color: theme.text } },
			axisTick: { show: style === 'dial', distance: -width, length: 4, lineStyle: { color: theme.axisLine } },
			splitLine: { show: style === 'dial', distance: -width, length: width, lineStyle: { color: theme.axisLine, width: 1 } },
			axisLabel: {
				show: style === 'dial',
				distance: width + 6,
				color: theme.mutedText,
				fontSize: 10,
				formatter: (value) => formatValue(value, gauge.entry.units, 0)
			},
			title: { show: true, offsetCenter: [0, style === 'ring' ? '28%' : '78%'], color: theme.mutedText, fontSize: 12, overflow: 'truncate', width: 140 },
			detail: {
				show: showValue,
				offsetCenter: [0, style === 'ring' ? '-6%' : '42%'],
				valueAnimation: false,
				color: theme.text,
				fontSize: 16,
				fontWeight: 600,
				formatter: () => valueText(gauge, config, context.decimals)
			}
		};
		if (gauge.scale.target === null) {
			return [main];
		}
		// The target is a short mark across the rim, never a second needle that could be read as a value.
		const at = (Math.min(max, Math.max(min, gauge.scale.target)) - min) / (max - min);
		const half = 0.006;
		const target = {
			...shared,
			name: `${gauge.label} target`,
			silent: true,
			z: 3,
			data: [],
			axisLine: { lineStyle: { width: width + 6, color: [[Math.max(0, at - half), 'transparent'], [Math.min(1, at + half), theme.text], [1, 'transparent']] } },
			progress: { show: false },
			axisTick: { show: false },
			splitLine: { show: false },
			axisLabel: { show: false },
			title: { show: false },
			detail: { show: false },
			anchor: { show: false },
			pointer: { show: false }
		};
		return [main, target];
	});

	return {
		...base,
		legend: { show: false },
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const gauge = list.find((entry) => entry.label === param.seriesName) ?? list[Math.floor(param.seriesIndex / 2)];
				return gauge ? tooltipText(gauge, context) : '';
			}
		},
		series
	};
}

function tooltipText(gauge, context) {
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

export function buildLevelGaugeOption(payload, context) {
	const { config } = payload;
	if (config.gauge_style === 'dial' || config.gauge_style === 'progress' || config.gauge_style === 'ring') {
		return buildDialOption(payload, context, config.gauge_style);
	}
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
			formatter: (param) => tooltipText(list[param.dataIndex], context)
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
	buildOption: buildLevelGaugeOption,
	// Dials are arranged for the widget's shape, so a resize lays them out again.
	sizeDependent: true
};
