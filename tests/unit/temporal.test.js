import { describe, expect, it } from 'vitest';
import {
	alignForStack, gapThreshold, lineData, medianInterval, nearestIndex, parseGap, sampleAt, temporalSeries, unitGroups
} from '../../src/data/temporal.js';
import { parseColourMap, stateLanes, stateSegments } from '../../src/data/states.js';
import { item, payload } from '../fixtures/payload.js';

const points = (...clocks) => clocks.map((clock, index) => ({ clock, value: index }));

describe('gaps', () => {
	it('reads the maximum gap setting', () => {
		expect(parseGap('')).toEqual({ mode: 'auto', seconds: null, error: null });
		expect(parseGap('0').mode).toBe('never');
		expect(parseGap('10m')).toEqual({ mode: 'fixed', seconds: 600, error: null });
		expect(parseGap('soon').error).toMatch(/Maximum gap/);
	});

	it('uses 2.5 update intervals, the median spacing without one, and two hours for trends', () => {
		expect(gapThreshold({ delay: 60, history: [] }, parseGap(''))).toBe(150);
		expect(medianInterval(points(0, 60, 120, 600))).toBe(60);
		expect(gapThreshold({ delay: null, history: points(0, 60, 120, 600) }, parseGap(''))).toBe(150);
		expect(gapThreshold({ delay: 60, history: [{ clock: 0, value: 1, num: 60 }] }, parseGap(''))).toBe(7200);
		expect(gapThreshold({ delay: 60, history: [] }, parseGap('0'))).toBe(Infinity);
		expect(gapThreshold({ delay: 60, history: [] }, parseGap('1h'))).toBe(3600);
	});

	it('breaks a line across a gap instead of bridging it', () => {
		const data = lineData(points(0, 60, 120, 1000, 1060), 150);
		expect(data.map(([, value]) => value)).toEqual([0, 1, 2, null, 3, 4]);
		expect(data[3][0]).toBe(560 * 1000);
		expect(lineData(points(0, 60, 1000), Infinity).every(([, value]) => value !== null)).toBe(true);
	});
});

describe('tooltip samples', () => {
	const series = { points: points(0, 60, 120, 1000), threshold: 150 };

	it('finds the nearest real sample', () => {
		expect(nearestIndex(series.points, 70)).toBe(1);
		expect(nearestIndex(series.points, 95)).toBe(2);
		expect(nearestIndex([], 5)).toBe(-1);
	});

	it('returns the recorded value, never an interpolated one, and nothing inside a gap', () => {
		expect(sampleAt(series, 70)).toEqual({ clock: 60, value: 1 });
		expect(sampleAt(series, 500)).toBeNull();
		expect(sampleAt({ points: [], threshold: 150 }, 0)).toBeNull();
	});
});

describe('stacking', () => {
	it('leaves a bucket empty for every series when one series has no sample there', () => {
		const a = { entry: { delay: 60 }, points: [{ clock: 0, value: 1 }, { clock: 60, value: 2 }, { clock: 120, value: 3 }] };
		const b = { entry: { delay: 60 }, points: [{ clock: 0, value: 10 }, { clock: 120, value: 30 }] };
		const { bucket, starts, values } = alignForStack([a, b]);
		expect(bucket).toBe(60);
		expect(starts).toEqual([0, 60, 120]);
		expect(values).toEqual([[1, null, 3], [10, null, 30]]);
	});

	it('weights hourly trend points by their sample count', () => {
		const a = { entry: { delay: 3600 }, points: [{ clock: 0, value: 10, num: 1 }, { clock: 1800, value: 20, num: 3 }] };
		expect(alignForStack([a]).values[0]).toEqual([17.5]);
	});
});

describe('temporal series', () => {
	it('keeps series without history and groups units for axes', () => {
		const data = payload('line', {
			config: { max_gap: '' },
			series: [item({ units: '%', history: [[0, '1'], [60, '2']], delay: 60 }), item({ units: 'B', history: [] }), item({ units: '%', history: [] })]
		});
		const list = temporalSeries(data);
		expect(list).toHaveLength(3);
		expect(list[1].points).toEqual([]);
		expect(unitGroups(data.series)).toEqual(['%', 'B']);
	});
});

describe('states', () => {
	const mappings = [{ type: 0, value: '1', newvalue: 'up' }, { type: 0, value: '2', newvalue: 'down' }];

	it('reads value colours and reports bad lines', () => {
		const { entries, errors } = parseColourMap('up = #00ff00\nDown=#f00\n\nbroken\nx = red');
		expect([...entries]).toEqual([['up', '#00ff00'], ['down', '#f00']]);
		expect(errors.map((line) => line.line)).toEqual([4, 5]);
	});

	it('holds a state until the next sample, up to the gap threshold, and marks unknown time as no data', () => {
		const entry = { delay: 60, valuemap: mappings, numeric: false, units: '', history: [{ clock: 100, value: '1' }, { clock: 160, value: '1' }, { clock: 220, value: '2' }, { clock: 1000, value: '1' }] };
		const segments = stateSegments(entry, { from: 0, to: 1100 }, { useValuemap: true, gap: parseGap('') });
		expect(segments.map(({ start, end, state }) => [start, end, state?.key ?? null])).toEqual([
			[0, 100, null], [100, 220, 'up'], [220, 370, 'down'], [370, 1000, null], [1000, 1100, 'up']
		]);
		expect(segments[1].state.text).toBe('up (1)');
	});

	it('uses raw values without value mapping', () => {
		const entry = { delay: 60, valuemap: mappings, numeric: false, units: '', history: [{ clock: 0, value: '2' }] };
		expect(stateSegments(entry, { from: 0, to: 60 }, { useValuemap: false })[0].state.key).toBe('2');
	});

	it('colours states from the colour map first and the palette in a stable order otherwise', () => {
		const data = payload('state_timeline', {
			config: { colour_map: 'down = #d73027', use_valuemap: true, max_gap: '' },
			series: [item({ value_type: 3, units: '', valuemap: mappings, delay: 60, history: [[0, '3'], [60, '1'], [120, '2']] })],
			time_period: { from: 0, to: 180 }
		});
		const { colours } = stateLanes(data, ['#111111', '#222222']);
		expect(Object.fromEntries(colours)).toEqual({ 3: '#111111', down: '#d73027', up: '#222222' });
	});
});
