// @vitest-environment jsdom
/**
 * C21-C26: time-series options, tooltips, bands, state lanes, the status
 * matrix and the sparkline grid, plus the contract checks they rely on.
 */
import { describe, expect, it } from 'vitest';
import { getChart } from '../../src/registry/index.js';
import { getRenderer } from '../../src/renderers/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { validate } from '../../src/validation/index.js';
import { themeByName } from '../../src/ui/theme.js';
import { tooltipHtml, tooltipRows } from '../../src/renderers/temporal.js';
import { temporalSeries } from '../../src/data/temporal.js';
import { matrixCells, readableText } from '../../src/renderers/status_matrix.js';
import { sparklinePaths, sparklineTiles } from '../../src/renderers/sparkline_grid.js';
import { sample } from '../fixtures/samples.js';
import { host, item, payload } from '../fixtures/payload.js';

const context = (state = {}) => ({ theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC', state });
const option = (chart, data, state) => getRenderer(chart).buildOption(data, context(state));
const codes = (chart, data) => {
	const result = validate(getChart(chart), data);
	return { errors: result.errors.map((problem) => problem.code), warnings: result.warnings.map((problem) => problem.code) };
};
const series = (history, extra = {}) => item({ history, delay: 60, ...extra });
const minute = (count, start = 0, value = (index) => String(index)) => Array.from({ length: count }, (_, index) => [start + index * 60, value(index)]);
const period = { from: 0, to: 3600 };

describe('C21 Temporal Line', () => {
	it('follows the time period and breaks lines at gaps', () => {
		const data = payload('line', { config: { max_gap: '' }, series: [series([...minute(10), ...minute(5, 1800)])], time_period: period });
		const built = option('line', data);
		expect(built.xAxis.min).toBe(0);
		expect(built.xAxis.max).toBe(3600 * 1000);
		expect(built.series[0].data.filter(([, value]) => value === null)).toHaveLength(1);
		expect(built.series[0].connectNulls).toBe(false);
	});

	it('puts a second unit on a right-hand axis and rejects a third', () => {
		const data = payload('line', {
			config: { max_gap: '' }, time_period: period,
			series: [series(minute(3), { units: '%' }), series(minute(3), { units: 'B' })]
		});
		const built = option('line', data);
		expect(built.yAxis.map((axis) => axis.position)).toEqual(['left', 'right']);
		expect(built.series.map((entry) => entry.yAxisIndex)).toEqual([0, 1]);
		data.series.push(...payload('line', { series: [series(minute(3), { units: 'bps' })] }).series);
		expect(codes('line', data).errors).toContain('too_many_units');
	});

	it('shows each series\' own nearest sample in the tooltip and "no data" inside a gap', () => {
		const data = payload('line', {
			config: { max_gap: '' }, time_period: period,
			series: [series(minute(60), { name: 'Busy', host: 'web01' }), series([...minute(5), ...minute(5, 3000)], { name: 'Sparse', host: 'web02' })]
		});
		const list = temporalSeries(data).map((entry, index) => ({ ...entry, colour: ['#000000', '#111111'][index] }));
		const { clock, rows } = tooltipRows(list, 1210 * 1000);
		expect(clock).toBe(1200);
		expect(rows.map((row) => row.sample?.value ?? null)).toEqual([20, null]);
		const html = tooltipHtml(list, 1210 * 1000, context(), () => true);
		expect(html).toContain('web02: Sparse: <span style="opacity:0.7">no data</span>');
		expect(tooltipHtml(list, 1210 * 1000, context(), (label) => label !== list[1].label)).not.toContain('Sparse');
	});

	it('reports items without history but still draws the others', () => {
		const data = payload('line', { config: { max_gap: '' }, time_period: period, series: [series(minute(3)), series([])] });
		expect(codes('line', data)).toEqual({ errors: [], warnings: ['no_history'] });
		expect(codes('line', payload('line', { config: {}, time_period: period, series: [series([])] })).errors).toContain('no_history');
	});

	it('checks the gap and axis settings', () => {
		const data = (config) => payload('line', { config: { max_gap: '', ...config }, time_period: period, series: [series(minute(3))] });
		expect(codes('line', data({ max_gap: 'often' })).errors).toEqual(['invalid_gap']);
		expect(codes('line', data({ y_min: '10', y_max: '5' })).errors).toEqual(['invalid_scale']);
		expect(codes('line', data({ y_min: 'low' })).errors).toEqual(['invalid_scale']);
		expect(option('line', data({ y_min: '0', y_max: '100' })).yAxis[0]).toMatchObject({ min: 0, max: 100 });
	});
});

describe('C22 Temporal Area', () => {
	it('stacks on shared buckets and leaves incomplete buckets empty', () => {
		const data = payload('area', {
			config: { area_mode: 'stacked', area_opacity: 50, max_gap: '' }, time_period: period,
			series: [series(minute(5), { units: 'bps' }), series(minute(5).filter((_, index) => index !== 2), { units: 'bps' })]
		});
		const built = option('area', data);
		expect(built.series.every((entry) => entry.stack === 'total')).toBe(true);
		expect(built.series.map((entry) => entry.data.map(([, value]) => value))).toEqual([[0, 1, null, 3, 4], [0, 1, null, 3, 4]]);
		expect(built.series[0].areaStyle.opacity).toBe(0.5);
	});

	it('stacks only one additive unit', () => {
		const mixed = payload('area', { config: { area_mode: 'stacked' }, time_period: period, series: [series(minute(3), { units: 'bps' }), series(minute(3), { units: 'B' })] });
		expect(codes('area', mixed).errors).toContain('mixed_units');
		const shares = payload('area', { config: { area_mode: 'stacked' }, time_period: period, series: [series(minute(3)), series(minute(3))] });
		expect(codes('area', shares).errors).toContain('non_additive');
		expect(codes('area', { ...shares, config: { ...shares.config, area_mode: 'overlap' } }).errors).toEqual([]);
	});

	it('draws a gradient fill when asked', () => {
		const data = payload('area', { config: { area_gradient: true, area_opacity: 30 }, time_period: period, series: [series(minute(3))] });
		expect(option('area', data).series[0].areaStyle.color.type).toBe('linear');
	});
});

describe('C26 Threshold Band', () => {
	it('draws bands and lines from the configured thresholds, resolved from macros', () => {
		const built = option('threshold_band', normalisePayload(sample('threshold_band')));
		const bands = built.series[0].markArea.data;
		expect(bands).toHaveLength(3);
		expect(bands.map(([from]) => from.yAxis)).toEqual([0, 75, 90]);
		expect(built.series[0].markLine.data.map((line) => line.yAxis)).toEqual([75, 90, 50]);
		expect(bands[0][0].itemStyle.color).toBe('#009E73');
	});

	it('reverses band colours when lower is worse', () => {
		const data = normalisePayload(sample('threshold_band'));
		data.config.threshold_order = 'lower_worse';
		expect(option('threshold_band', data).series[0].markArea.data[0][0].itemStyle.color).toBe('#B2182B');
	});

	it('needs thresholds that resolve to the same values on every host', () => {
		const data = normalisePayload(sample('threshold_band'));
		expect(codes('threshold_band', { ...data, config: { ...data.config, thresholds: '' } }).errors).toEqual(['no_thresholds']);
		data.hosts[1].macros['{$CPU.WARN}'] = '60';
		expect(codes('threshold_band', data).errors).toEqual(['invalid_scale']);
	});
});

describe('C24 State Timeline', () => {
	it('draws state blocks and no-data blocks across the period', () => {
		const data = normalisePayload(sample('state_timeline'));
		const built = option('state_timeline', data);
		const blocks = built.series[0].data;
		expect(blocks.length).toBeGreaterThan(6);
		expect(Math.min(...blocks.map((block) => block[1]))).toBe(data.timePeriod.from * 1000);
		expect(Math.max(...blocks.map((block) => block[2]))).toBe(data.timePeriod.to * 1000);
		const legend = built.graphic[0].children.filter((child) => child.type === 'text').map((child) => child.style.text);
		expect(legend).toEqual(['degraded', 'down', 'running', 'testing', 'up', 'No data']);
	});

	it('reports bad colour lines', () => {
		const data = normalisePayload(sample('state_timeline'));
		data.config.colour_map = 'up = green';
		expect(codes('state_timeline', data).errors).toEqual(['invalid_colours']);
	});
});

describe('C23 Status Matrix', () => {
	const statusItem = (hostid, hostName, name, value, extra = {}) => item({
		hostid, host: hostName, name, key: name, units: '', value_type: 3, value,
		valuemap: [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }], ...extra
	});

	it('puts hosts on rows and items on columns, or the other way round', () => {
		const data = payload('status_matrix', {
			config: { matrix_rows: 'host', colour_by: 'none', use_valuemap: true },
			series: [statusItem('1', 'a', 'eth0', '1'), statusItem('1', 'a', 'eth1', '2'), statusItem('2', 'b', 'eth0', '1')]
		});
		const { rows, columns, cells } = matrixCells(data, context());
		expect(rows.map((row) => row.label)).toEqual(['a', 'b']);
		expect(columns.map((column) => column.label)).toEqual(['eth0', 'eth1']);
		expect([...cells.values()].map((cell) => [cell.text, cell.colour])).toEqual([['up', null], ['down', null], ['up', null]]);
		data.config.matrix_rows = 'item';
		expect(matrixCells(data, context()).rows.map((row) => row.label)).toEqual(['eth0', 'eth1']);
	});

	it('colours cells only from the chosen source', () => {
		const series = [statusItem('1', 'a', 'eth0', '1'), statusItem('1', 'a', 'eth1', '2', { problems: [{ name: 'Down', severity: 4 }] })];
		const severities = Array.from({ length: 6 }, (_, index) => ({ name: `S${index}`, color: `#00000${index}` }));
		const colours = (config) => [...matrixCells(payload('status_matrix', { config: { use_valuemap: true, ...config }, series, severities }), context()).cells.values()].map((cell) => cell.colour);
		expect(colours({ colour_by: 'value_map', colour_map: 'down = #ff0000' })).toEqual([null, '#ff0000']);
		expect(colours({ colour_by: 'severity' })).toEqual([null, '#000004']);
		expect(colours({ colour_by: 'thresholds', thresholds: '2' })).toEqual(['#009E73', '#B2182B']);
	});

	it('bands numeric items by thresholds resolved per host', () => {
		const data = payload('status_matrix', {
			config: { colour_by: 'thresholds', thresholds: '{$LIMIT}', threshold_order: 'higher_worse' },
			series: [item({ hostid: '1', host: 'a', value: '50' }), item({ hostid: '2', host: 'b', value: '50' })],
			hosts: [host({ hostid: '1', name: 'a', macros: { '{$LIMIT}': '40' } }), host({ hostid: '2', name: 'b', macros: { '{$LIMIT}': '60' } })]
		});
		expect([...matrixCells(data, context()).cells.values()].map((cell) => cell.colour)).toEqual(['#B2182B', '#009E73']);
		expect(codes('status_matrix', data).errors).toEqual([]);
		expect(codes('status_matrix', { ...data, config: { ...data.config, thresholds: '' } }).errors).toEqual(['no_thresholds']);
	});

	it('keeps text readable on any cell colour', () => {
		expect(readableText('#ffffff')).toBe('#1f2c33');
		expect(readableText('#000')).toBe('#ffffff');
		expect(readableText('red')).toBeNull();
	});

	it('marks cells without a value and empty intersections', () => {
		const data = normalisePayload(sample('status_matrix'));
		const container = document.createElement('div');
		getRenderer('status_matrix').render(container, data, context());
		expect(container.querySelectorAll('.zw-matrix-missing')).toHaveLength(1);
		expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
		expect(container.querySelector('.zw-matrix-missing').textContent).toBe('no data');
	});
});

describe('C25 Sparkline Grid', () => {
	it('splits the sparkline at gaps', () => {
		const points = [0, 60, 120, 1000, 1060].map((clock, index) => ({ clock, value: index }));
		expect(sparklinePaths(points, 150, { from: 0, to: 1060 })).toHaveLength(2);
		expect(sparklinePaths([], 150, null)).toEqual([]);
	});

	it('sorts and limits tiles, keeping items without a value last', () => {
		const data = payload('sparkline_grid', {
			config: { tile_sort: 'desc', rank_limit: 'all', max_gap: '' },
			series: [item({ name: 'B', value: '5', history: [] }), item({ name: 'A', value: '9', history: [] }), item({ name: 'C', value: null, history: [] })]
		});
		expect(sparklineTiles(data).map((tile) => tile.entry.name)).toEqual(['A', 'B', 'C']);
		data.config.tile_sort = 'name';
		expect(sparklineTiles(data).map((tile) => tile.entry.name)).toEqual(['A', 'B', 'C']);
		data.config.rank_limit = 'bottom';
		data.config.rank_count = 1;
		expect(sparklineTiles(data).map((tile) => tile.entry.name)).toEqual(['B']);
	});

	it('shows the change over the period and the range', () => {
		const data = normalisePayload(sample('sparkline_grid'));
		const container = document.createElement('div');
		getRenderer('sparkline_grid').render(container, data, context());
		expect(container.querySelectorAll('.zw-spark-tile')).toHaveLength(4);
		expect(container.querySelectorAll('.zw-spark-change').length).toBeGreaterThan(0);
		expect(container.textContent).toContain('no history');
		expect(container.querySelector('.zw-spark').style.gridTemplateColumns).toContain('auto-fill');
	});
});
