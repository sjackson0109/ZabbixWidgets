// @vitest-environment jsdom
/**
 * HTML renderers (kind "dom"): every sample payload passes its contract and
 * draws, and the C14 table sorts, filters, pages and keeps its state.
 */
import { describe, expect, it } from 'vitest';
import { listCharts } from '../../src/registry/index.js';
import { getRenderer } from '../../src/renderers/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { validate } from '../../src/validation/index.js';
import { themeByName } from '../../src/ui/theme.js';
import { sample } from '../fixtures/samples.js';
import { item, payload } from '../fixtures/payload.js';

const domCharts = listCharts().filter((chart) => getRenderer(chart.renderer)?.kind === 'dom');

function draw(chartId, data, state = {}) {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	const context = { theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC', state };
	getRenderer(chartId).render(container, data, context);
	return container;
}

const texts = (container, selector) => [...container.querySelectorAll(selector)].map((node) => node.textContent);

describe.each(domCharts.map((chart) => [chart.id, chart]))('%s', (id, chart) => {
	for (const theme of ['light', 'dark']) {
		it(`draws its sample payload in the ${theme} theme`, () => {
			const data = normalisePayload(sample(id));
			expect(validate(chart, data).errors).toEqual([]);
			const container = document.createElement('div');
			getRenderer(chart.renderer).render(container, data, { theme: themeByName(theme), showLegend: true, decimals: 2, timeZone: 'UTC', state: {} });
			expect(container.children.length).toBe(1);
			expect(container.textContent.length).toBeGreaterThan(20);
		});
	}
});

describe('C14 LLD data table', () => {
	const data = () => normalisePayload(sample('lld_table'));

	it('puts one row per interface and one column per pattern', () => {
		const container = draw('lld_table', data());
		expect(texts(container, 'thead th')).toEqual(['Host', 'interface', 'In', 'Out', 'Status', 'Last update', 'Problems']);
		const rows = [...container.querySelectorAll('tbody tr')].map((row) => texts(row, 'td'));
		expect(rows.map((row) => row[1])).toEqual(['eth0', 'eth1', 'eth2']);
		expect(rows[0][2]).toBe('1 Kbps +100 bps');
		expect(rows[2][4]).toBe('down (2)');
		expect(rows[2][6]).toBe('High');
		expect(rows[0][6]).toBe('OK');
	});

	it('sorts numbers as numbers, toggles direction and keeps the sort across refreshes', () => {
		const state = {};
		const series = ['2', '10', '9'].map((value, index) => item({ name: `Disk ${index}`, value, units: '' }));
		const table = payload('lld_table', { config: { row_identity: 'item', show_last_update: false }, series });
		let container = draw('lld_table', table, state);
		const header = () => [...container.querySelectorAll('thead button')].find((button) => button.textContent.startsWith('Value'));
		header().click();
		expect(texts(container, 'tbody tr td:nth-child(3)')).toEqual(['2', '9', '10']);
		header().click();
		expect(texts(container, 'tbody tr td:nth-child(3)')).toEqual(['10', '9', '2']);
		expect(state.sort).toEqual({ column: 'value:0', direction: 'desc' });
		container = draw('lld_table', table, state);
		expect(texts(container, 'tbody tr td:nth-child(3)')).toEqual(['10', '9', '2']);
	});

	it('pages at the configured size and lets the viewer change it', () => {
		const series = Array.from({ length: 60 }, (_, index) => item({ name: `Item ${String(index).padStart(2, '0')}`, value: String(index) }));
		const state = {};
		const container = draw('lld_table', payload('lld_table', { config: { row_identity: 'item', table_page_size: '25' }, series }), state);
		expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
		expect(container.querySelector('.zw-table-range').textContent).toBe('1–25 of 60');
		container.querySelector('[aria-label="Next page"]').click();
		container.querySelector('[aria-label="Next page"]').click();
		expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
		expect(container.querySelector('[aria-label="Next page"]').disabled).toBe(true);
		const select = container.querySelector('select');
		select.value = '100';
		select.dispatchEvent(new Event('change'));
		expect(container.querySelectorAll('tbody tr')).toHaveLength(60);
		expect(state.pageSize).toBe(100);
	});

	it('filters rows by text and keeps focus in the filter box', () => {
		const series = ['alpha', 'beta', 'gamma'].map((name) => item({ name, value: '1' }));
		const container = draw('lld_table', payload('lld_table', { config: { row_identity: 'item' }, series }));
		const search = container.querySelector('.zw-table-search');
		search.focus();
		search.value = 'ET';
		search.dispatchEvent(new Event('input'));
		expect(texts(container, 'tbody tr td:nth-child(2)')).toEqual(['beta']);
		expect(document.activeElement).toBe(container.querySelector('.zw-table-search'));
	});

	it('shows names as text, never as markup', () => {
		const container = draw('lld_table', payload('lld_table', { config: { row_identity: 'item' }, series: [item({ name: '<img src=x onerror=alert(1)>', value: '1' })] }));
		expect(container.querySelector('img')).toBeNull();
		expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
	});
});
