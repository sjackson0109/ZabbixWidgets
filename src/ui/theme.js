/**
 * Colours for light and dark Zabbix themes. The series palette is the
 * Okabe-Ito colour-blind-safe set, extended with two neutral tones.
 */

const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#7F7F7F', '#000000', '#999999'];
const DARK_PALETTE = ['#56B4E9', '#E69F00', '#009E73', '#CC79A7', '#0072B2', '#D55E00', '#F0E442', '#BBBBBB', '#FFFFFF', '#888888'];

const THEMES = {
	light: {
		mode: 'light', text: '#1f2c33', mutedText: '#5c6d75', axisLine: '#acbbc2', splitLine: '#e6eaec', tooltipBackground: '#ffffff',
		stripe: 'rgba(0, 0, 0, 0.035)', hover: 'rgba(0, 114, 178, 0.08)', neutral: '#d9e1e5', palette: PALETTE
	},
	dark: {
		mode: 'dark', text: '#f2f2f2', mutedText: '#a4adb2', axisLine: '#5d6a70', splitLine: '#383f43', tooltipBackground: '#2b2b2b',
		stripe: 'rgba(255, 255, 255, 0.04)', hover: 'rgba(86, 180, 233, 0.12)', neutral: '#3c4549', palette: DARK_PALETTE
	}
};

function luminance(rgb) {
	const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb ?? '');
	if (match === null) {
		return null;
	}
	const [r, g, b] = match.slice(1).map(Number);
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Detects the active Zabbix theme from the widget's own rendered background,
 * which works for the built-in and high-contrast themes without relying on
 * theme names.
 */
export function detectTheme(element) {
	let node = element;
	while (node && node.nodeType === 1) {
		const background = getComputedStyle(node).backgroundColor;
		const value = luminance(background);
		if (value !== null && !/rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(background)) {
			return value < 0.5 ? THEMES.dark : THEMES.light;
		}
		node = node.parentElement;
	}
	return THEMES.light;
}

/** Theme colours as CSS custom properties on a DOM renderer's root element. */
export function applyThemeVariables(element, theme) {
	const variables = {
		'--zw-text': theme.text,
		'--zw-muted': theme.mutedText,
		'--zw-line': theme.splitLine,
		'--zw-axis': theme.axisLine,
		'--zw-stripe': theme.stripe,
		'--zw-hover': theme.hover,
		'--zw-neutral': theme.neutral,
		'--zw-surface': theme.tooltipBackground
	};
	for (const [name, value] of Object.entries(variables)) {
		element.style.setProperty(name, value);
	}
}

export function themeByName(name) {
	return THEMES[name] ?? THEMES.light;
}
