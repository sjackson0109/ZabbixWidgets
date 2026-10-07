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

describe('C27 Switch Port Panel', () => {
	const data = (config = {}) => {
		const raw = sample('switch_ports');
		return normalisePayload({ ...raw, config: { ...raw.config, ...config } });
	};
	const tile = (container, identity) => [...container.querySelectorAll('[data-zw-port]')].find((node) => decodeURIComponent(node.dataset.zwPort).endsWith(`\u0000${identity}`));
	const place = (node) => [node.style.getPropertyValue('grid-column'), node.style.getPropertyValue('grid-row')];

	it('draws one tile per port, port 1 top-left, 2 beneath it and 3 to its right', () => {
		const container = draw('switch_ports', data());
		expect(container.querySelectorAll('.zw-port')).toHaveLength(52);
		expect(place(tile(container, 'Gi1/0/1'))).toEqual(['1', '1']);
		expect(place(tile(container, 'Gi1/0/2'))).toEqual(['1', '2']);
		expect(place(tile(container, 'Gi1/0/3'))).toEqual(['2', '1']);
		expect(place(tile(container, 'Gi1/0/48'))).toEqual(['24', '2']);
		expect(texts(container, '.zw-port-group-name')).toEqual(['Access', 'Uplinks']);
	});

	it('keeps the arrangement when the widget is resized', () => {
		const container = draw('switch_ports', data());
		const before = [...container.querySelectorAll('.zw-port')].map(place);
		container.style.width = '300px';
		const after = draw('switch_ports', data());
		expect([...after.querySelectorAll('.zw-port')].map(place)).toEqual(before);
	});

	it('draws one row when asked', () => {
		const container = draw('switch_ports', data({ port_layout: 'single_row', port_grouping: 'none' }));
		const rows = new Set([...container.querySelectorAll('.zw-port')].map((node) => place(node)[1]));
		expect([...rows]).toEqual(['1']);
	});

	it('labels every tile for screen readers, not by colour alone', () => {
		const container = draw('switch_ports', data());
		expect(tile(container, 'Gi1/0/1').getAttribute('aria-label')).toBe('Gi1/0/1, operational status up, speed 1 Gbps');
		expect(tile(container, 'Gi1/0/14').getAttribute('aria-label')).toContain('administratively down');
		expect(tile(container, 'Gi1/0/14').classList.contains('zw-port-admin-down')).toBe(true);
		expect(tile(container, 'Gi1/0/14').querySelector('.zw-port-mark-admin')).not.toBeNull();
		expect(tile(container, 'Gi1/0/7').querySelector('.zw-port-mark-problem').textContent).toBe('!');
		expect(tile(container, 'Gi1/0/30').classList.contains('zw-port-unknown')).toBe(true);
	});

	it('shows an escaped tooltip in the fixed order with active problems', () => {
		const raw = sample('switch_ports');
		const alias = raw.series.find((entry) => entry.role === 'alias' && entry.tags[1].value === 'Gi1/0/7');
		alias.value = '<img src=x onerror=alert(1)>';
		const container = draw('switch_ports', normalisePayload(raw));
		tile(container, 'Gi1/0/7').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const tip = container.querySelector('.zw-port-tip');
		expect(tip.hidden).toBe(false);
		expect(tip.querySelector('img')).toBeNull();
		expect(texts(tip, 'th')).toEqual(['Interface', 'Host', 'Alias', 'Interface type', 'Operational status', 'Administrative status',
			'Negotiated speed', 'Inbound utilisation', 'Outbound utilisation', 'Problem severity']);
		expect(texts(tip, 'td')[2]).toBe('<img src=x onerror=alert(1)>');
		expect(texts(tip, 'li')).toEqual(['Average: Interface Gi1/0/7: Link down']);
	});

	it('moves between tiles with the arrow keys and keeps focus across refreshes', () => {
		const state = {};
		let container = draw('switch_ports', data(), state);
		const first = tile(container, 'Gi1/0/1');
		expect(first.tabIndex).toBe(0);
		first.focus();
		first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(tile(container, 'Gi1/0/2'));
		document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(document.activeElement).toBe(tile(container, 'Gi1/0/4'));
		const renderer = getRenderer('switch_ports');
		renderer.render(container, data(), { theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC', state });
		expect(document.activeElement).toBe(tile(container, 'Gi1/0/4'));
		container = document.body.firstChild;
		expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
	});

	it('opens ordinary Zabbix pages on click', () => {
		const container = draw('switch_ports', data({ port_click: 'latest' }));
		expect(tile(container, 'Gi1/0/1').tagName).toBe('A');
		expect(tile(container, 'Gi1/0/1').getAttribute('href')).toBe('zabbix.php?action=latest.view&hostids%5B%5D=3&name=Gi1%2F0%2F1&filter_set=1');
		const none = draw('switch_ports', data({ port_click: 'none' }));
		expect(tile(none, 'Gi1/0/1').tagName).toBe('DIV');
	});

	it('lists the speeds and marks on the panel in the legend', () => {
		const container = draw('switch_ports', data());
		const legend = texts(container, '.zw-port-legend-entry > span:last-child');
		expect(legend.slice(0, 4)).toEqual(['10M', '100M', '1G', '10G']);
		expect(legend).toContain('Unknown speed');
		expect(legend).toContain('Administratively down');
		expect(legend).toContain('Active problem');
	});

	it('draws a utilisation bar without hiding the fill', () => {
		const container = draw('switch_ports', data({ port_util_bar: 'max' }));
		const port = tile(container, 'Gi1/0/20');
		expect(port.querySelector('.zw-port-util > span').style.width).toBe('40%');
		expect(port.style.getPropertyValue('--zw-port-fill')).toBe('#56B4E9');
	});

	for (const theme of ['light', 'dark']) {
		it(`draws 128 ports in the ${theme} theme`, () => {
			const series = Array.from({ length: 128 }, (_, index) => item({
				role: 'oper', name: `Port ${index + 1}`, units: '', value_type: 3, value: '1', tags: [{ tag: 'interface', value: String(index + 1) }]
			}));
			const container = document.createElement('div');
			const started = performance.now();
			getRenderer('switch_ports').render(container, payload('switch_ports', { config: { port_identity: 'tag', port_tag: 'interface' }, series }),
				{ theme: themeByName(theme), showLegend: true, decimals: 2, timeZone: 'UTC', state: {} });
			expect(performance.now() - started).toBeLessThan(1500);
			expect(container.querySelectorAll('.zw-port')).toHaveLength(128);
			expect(container.firstChild.style.getPropertyValue('--zw-text')).toBe(themeByName(theme).text);
		});
	}
});
