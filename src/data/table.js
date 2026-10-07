/**
 * Builds the rows of the LLD data table (C14) from discovered items that
 * already exist in Zabbix. Each item lands in one column (the first column
 * pattern its name matches) and one row (its host plus its row identity).
 * Nothing is merged or guessed: items that match no column, carry no
 * identity, or collide with another item in the same cell are reported.
 */
import { compileRowExpression, identityOf } from './identity.js';
import { parseDefinitions } from './patterns.js';
import { mapValue } from './valuemap.js';
import { formatValue } from './units.js';

/** Most rows a table page shows; the page size is one of these. */
export const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);
export const DEFAULT_PAGE_SIZE = 25;

const ROW_HEADINGS = { item: 'Item', key: 'Key parameter', name: 'Name', regex: 'Match' };

export function tableColumns(config) {
	const { entries } = parseDefinitions(config.table_columns);
	return entries.length > 0 ? entries : parseDefinitions('Value = *').entries;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareText(a, b) {
	return collator.compare(String(a), String(b));
}

/**
 * Rows, columns and the items that could not be placed.
 * Returns { columns, rows, unmatched, unresolved, collisions, rowHeading, error }.
 */
export function buildTable(payload) {
	const { config } = payload;
	const source = config.row_identity ?? 'item';
	const columns = tableColumns(config);
	const expression = source === 'regex' ? compileRowExpression(config.row_regex) : { regex: null, error: null };
	const tag = String(config.row_tag ?? '').trim();
	const rowHeading = String(config.row_heading ?? '').trim() || (source === 'tag' ? (tag || 'Tag') : ROW_HEADINGS[source] ?? 'Row');

	const rows = new Map();
	const unmatched = [];
	const unresolved = [];
	const collisions = [];

	if (expression.error !== null) {
		return { columns, rows: [], unmatched, unresolved, collisions, rowHeading, error: expression.error };
	}

	const ordered = payload.series
		.filter((entry) => entry.role === 'value')
		.sort((a, b) => Number(a.itemid) - Number(b.itemid));

	for (const entry of ordered) {
		let match = null;
		const column = columns.findIndex((candidate) => (match = candidate.regex.exec(entry.name)) !== null);
		if (column === -1) {
			unmatched.push(entry);
			continue;
		}
		const identity = identityOf(entry, source, { tag, regex: expression.regex, wildcardMatch: match });
		if (identity === null) {
			unresolved.push(entry);
			continue;
		}
		const key = `${entry.hostid}\u0000${identity}`;
		if (!rows.has(key)) {
			rows.set(key, {
				key,
				hostid: entry.hostid,
				host: entry.host,
				label: source === 'item' ? entry.name : identity,
				cells: columns.map(() => null)
			});
		}
		const row = rows.get(key);
		if (row.cells[column] !== null) {
			collisions.push({ row, column: columns[column].heading, items: [row.cells[column], entry] });
			continue;
		}
		row.cells[column] = entry;
	}

	const list = [...rows.values()].map((row) => {
		const items = row.cells.filter(Boolean);
		const problems = items.flatMap((item) => item.problems);
		const clocks = items.map((item) => item.clock).filter((clock) => clock !== null);
		return {
			...row,
			updated: clocks.length > 0 ? Math.max(...clocks) : null,
			problems,
			severity: problems.length > 0 ? Math.max(...problems.map((problem) => problem.severity)) : null
		};
	});
	list.sort((a, b) => compareText(a.host, b.host) || compareText(a.label, b.label) || compareText(a.hostid, b.hostid));

	return { columns, rows: list, unmatched, unresolved, collisions, rowHeading, error: null };
}

/**
 * What one cell shows and how it sorts. Numbers sort as numbers (a mapped
 * number by its raw value), text as text, and missing values last.
 */
export function cellView(entry, { useValuemap = true, decimals = 2, showChange = false } = {}) {
	if (entry === null) {
		return { text: '', sort: null, title: '', change: null };
	}
	if (entry.value === null) {
		return { text: 'no data', sort: null, title: entry.name, change: null, missing: true };
	}
	const mapped = useValuemap ? mapValue(entry.valuemap, entry.value) : null;
	const raw = entry.numeric ? formatValue(entry.value, entry.units, decimals) : String(entry.value);
	const text = mapped === null ? raw : `${mapped} (${entry.numeric ? String(entry.value) : raw})`;

	let change = null;
	if (showChange && entry.numeric && typeof entry.previous?.value === 'number') {
		const delta = entry.value - entry.previous.value;
		change = { delta, text: delta === 0 ? '0' : `${delta > 0 ? '+' : '-'}${formatValue(Math.abs(delta), entry.units, decimals)}` };
	}
	return { text, sort: entry.value, title: entry.name, change };
}

/** Sort comparator for two sort values; null (no data) always goes last. */
export function compareValues(a, b, direction) {
	if (a === null || a === undefined) {
		return b === null || b === undefined ? 0 : 1;
	}
	if (b === null || b === undefined) {
		return -1;
	}
	const order = typeof a === 'number' && typeof b === 'number' ? a - b : compareText(a, b);
	return direction === 'desc' ? -order : order;
}

/**
 * Filters, sorts and pages rows. sortValue(row, column) gives the value a
 * column sorts by and text(row) the searchable text. Sorting is stable: rows
 * with equal values keep their default order.
 */
export function pageRows(rows, { search = '', sort = null, page = 1, pageSize = DEFAULT_PAGE_SIZE, sortValue, text }) {
	const query = search.trim().toLowerCase();
	const filtered = query === '' ? rows : rows.filter((row) => text(row).toLowerCase().includes(query));
	const sorted = sort === null
		? filtered
		: filtered
			.map((row, index) => ({ row, index }))
			.sort((a, b) => compareValues(sortValue(a.row, sort.column), sortValue(b.row, sort.column), sort.direction) || a.index - b.index)
			.map(({ row }) => row);
	const size = PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
	const pages = Math.max(1, Math.ceil(sorted.length / size));
	const current = Math.min(Math.max(1, page), pages);
	return {
		rows: sorted.slice((current - 1) * size, current * size),
		total: sorted.length,
		page: current,
		pages,
		pageSize: size,
		first: sorted.length === 0 ? 0 : (current - 1) * size + 1,
		last: Math.min(current * size, sorted.length)
	};
}
