/** Behaviour of the C02-C13 renderers on small, hand-checked inputs. */
import { describe, expect, it } from 'vitest';
import { buildStackedBarOption } from '../../src/renderers/stacked_bar.js';
import { buildDoughnutOption } from '../../src/renderers/doughnut.js';
import { buildBulletOption } from '../../src/renderers/bullet.js';
import { heatmapGrid } from '../../src/renderers/heatmap.js';
import { buildCandles, buildCandlestickOption } from '../../src/renderers/candlestick.js';
import { bubbleDiameter, buildBubbleOption } from '../../src/renderers/bubble.js';
import { ganttTasks } from '../../src/renderers/gantt.js';
import { buildTreeData } from '../../src/renderers/tree.js';
import { networkGraph } from '../../src/renderers/network.js';
import { relationshipFlows } from '../../src/renderers/relationship.js';
import { calendarDays } from '../../src/renderers/calendar_heatmap.js';
import { formatClock, niceCeil, seriesLabels } from '../../src/renderers/common.js';
import { parseRanges } from '../../src/data/targets.js';
import { themeByName } from '../../src/ui/theme.js';
import { host, item, payload } from '../fixtures/payload.js';

const context = { theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC' };
const HOUR = 3600;
const T0 = 1700006400; // 2023-11-15 00:00 UTC

describe('common helpers', () => {
	it('labels series by item, host or both, keeping them unique', () => {
		expect(seriesLabels([item({ name: 'CPU' }), item({ name: 'Memory' })])).toEqual(['CPU', 'Memory']);
		expect(seriesLabels([item({ hostid: '1', host: 'a', key: 'cpu' }), item({ hostid: '2', host: 'b', key: 'cpu' })])).toEqual(['a', 'b']);
		expect(seriesLabels([item({ name: 'X', key: 'x[1]' }), item({ name: 'X', key: 'x[2]' })])).toEqual(['X (x[1])', 'X (x[2])']);
	});

	it('formats clocks in the given time zone', () => {
		expect(formatClock(T0, 'UTC')).toBe('2023-11-15 00:00');
		expect(formatClock(T0, 'America/New_York', { time: false })).toBe('2023-11-14');
	});

	it('rounds axis ends up to 1, 2 or 5 times a power of ten', () => {
		expect([niceCeil(91), niceCeil(120), niceCeil(0.3), niceCeil(500)]).toEqual([100, 200, 0.5, 500]);
	});
});

describe('C02 stacked bar', () => {
	it('stacks every group on one axis and leaves gaps empty', () => {
		const option = buildStackedBarOption(payload('stacked_bar', { config: { group_by: 'host' }, series: [
			item({ hostid: '1', host: 'a', name: 'User', key: 'u', value: '2' }),
			item({ hostid: '1', host: 'a', name: 'System', key: 's', value: '3' }),
			item({ hostid: '2', host: 'b', name: 'User', key: 'u', value: '4' })
		] }), context);
		expect(option.series.every((series) => series.stack === 'total')).toBe(true);
		expect(option.series.map((series) => series.data)).toEqual([[2, 4], [3, null]]);
	});
});

describe('C03 doughnut', () => {
	const series = [item({ name: 'A', value: '30' }), item({ name: 'B', value: '10' }), item({ name: 'C', value: '0' }), item({ name: 'D', value: null })];

	it('keeps zero segments unless asked to hide them, and leaves out missing values', () => {
		const shown = buildDoughnutOption(payload('doughnut', { config: {}, series }), context);
		expect(shown.series[0].data.map((segment) => segment.name)).toEqual(['A', 'B', 'C']);
		const hidden = buildDoughnutOption(payload('doughnut', { config: { hide_zero: true }, series }), context);
		expect(hidden.series[0].data.map((segment) => segment.name)).toEqual(['A', 'B']);
	});

	it('shows the sum or average in the centre', () => {
		const sum = buildDoughnutOption(payload('doughnut', { config: { centre_value: 'sum' }, series }), context);
		expect(sum.graphic[0].style.text).toBe('40 %\ntotal');
		const avg = buildDoughnutOption(payload('doughnut', { config: { centre_value: 'avg', hide_zero: true }, series }), context);
		expect(avg.graphic[0].style.text).toBe('20 %\naverage');
		expect(buildDoughnutOption(payload('doughnut', { config: { centre_value: 'none' }, series }), context).graphic).toEqual([]);
	});
});

describe('C04 bullet', () => {
	it('parses ranges', () => {
		expect(parseRanges('50, 80')).toEqual({ ranges: [50, 80], error: null });
		expect(parseRanges('')).toEqual({ ranges: [], error: null });
		expect(parseRanges('80, 50').error).not.toBeNull();
	});

	it('takes targets only from the configured source', () => {
		const actuals = [item({ role: 'actual', hostid: '1', host: 'a', value: '60' }), item({ role: 'actual', hostid: '2', host: 'b', value: '90' })];
		const byMacro = buildBulletOption(payload('bullet', {
			config: { target_source: 'macro', target_macro: '{$T}', ranges: '50, 80' },
			series: actuals,
			hosts: [host({ hostid: '1', name: 'a', macros: { '{$T}': '70' } }), host({ hostid: '2', name: 'b', macros: { '{$T}': '75' } })]
		}), context);
		expect(byMacro.series[0].data).toEqual([60, 90]);
		expect(byMacro.series[1].data).toEqual([[70, 0], [75, 1]]);
		expect(byMacro.series[0].markArea.data.map(([from, to]) => [from.xAxis, to.xAxis])).toEqual([[0, 50], [50, 80], [80, 100]]);

		const byItem = buildBulletOption(payload('bullet', {
			config: { target_source: 'item', pair_by: 'host' },
			series: [...actuals, item({ role: 'target', hostid: '2', host: 'b', value: '85' })]
		}), context);
		expect(byItem.yAxis.data).toEqual(['b']);
		expect(byItem.series[1].data).toEqual([[85, 0]]);
		expect(byItem.series[0].markArea).toBeUndefined();
	});
});

describe('C06 heat map', () => {
	it('maps latest values onto hosts by items', () => {
		const grid = heatmapGrid(payload('heatmap', { config: { heat_x: 'host', heat_y: 'item' }, series: [
			item({ hostid: '1', host: 'a', name: 'CPU', key: 'cpu', value: '1' }),
			item({ hostid: '2', host: 'b', name: 'CPU', key: 'cpu', value: '2' }),
			item({ hostid: '2', host: 'b', name: 'Disk', key: 'disk', value: null })
		] }), context);
		expect(grid.xLabels).toEqual(['a', 'b']);
		expect(grid.yLabels).toEqual(['CPU', 'Disk']);
		expect(grid.cells).toEqual([{ x: 0, y: 0, value: 1, count: 1 }, { x: 1, y: 0, value: 2, count: 1 }]);
	});

	it('aggregates history into every bucket of the period and leaves empty buckets blank', () => {
		const grid = heatmapGrid(payload('heatmap', {
			config: { heat_x: 'time', heat_y: 'host', bucket: '1h', aggregation: 'max' },
			time_period: { from: T0, to: T0 + 3 * HOUR - 1 },
			series: [
				item({ hostid: '1', host: 'a', key: 'x', history: [[T0, '1'], [T0 + 60, '5']] }),
				item({ hostid: '1', host: 'a', key: 'y', history: [[T0 + 2 * HOUR, '7']] })
			]
		}), context);
		expect(grid.xLabels).toEqual(['2023-11-15 00:00', '2023-11-15 01:00', '2023-11-15 02:00']);
		expect(grid.yLabels).toEqual(['a']);
		expect(grid.cells.map(({ x, value }) => [x, value])).toEqual([[0, 5], [2, 7]]);
	});
});

describe('C07 candlestick', () => {
	const period = { from: T0, to: T0 + 2 * HOUR - 1 };

	it('derives candles from the first, highest, lowest and last samples', () => {
		const data = payload('candlestick', { config: { ohlc_mode: 'derived', bucket: '1h' }, time_period: period, series: [
			item({ role: 'source', history: [[T0, '10'], [T0 + 60, '15'], [T0 + 120, '8'], [T0 + 180, '12']] })
		] });
		expect(buildCandles(data)).toEqual([{ start: T0, open: 10, high: 15, low: 8, close: 12, count: 4 }]);
		const option = buildCandlestickOption(data, context);
		expect(option.series[0].data).toEqual([[10, 12, 8, 15], '-']);
	});

	it('aligns explicit series per period', () => {
		const one = (role, value) => item({ role, history: [[T0 + 10, value]] });
		const data = payload('candlestick', { config: { ohlc_mode: 'explicit', bucket: '1h' }, time_period: period, series: [
			one('open', '1'), one('high', '4'), one('low', '0.5'), one('close', '3')
		] });
		expect(buildCandles(data)).toEqual([{ start: T0, open: 1, high: 4, low: 0.5, close: 3 }]);
	});
});

describe('C08 bubble', () => {
	it('scales bubble area with size', () => {
		expect(bubbleDiameter(100, 100)).toBe(48);
		expect(bubbleDiameter(25, 100)).toBe(24);
		expect(bubbleDiameter(0, 100)).toBe(4);
	});

	it('plots only complete tuples', () => {
		const option = buildBubbleOption(payload('bubble', { config: { pair_by: 'host' }, series: [
			item({ role: 'x', hostid: '1', host: 'a', value: '1' }), item({ role: 'y', hostid: '1', host: 'a', value: '2' }),
			item({ role: 'size', hostid: '1', host: 'a', value: '3' }), item({ role: 'x', hostid: '2', host: 'b', value: '9' })
		] }), context);
		expect(option.series[0].data).toEqual([{ value: [1, 2], symbolSize: 48 }]);
	});
});

describe('C09 gantt', () => {
	it('builds tasks from start and end or start and duration', () => {
		const series = [
			item({ role: 'start', hostid: '1', host: 'a', value: String(T0) }),
			item({ role: 'end', hostid: '1', host: 'a', value: String(T0 + HOUR) }),
			item({ role: 'duration', hostid: '1', host: 'a', value: '600' }),
			item({ role: 'progress', hostid: '1', host: 'a', value: '50' })
		];
		expect(ganttTasks(payload('gantt', { config: { gantt_timing: 'start_end', pair_by: 'host' }, series })))
			.toEqual([{ label: 'a', start: T0, end: T0 + HOUR, progress: 50 }]);
		expect(ganttTasks(payload('gantt', { config: { gantt_timing: 'start_duration', pair_by: 'host' }, series })))
			.toEqual([{ label: 'a', start: T0, end: T0 + 600, progress: 50 }]);
	});
});

describe('C10 tree', () => {
	it('builds levels from host groups under a named root', () => {
		const tree = buildTreeData(payload('tree', {
			config: { tree_source: 'host_group' },
			series: [item({ hostid: '1', host: 'web01', name: 'CPU', value: '5' })],
			hosts: [host({ hostid: '1', name: 'web01', groups: ['Servers/Web'] })]
		}), context);
		expect(tree.name).toBe('Host groups');
		expect(tree.children[0].name).toBe('Servers');
		expect(tree.children[0].children[0].children[0].children[0]).toMatchObject({ name: 'CPU', detail: '5 %' });
	});
});

describe('C11 network', () => {
	it('shows every selected host and only configured edges', () => {
		const graph = networkGraph(payload('network', {
			config: { edge_source: 'list', edge_list: 'a -> b : uplink\na -> b : uplink\na -> missing' },
			hosts: [host({ hostid: '1', name: 'a' }), host({ hostid: '2', name: 'b' }), host({ hostid: '3', name: 'c' })]
		}));
		expect(graph.nodes.map((node) => node.name)).toEqual(['a', 'b', 'c']);
		expect(graph.links).toEqual([{ source: '1', target: '2', text: 'uplink', weight: null }]);
	});
});

describe('C12 relationship', () => {
	it('sums flows per pair and leaves out self flows', () => {
		const flow = (from, to, value) => item({ role: 'weight', value, tags: [{ tag: 's', value: from }, { tag: 't', value: to }] });
		const { flows, nodes } = relationshipFlows(payload('relationship', {
			config: { source_tag: 's', target_tag: 't' },
			series: [flow('A', 'B', '1'), flow('A', 'B', '2'), flow('B', 'B', '5')]
		}));
		expect(flows.map(({ source, target, weight }) => [source, target, weight])).toEqual([['A', 'B', 3]]);
		expect(nodes).toEqual(['A', 'B']);
	});
});

describe('C13 calendar heat map', () => {
	it('aggregates per calendar day in the user time zone', () => {
		const data = payload('calendar_heatmap', { config: { aggregation: 'sum' }, series: [
			item({ history: [[T0 - HOUR, '1'], [T0 + HOUR, '2'], [T0 + 2 * HOUR, '3']] })
		] });
		expect(calendarDays(data, context).map(({ date, value }) => [date, value])).toEqual([['2023-11-14', 1], ['2023-11-15', 5]]);
		expect(calendarDays(data, { ...context, timeZone: 'Asia/Tokyo' }).map(({ date, value }) => [date, value]))
			.toEqual([['2023-11-15', 6]]);
	});
});
