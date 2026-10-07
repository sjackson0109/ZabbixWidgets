import { escapeHtml } from '../utils/escape.js';
import { displayUnits, formatValue } from '../data/units.js';

/** Base option shared by every renderer. */
export function baseOption(context) {
	const { theme } = context;
	return {
		color: theme.palette,
		backgroundColor: 'transparent',
		textStyle: { color: theme.text },
		aria: { enabled: true },
		animation: false,
		tooltip: {
			confine: true,
			backgroundColor: theme.tooltipBackground,
			borderColor: theme.axisLine,
			textStyle: { color: theme.text }
		},
		legend: context.showLegend
			? { show: true, type: 'scroll', bottom: 0, textStyle: { color: theme.text } }
			: { show: false }
	};
}

export function valueAxis(context, units) {
	return {
		type: 'value',
		axisLine: { lineStyle: { color: context.theme.axisLine } },
		splitLine: { lineStyle: { color: context.theme.splitLine } },
		axisLabel: { color: context.theme.mutedText, formatter: (value) => formatValue(value, units, context.decimals) }
	};
}

export function categoryAxis(context, categories) {
	return {
		type: 'category',
		data: categories,
		axisLine: { lineStyle: { color: context.theme.axisLine } },
		axisLabel: { color: context.theme.mutedText, hideOverlap: true }
	};
}

/** Units shared by every series, or null when they differ. */
export function commonUnits(series) {
	const units = [...new Set(series.map((entry) => displayUnits(entry.units)))];
	return units.length === 1 ? series[0].units : null;
}

/** One escaped tooltip line: marker, label and formatted value. */
export function tooltipLine(marker, label, value, units, decimals) {
	const formatted = value === null || value === undefined ? 'no data' : formatValue(value, units, decimals);
	return `${marker ?? ''}${escapeHtml(label)}: <b>${escapeHtml(formatted)}</b>`;
}
