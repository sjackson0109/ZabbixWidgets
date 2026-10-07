/**
 * Value and unit formatting following the conventions described in the Zabbix
 * item documentation: SI prefixes for most units, 1024-based prefixes for
 * bytes, no scaling for a small set of units, and "!" to suppress conversion.
 */

const SI_PREFIXES = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
const BINARY_UNITS = new Set(['B', 'Bps']);
const UNSCALED_UNITS = new Set(['%', 'ms', 'rpm', 'RPM']);

export function isRawUnit(units) {
	return typeof units === 'string' && units.startsWith('!');
}

/** Units with the "!" suppression marker removed, for display and comparison. */
export function displayUnits(units) {
	return isRawUnit(units) ? units.slice(1) : (units ?? '');
}

function round(value, decimals) {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function formatNumber(value, decimals) {
	return round(value, decimals).toLocaleString('en-US', {
		maximumFractionDigits: decimals,
		useGrouping: false
	});
}

export function formatDuration(totalSeconds) {
	if (!Number.isFinite(totalSeconds)) {
		return '';
	}
	const negative = totalSeconds < 0;
	let seconds = Math.abs(totalSeconds);
	const parts = [];
	const steps = [['d', 86400], ['h', 3600], ['m', 60]];

	for (const [label, size] of steps) {
		if (seconds >= size) {
			parts.push(`${Math.floor(seconds / size)}${label}`);
			seconds %= size;
		}
	}
	if (parts.length < 3 && (seconds > 0 || parts.length === 0)) {
		parts.push(`${round(seconds, seconds < 1 ? 3 : 0)}s`);
	}
	return (negative ? '-' : '') + parts.slice(0, 3).join(' ');
}

/**
 * Scales a numeric value with a unit prefix. Returns the scaled number and the
 * unit string so charts can put numbers on axes and units in labels.
 */
export function scaleValue(value, units) {
	const unit = displayUnits(units);

	if (!Number.isFinite(value) || unit === '' || isRawUnit(units) || UNSCALED_UNITS.has(unit)
			|| unit === 'unixtime' || unit === 'uptime' || unit === 's') {
		return { value, prefix: '', units: unit };
	}

	const base = BINARY_UNITS.has(unit) ? 1024 : 1000;
	let index = 0;
	let scaled = Math.abs(value);

	while (scaled >= base && index < SI_PREFIXES.length - 1) {
		scaled /= base;
		index++;
	}

	return {
		value: Math.sign(value) * scaled,
		prefix: SI_PREFIXES[index],
		units: unit
	};
}

export function formatValue(value, units = '', decimals = 2) {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value !== 'number') {
		return String(value);
	}
	if (!Number.isFinite(value)) {
		return String(value);
	}

	const unit = displayUnits(units);

	if (unit === 'unixtime' && !isRawUnit(units)) {
		return new Date(value * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
	}
	if ((unit === 'uptime' || unit === 's') && !isRawUnit(units)) {
		return formatDuration(value);
	}

	const scaled = scaleValue(value, units);
	const suffix = `${scaled.prefix}${scaled.units}`;
	return suffix === '' ? formatNumber(scaled.value, decimals) : `${formatNumber(scaled.value, decimals)} ${suffix}`;
}
