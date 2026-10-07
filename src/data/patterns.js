/**
 * User-written definitions shared by several charts: wildcard name patterns
 * ("Interface *: Bits received"), "Heading = pattern" lines and lists of
 * values that may name user macros.
 */
import { toNumber } from './normalise.js';

const MACRO = /^\{\$[A-Z0-9_.]+(?::[^}]*)?\}$/;

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a wildcard pattern. The whole name must match, case-insensitively,
 * and each "*" matches any text and captures it.
 */
export function wildcard(pattern) {
	const source = String(pattern).trim().split('*').map(escapeRegExp).join('(.*?)');
	return new RegExp(`^${source}$`, 'is');
}

/**
 * Parses "Heading = pattern" lines. Blank lines and lines starting with "#"
 * are skipped; a line without "=" uses the pattern as its heading.
 * Returns { entries: [{ heading, pattern, regex }], errors: [{ line, text }] }.
 */
export function parseDefinitions(text) {
	const entries = [];
	const errors = [];
	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		const separator = line.indexOf('=');
		const heading = (separator === -1 ? line : line.slice(0, separator)).trim();
		const pattern = (separator === -1 ? line : line.slice(separator + 1)).trim();
		if (heading === '' || pattern === '') {
			errors.push({ line: index + 1, text: line });
			return;
		}
		entries.push({ heading, pattern, regex: wildcard(pattern) });
	});
	return { entries, errors };
}

export function isMacro(text) {
	return MACRO.test(String(text ?? '').trim());
}

/**
 * Resolves a setting that holds a number or a user macro, for one host.
 * Returns { value, error }: an empty setting gives a null value and no error.
 */
export function resolveNumber(text, host) {
	const trimmed = String(text ?? '').trim();
	if (trimmed === '') {
		return { value: null, error: null };
	}
	if (isMacro(trimmed)) {
		const value = toNumber(host?.macros?.[trimmed]);
		return value === null
			? { value: null, error: `${trimmed} is not defined as a number${host ? ` on ${host.name}` : ''}` }
			: { value, error: null };
	}
	const value = toNumber(trimmed);
	return value === null ? { value: null, error: `"${trimmed}" is not a number or a user macro` } : { value, error: null };
}

/**
 * Resolves a comma-separated list of numbers or macros, which must ascend.
 * Returns { values, error }.
 */
export function resolveList(text, host) {
	const parts = String(text ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
	const values = [];
	for (const part of parts) {
		const { value, error } = resolveNumber(part, host);
		if (error !== null) {
			return { values: [], error };
		}
		values.push(value);
	}
	if (values.some((value, index) => index > 0 && value <= values[index - 1])) {
		return { values: [], error: 'thresholds must be in ascending order' };
	}
	return { values, error: null };
}
