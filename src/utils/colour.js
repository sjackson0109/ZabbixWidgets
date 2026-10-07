/** Colour helpers shared by renderers that colour their own elements. */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for "#rgb" and "#rrggbb" colours, the only form user settings accept. */
export function isHexColour(text) {
	return HEX.test(String(text ?? '').trim());
}

function channels(colour) {
	if (!isHexColour(colour)) {
		return null;
	}
	let hex = colour.trim().slice(1);
	if (hex.length === 3) {
		hex = [...hex].map((digit) => digit + digit).join('');
	}
	const value = parseInt(hex, 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Text colour that stays readable on a background colour, or null for colours it cannot read. */
export function readableText(colour) {
	const rgb = channels(colour);
	if (rgb === null) {
		return null;
	}
	const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
	return luminance > 0.55 ? '#1f2c33' : '#ffffff';
}

/** A hex colour as rgba() with the given opacity. */
export function withAlpha(colour, alpha) {
	const rgb = channels(colour) ?? [128, 128, 128];
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
