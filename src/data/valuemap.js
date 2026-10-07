/**
 * Applies a Zabbix value mapping to a value, following the mapping types
 * Zabbix offers: equals, is greater or equals, is less or equals, in range,
 * regular expression and default.
 *
 * Exact matches are checked first, then the other mappings in their listed
 * order, and the default mapping only when nothing else matched. The result
 * is the mapped text, or null when the value is not mapped.
 */
import { toNumber } from './normalise.js';

export const MAPPING_TYPE = Object.freeze({ EQUAL: 0, GREATER_OR_EQUAL: 1, LESS_OR_EQUAL: 2, RANGE: 3, REGEXP: 4, DEFAULT: 5 });

function inRanges(number, text) {
	return String(text).split(',').some((part) => {
		const match = /^\s*(-?[\d.eE+]+)\s*(?:-\s*(-?[\d.eE+]+)\s*)?$/.exec(part);
		if (match === null) {
			return false;
		}
		const low = toNumber(match[1]);
		const high = match[2] === undefined ? low : toNumber(match[2]);
		return low !== null && high !== null && number >= low && number <= high;
	});
}

function matches(mapping, raw, number) {
	switch (mapping.type) {
		case MAPPING_TYPE.GREATER_OR_EQUAL:
			return number !== null && toNumber(mapping.value) !== null && number >= toNumber(mapping.value);
		case MAPPING_TYPE.LESS_OR_EQUAL:
			return number !== null && toNumber(mapping.value) !== null && number <= toNumber(mapping.value);
		case MAPPING_TYPE.RANGE:
			return number !== null && inRanges(number, mapping.value);
		case MAPPING_TYPE.REGEXP:
			try {
				return new RegExp(mapping.value).test(raw);
			}
			catch {
				return false;
			}
		default:
			return false;
	}
}

/**
 * The mapped text for a value, or null. Numeric values compare as numbers
 * for "equals" too, so 1 and "1.0" map alike for numeric items.
 */
export function mapValue(mappings, value) {
	if (!Array.isArray(mappings) || mappings.length === 0 || value === null || value === undefined) {
		return null;
	}
	const raw = String(value);
	const number = typeof value === 'number' ? value : toNumber(raw);

	const exact = mappings.find((mapping) => mapping.type === MAPPING_TYPE.EQUAL
		&& (mapping.value === raw || (number !== null && toNumber(mapping.value) === number)));
	if (exact !== undefined) {
		return exact.newvalue;
	}
	const other = mappings.find((mapping) => matches(mapping, raw, number));
	if (other !== undefined) {
		return other.newvalue;
	}
	return mappings.find((mapping) => mapping.type === MAPPING_TYPE.DEFAULT)?.newvalue ?? null;
}
