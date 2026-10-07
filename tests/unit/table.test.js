/** Row identity, value mappings, definitions and paging behind the C14 table. */
import { describe, expect, it } from 'vitest';
import { compileRowExpression, identityOf, keyParameters } from '../../src/data/identity.js';
import { mapValue } from '../../src/data/valuemap.js';
import { parseDefinitions, resolveList, resolveNumber, wildcard } from '../../src/data/patterns.js';
import { buildTable, cellView, compareValues, pageRows, PAGE_SIZES } from '../../src/data/table.js';
import { item, payload } from '../fixtures/payload.js';

describe('keyParameters', () => {
	it('splits parameters, unquotes them and keeps nested arrays whole', () => {
		expect(keyParameters('vfs.fs.size["/",pused]')).toEqual(['/', 'pused']);
		expect(keyParameters('net.if.in["eth0"]')).toEqual(['eth0']);
		expect(keyParameters('a[[1,2],"x,\\"y"]')).toEqual(['[1,2]', 'x,"y']);
		expect(keyParameters('system.uptime')).toEqual([]);
	});
});

describe('identityOf', () => {
	const entry = item({ name: 'Interface eth0: Bits received', key: 'net.if.in["eth0",bytes]', tags: [{ tag: 'interface', value: 'eth0' }] });

	it('takes the identity from the item, its key, its name, a tag or an expression', () => {
		expect(identityOf(entry, 'item')).toBe(entry.itemid);
		expect(identityOf(entry, 'key')).toBe('eth0');
		expect(identityOf(entry, 'name', { wildcardMatch: wildcard('Interface *: Bits received').exec(entry.name) })).toBe('eth0');
		expect(identityOf(entry, 'tag', { tag: 'interface' })).toBe('eth0');
		expect(identityOf(entry, 'regex', { regex: /^Interface (\S+):/ })).toBe('eth0');
	});

	it('returns null rather than guessing', () => {
		expect(identityOf(item({ key: 'system.cpu.load' }), 'key')).toBeNull();
		expect(identityOf(entry, 'tag', { tag: 'missing' })).toBeNull();
		expect(identityOf(entry, 'regex', { regex: /^Disk (\S+)/ })).toBeNull();
		expect(identityOf(entry, 'name', { wildcardMatch: wildcard('Interface eth0: Bits received').exec(entry.name) })).toBeNull();
	});

	it('requires a valid expression with a capture group', () => {
		expect(compileRowExpression('(').error).toMatch(/not a valid regular expression/);
		expect(compileRowExpression('Interface .+').error).toMatch(/capture group/);
		expect(compileRowExpression('').error).not.toBeNull();
		expect(compileRowExpression('Interface (.+):').error).toBeNull();
	});
});

describe('mapValue', () => {
	const mappings = [
		{ type: 2, value: '0', newvalue: 'negative or zero' },
		{ type: 0, value: '0', newvalue: 'zero' },
		{ type: 3, value: '1-5,10', newvalue: 'low' },
		{ type: 1, value: '100', newvalue: 'high' },
		{ type: 4, value: '^err', newvalue: 'error' },
		{ type: 5, value: '', newvalue: 'other' }
	];

	it('checks exact values first, then the others in order, then the default', () => {
		expect(mapValue(mappings, 0)).toBe('zero');
		expect(mapValue(mappings, -1)).toBe('negative or zero');
		expect(mapValue(mappings, 3)).toBe('low');
		expect(mapValue(mappings, 10)).toBe('low');
		expect(mapValue(mappings, 250)).toBe('high');
		expect(mapValue(mappings, 'error 5')).toBe('error');
		expect(mapValue(mappings, 50)).toBe('other');
	});

	it('leaves unmapped values alone', () => {
		expect(mapValue(null, 1)).toBeNull();
		expect(mapValue([{ type: 0, value: '1', newvalue: 'up' }], 2)).toBeNull();
		expect(mapValue([{ type: 0, value: '1', newvalue: 'up' }], '1.0')).toBe('up');
	});
});

describe('definitions and settings', () => {
	it('parses "Heading = pattern" lines and reports bad ones', () => {
		const { entries, errors } = parseDefinitions('# comment\nIn = Interface *: in\n\nOut=Interface *: out\n= nothing\nBare *');
		expect(entries.map(({ heading, pattern }) => [heading, pattern])).toEqual([['In', 'Interface *: in'], ['Out', 'Interface *: out'], ['Bare *', 'Bare *']]);
		expect(errors).toEqual([{ line: 5, text: '= nothing' }]);
	});

	it('matches whole names case-insensitively', () => {
		expect(wildcard('CPU *').test('cpu user')).toBe(true);
		expect(wildcard('CPU').test('CPU user')).toBe(false);
		expect(wildcard('a.b (c)').test('a.b (c)')).toBe(true);
	});

	it('resolves numbers and macros per host', () => {
		const host = { name: 'web01', macros: { '{$MAX}': '200' } };
		expect(resolveNumber('{$MAX}', host)).toEqual({ value: 200, error: null });
		expect(resolveNumber('{$MIN}', host).error).toBe('{$MIN} is not defined as a number on web01');
		expect(resolveNumber('', host)).toEqual({ value: null, error: null });
		expect(resolveNumber('high', host).error).toMatch(/not a number/);
		expect(resolveList('10, {$MAX}', host)).toEqual({ values: [10, 200], error: null });
		expect(resolveList('{$MAX}, 10', host).error).toMatch(/ascending/);
	});
});

