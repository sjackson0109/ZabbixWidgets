/** Data helpers added for the family options and C28-C33, on hand-checked inputs. */
import { describe, expect, it } from 'vitest';
import { barBuckets, bucketEnd, bucketStart, localMidnight, zoneOffset } from '../../src/data/buckets.js';
import { binWidth, boxStats, histogram, quantile } from '../../src/data/distribution.js';
import { edgeWeight, parseEdgeList } from '../../src/data/edges.js';
import { parallelModel, parseAxes } from '../../src/data/parallel.js';
import { parseNodePositions } from '../../src/data/positions.js';
import { echartsStep, heldSampleAt } from '../../src/data/temporal.js';
import { parseSteps, waterfallModel } from '../../src/data/waterfall.js';
import { item, payload } from '../fixtures/payload.js';

const HOUR = 3600;

describe('step modes', () => {
	const series = { threshold: 2 * HOUR, points: [{ clock: 0, value: 1 }, { clock: HOUR, value: 2 }, { clock: 2 * HOUR, value: 3 }] };

	it('maps each mode to the ECharts step it draws', () => {
		expect(['none', 'after', 'before', 'middle'].map(echartsStep)).toEqual([false, 'end', 'start', 'middle']);
	});

	it('reads the value held at the pointer', () => {
		// Held until the next sample: halfway through the first hour the first value still holds.
		expect(heldSampleAt(series, HOUR / 2, 'after').value).toBe(1);
		// Held back to the previous sample: the next value already shows.
		expect(heldSampleAt(series, HOUR / 2, 'before').value).toBe(2);
		expect(heldSampleAt(series, HOUR, 'after').value).toBe(2);
	});

	it('shows nothing across a gap', () => {
		const gapped = { threshold: HOUR, points: [{ clock: 0, value: 1 }, { clock: 5 * HOUR, value: 2 }] };
		expect(heldSampleAt(gapped, 2 * HOUR, 'after')).toBeNull();
	});
});

describe('bar buckets', () => {
	it('aligns sub-day buckets to the epoch and leaves empty buckets out', () => {
		const points = [{ clock: 10, value: 2 }, { clock: 20, value: 4 }, { clock: 3 * HOUR + 5, value: 6 }];
		expect(barBuckets(points, HOUR, 'sum')).toEqual([
			{ start: 0, end: HOUR, value: 6, count: 2 },
			{ start: 3 * HOUR, end: 4 * HOUR, value: 6, count: 1 }
		]);
	});

	it('follows local calendar days across a daylight-saving change', () => {
		// 2023-03-26: clocks in London go forward, so the day lasts 23 hours.
		const start = localMidnight('2023-03-26', 'Europe/London');
		expect(start).toBe(Date.UTC(2023, 2, 26) / 1000);
		expect(bucketEnd(start, 86400, 'Europe/London') - start).toBe(23 * HOUR);
		// 2023-10-29: clocks go back, so the day lasts 25 hours.
		const autumn = localMidnight('2023-10-29', 'Europe/London');
		expect(autumn).toBe(Date.UTC(2023, 9, 28, 23) / 1000);
		expect(bucketEnd(autumn, 86400, 'Europe/London') - autumn).toBe(25 * HOUR);
		expect(bucketStart(autumn + 24 * HOUR + 30 * 60, 86400, 'Europe/London')).toBe(autumn);
	});

	it('reads the zone offset at an instant', () => {
		expect(zoneOffset(Date.UTC(2023, 6, 1) / 1000, 'Europe/London')).toBe(HOUR);
		expect(zoneOffset(Date.UTC(2023, 6, 1) / 1000, 'Asia/Kolkata')).toBe(5.5 * HOUR);
	});
});

describe('distribution statistics', () => {
	it('interpolates quantiles between closest ranks', () => {
		expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
		expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
	});

	it('marks samples beyond 1.5 interquartile ranges as outliers', () => {
		const stats = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100]);
		expect(stats).toMatchObject({ count: 9, median: 5, q1: 3, q3: 7, lowWhisker: 1, highWhisker: 8, outliers: [100] });
		expect(boxStats([])).toBeNull();
	});

	it('bins shared by every series, counting the largest sample', () => {
		const result = histogram([[0, 1, 2, 3], [4]], 4);
		expect(result.edges).toEqual([0, 1, 2, 3, 4]);
		expect(result.counts).toEqual([[1, 1, 1, 1], [0, 0, 0, 1]]);
		expect(histogram([[]])).toBeNull();
	});

	it('never chooses more than 200 bins', () => {
		const values = [0, ...Array.from({ length: 1000 }, () => 1), 1e6];
		expect(1e6 / binWidth(values)).toBeLessThanOrEqual(200);
	});
});

