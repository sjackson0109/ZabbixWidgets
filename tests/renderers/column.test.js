import { describe, expect, it } from 'vitest';
import { buildColumnOption, groupSeries } from '../../src/renderers/column.js';
import { themeByName } from '../../src/ui/theme.js';
import { item, payload } from '../fixtures/payload.js';

const context = { theme: themeByName('light'), showLegend: true, decimals: 2 };

describe('column renderer', () => {
	const data = payload('column', {
		config: { group_by: 'host' },
		series: [
			item({ hostid: '1', host: 'web01', name: 'CPU', key: 'cpu', value: '40' }),
			item({ hostid: '2', host: 'web02', name: 'CPU', key: 'cpu', value: '-5' }),
			item({ hostid: '1', host: 'web01', name: 'Memory', key: 'mem', value: '70' })
		]
	});

	it('groups by host with one series per item and leaves gaps for missing items', () => {
		const option = buildColumnOption(data, context);
		expect(option.xAxis.data).toEqual(['web01', 'web02']);
		expect(option.series.map((series) => series.name)).toEqual(['CPU', 'Memory']);
		expect(option.series[0].data).toEqual([40, -5]);
		expect(option.series[1].data).toEqual([70, null]);
	});

	it('groups by item when asked', () => {
		const { categories, groups } = groupSeries(data.series, 'item');
		expect(categories).toEqual(['CPU', 'Memory']);
		expect(groups.map((group) => group.name)).toEqual(['web01', 'web02']);
	});

	it('keeps distinct items that share a display name', () => {
		const duplicate = payload('column', { config: { group_by: 'host' }, series: [
			item({ hostid: '1', host: 'web01', name: 'Traffic', key: 'net.if.in[eth0]', value: '1' }),
			item({ hostid: '1', host: 'web01', name: 'Traffic', key: 'net.if.in[eth1]', value: '2' })
		] });
		const option = buildColumnOption(duplicate, context);
		expect(option.series.map((series) => series.name)).toEqual(['Traffic (net.if.in[eth0])', 'Traffic (net.if.in[eth1])']);
		expect(option.series.map((series) => series.data)).toEqual([[1], [2]]);
	});

	it('keeps distinct hosts that share a visible name', () => {
		const duplicate = payload('column', { config: { group_by: 'host' }, series: [
			item({ hostid: '1', host: 'db', key: 'cpu', value: '1' }),
			item({ hostid: '2', host: 'db', key: 'cpu', value: '2' })
		] });
		const option = buildColumnOption(duplicate, context);
		expect(option.xAxis.data).toEqual(['db (1)', 'db (2)']);
		expect(option.series[0].data).toEqual([1, 2]);
	});

	it('escapes names in tooltips', () => {
		const hostile = payload('column', { config: { group_by: 'host' }, series: [item({ host: '<img src=x onerror=alert(1)>', name: '<b>x</b>' })] });
		const option = buildColumnOption(hostile, context);
		const html = option.tooltip.formatter([{ seriesIndex: 0, dataIndex: 0, seriesName: '<b>x</b>', name: '<img src=x onerror=alert(1)>', marker: '' }]);
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
	});

	it('labels the axis with shared units', () => {
		const option = buildColumnOption(data, context);
		expect(option.yAxis.axisLabel.formatter(50)).toBe('50 %');
	});

	it('follows the legend setting', () => {
		expect(buildColumnOption(data, { ...context, showLegend: false }).legend.show).toBe(false);
	});
});
