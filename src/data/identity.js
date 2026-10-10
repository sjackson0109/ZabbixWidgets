/**
 * Row identity for tables of discovered items: which items belong in the
 * same row. Identities come only from what the item itself carries (its key
 * parameters, its name, a tag, or a user's regular expression), always
 * within one host, so two hosts never share a row.
 */
import { tagValue } from './normalise.js';

/**
 * Splits an item key's parameters, honouring quoted parameters and nested
 * arrays: 'vfs.fs.size["/",pused]' gives ['/', 'pused'].
 */
export function keyParameters(key) {
	const open = key.indexOf('[');
	if (open === -1 || !key.endsWith(']')) {
		return [];
	}
	const body = key.slice(open + 1, -1);
	const params = [];
	let current = '';
	let quoted = false;
	let depth = 0;
	for (let index = 0; index < body.length; index++) {
		const char = body[index];
		if (quoted) {
			if (char === '\\' && body[index + 1] === '"') {
				current += '"';
				index++;
			}
			else if (char === '"') {
				quoted = false;
			}
			else {
				current += char;
			}
		}
		else if (char === '"' && current.trim() === '') {
			quoted = true;
			current = '';
		}
		else if (char === '[') {
			depth++;
			current += char;
		}
		else if (char === ']') {
			depth--;
			current += char;
		}
		else if (char === ',' && depth === 0) {
			params.push(current.trim());
			current = '';
		}
		else {
			current += char;
		}
	}
	params.push(current.trim());
	return params;
}

/**
 * Compiles the user's row expression; returns { regex, error }. The field's
 * name and an example capture go into the messages.
 */
export function compileRowExpression(text, { field = 'row expression', example = 'Interface (.+):' } = {}) {
	const source = String(text ?? '');
	if (source.trim() === '') {
		return { regex: null, error: `Enter a regular expression with a capture group, for example "${example}".` };
	}
	let regex;
	try {
		regex = new RegExp(source);
	}
	catch (exception) {
		return { regex: null, error: `The ${field} is not a valid regular expression: ${exception.message}.` };
	}
	// Counts groups by matching an empty alternative: one undefined slot per capture group.
	if (new RegExp(`${source}|`).exec('').length < 2) {
		return { regex: null, error: `The ${field} needs a capture group, for example "${example}".` };
	}
	return { regex, error: null };
}

/**
 * The identity text of one item under the chosen source, or null when the
 * item does not carry one. "name" uses the text matched by the wildcards of
 * the column pattern that matched the item.
 */
export function identityOf(series, source, { tag = '', regex = null, wildcardMatch = null } = {}) {
	switch (source) {
		case 'item':
			return series.itemid;
		case 'key': {
			const [first] = keyParameters(series.key);
			return first === undefined || first === '' ? null : first;
		}
		case 'name': {
			const parts = wildcardMatch?.slice(1).map((part) => part.trim()).filter((part) => part !== '') ?? [];
			return parts.length === 0 ? null : parts.join(' ');
		}
		case 'tag': {
			const value = tagValue(series.tags, tag);
			return value === null || value === '' ? null : value;
		}
		case 'regex': {
			const match = regex?.exec(series.name);
			const value = match?.slice(1).find((group) => group !== undefined && group !== '');
			return value === undefined ? null : value;
		}
		default:
			return null;
	}
}