describe('buildTable', () => {
	const config = { row_identity: 'tag', row_tag: 'if', table_columns: 'In = * in\nOut = * out' };
	const tags = (value) => [{ tag: 'if', value }];

	it('builds rows per host and identity', () => {
		const table = buildTable(payload('lld_table', { config, series: [
			item({ hostid: '2', host: 'b', name: 'eth0 in', value: '1', tags: tags('eth0') }),
			item({ hostid: '1', host: 'a', name: 'eth0 out', value: '2', tags: tags('eth0') }),
			item({ hostid: '1', host: 'a', name: 'eth0 in', value: '3', tags: tags('eth0') })
		] }));
		expect(table.rows.map((row) => [row.host, row.label, row.cells.map((cell) => cell?.value ?? null)]))
			.toEqual([['a', 'eth0', [3, 2]], ['b', 'eth0', [1, null]]]);
	});

	it('reports collisions, unmatched items and items without identity', () => {
		const table = buildTable(payload('lld_table', { config, series: [
			item({ name: 'eth0 in', tags: tags('eth0') }), item({ name: 'eth0 in', tags: tags('eth0') }),
			item({ name: 'eth0 errors', tags: tags('eth0') }), item({ name: 'eth1 in' })
		] }));
		expect(table.collisions).toHaveLength(1);
		expect(table.unmatched.map((entry) => entry.name)).toEqual(['eth0 errors']);
		expect(table.unresolved.map((entry) => entry.name)).toEqual(['eth1 in']);
	});

	it('shows mapped values with the raw value, and the change since the previous value', () => {
		const [status] = payload('lld_table', { series: [item({ value: '1', units: '', value_type: 3, valuemap: [{ type: 0, value: '1', newvalue: 'up' }] })] }).series;
		expect(cellView(status).text).toBe('up (1)');
		expect(cellView(status, { useValuemap: false }).text).toBe('1');
		const [traffic] = payload('lld_table', { series: [item({ value: '1500', units: 'B', previous: { value: '2000', clock: 1 } })] }).series;
		expect(cellView(traffic, { showChange: true }).change).toEqual({ delta: -500, text: '-500 B' });
		expect(cellView(null).sort).toBeNull();
	});
});

describe('pageRows', () => {
	const rows = Array.from({ length: 101 }, (_, index) => ({ id: index, value: index % 7 === 0 ? null : index % 10 }));
	const options = { sortValue: (row) => row.value, text: (row) => String(row.id) };

	it('offers only the documented page sizes, defaulting to 25', () => {
		expect(PAGE_SIZES).toEqual([10, 25, 50, 100]);
		expect(pageRows(rows, { ...options, pageSize: 1000 }).rows).toHaveLength(25);
		expect(pageRows(rows, { ...options, pageSize: 100 }).rows).toHaveLength(100);
	});

	it('clamps the page to the rows available', () => {
		const view = pageRows(rows, { ...options, page: 99, pageSize: 50 });
		expect([view.page, view.pages, view.first, view.last, view.rows.length]).toEqual([3, 3, 101, 101, 1]);
		expect(pageRows([], options)).toMatchObject({ page: 1, pages: 1, first: 0, last: 0, total: 0 });
	});

	it('sorts stably with missing values last in both directions', () => {
		for (const direction of ['asc', 'desc']) {
			const sorted = pageRows(rows, { ...options, sort: { column: 'v', direction }, pageSize: 100 }).rows;
			const values = sorted.map((row) => row.value);
			const firstMissing = values.indexOf(null);
			expect(firstMissing).toBeGreaterThan(0);
			expect(values.slice(firstMissing).every((value) => value === null)).toBe(true);
			const present = values.filter((value) => value !== null);
			expect(present).toEqual([...present].sort((a, b) => (direction === 'asc' ? a - b : b - a)));
			const equal = sorted.filter((row) => row.value === 1).map((row) => row.id);
			expect(equal).toEqual([...equal].sort((a, b) => a - b));
		}
		expect(compareValues(null, 1, 'desc')).toBe(1);
		expect(compareValues('item 10', 'item 9', 'asc')).toBeGreaterThan(0);
	});
});