describe('edge weights', () => {
	it('reads an optional weight after the last bar', () => {
		const { edges, errors } = parseEdgeList('a -> b : WAN | net.if.in[wan]\nb -> c | 10\nc -> d : x | \n');
		expect(edges.map((edge) => edge.weight)).toEqual([{ key: 'net.if.in[wan]' }, { constant: 10 }]);
		expect(errors).toHaveLength(1);
	});

	it('looks the weight item up on the source host, and never treats missing as zero', () => {
		const series = [item({ hostid: '1', key: 'w', value: '5', units: 'bps' }), item({ hostid: '2', key: 'w', value: null })];
		const value = (sourceId) => edgeWeight({ sourceId, targetId: '9', weight: { key: 'w' } }, payload('network', { series }).series);
		expect(value('1')).toMatchObject({ value: 5, units: 'bps', error: null });
		expect(value('2')).toMatchObject({ value: null, error: 'no_value' });
		expect(value('3')).toMatchObject({ value: null, error: 'missing_item' });
	});
});

describe('fixed node positions', () => {
	it('parses one host per line and reports bad lines and duplicates', () => {
		const result = parseNodePositions('core = 50, 10\nedge-a=0,90\n# note\nbroken = 1\ncore = 40, 10');
		expect([...result.positions]).toEqual([['core', [40, 10]], ['edge-a', [0, 90]]]);
		expect(result.errors.map((entry) => entry.line)).toEqual([4]);
		expect(result.duplicates).toEqual(['core']);
	});
});

describe('parallel axes', () => {
	it('parses labels, patterns and optional ranges, reporting a bad range', () => {
		const { axes, errors } = parseAxes('CPU = CPU* | 0, 100\nLoad = Load average\nBad = x | 5, 1');
		// The axis is kept so later lines keep their place; the error stops the chart.
		expect(axes.map((axis) => [axis.heading, axis.min, axis.max])).toEqual([['CPU', 0, 100], ['Load', null, null], ['Bad', null, null]]);
		expect(errors.map((entry) => entry.line)).toEqual([3]);
	});

	it('leaves out an entity missing an axis instead of drawing a zero', () => {
		const series = payload('parallel', { series: [
			item({ hostid: '1', host: 'a', name: 'CPU', value: '10' }), item({ hostid: '1', host: 'a', name: 'Load', value: '1' }),
			item({ hostid: '2', host: 'b', name: 'CPU', value: '20' }), item({ hostid: '2', host: 'b', name: 'Load', value: null })
		] }).series;
		const model = parallelModel(series, { parallel_axes: 'CPU = CPU\nLoad = Load', pair_by: 'host' });
		expect(model.entities.map((entity) => entity.label)).toEqual(['a']);
		expect(model.incomplete).toEqual([{ label: 'b', axes: ['Load'] }]);
	});
});

describe('waterfall steps', () => {
	it('parses contributions, levels and totals', () => {
		const { steps, errors } = parseSteps('= Open = Start\n+ In = Received\n- Out = Shipped\nOther = Misc\n= Close\n- = nothing');
		expect(steps.map((step) => [step.kind, step.label])).toEqual([['level', 'Open'], ['add', 'In'], ['subtract', 'Out'], ['add', 'Other'], ['total', 'Close']]);
		expect(errors.map((entry) => entry.line)).toEqual([6]);
	});

	it('runs the total and reports a level that the steps do not explain', () => {
		const series = payload('waterfall', { series: [
			item({ name: 'Start', value: '100' }), item({ name: 'Received', value: '30' }), item({ name: 'Shipped', value: '50' }), item({ name: 'End', value: '90' })
		] }).series;
		const model = waterfallModel(series, '= Open = Start\n+ In = Received\n- Out = Shipped\n= Close = End\n= Total');
		expect(model.bars.map((bar) => [bar.kind, bar.from, bar.to])).toEqual([
			['level', 0, 100], ['increase', 100, 130], ['decrease', 130, 80], ['level', 0, 90], ['total', 0, 90]
		]);
		expect(model.mismatches).toEqual([{ label: 'Close', expected: 80, actual: 90 }]);
	});

	it('draws nothing when a step has no value', () => {
		const series = payload('waterfall', { series: [item({ name: 'Start', value: '100' }), item({ name: 'Received', value: null })] }).series;
		const model = waterfallModel(series, '= Open = Start\n+ In = Received');
		expect(model.bars).toEqual([]);
		expect(model.withoutValue).toEqual(['In']);
	});
});
