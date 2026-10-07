/** S03: the shared axis range helper. */
import { describe, expect, it } from 'vitest';
import { axisRange, extentOf, niceCeil } from '../../src/data/scale.js';

describe('axis range', () => {
	it('follows the data', () => {
		expect(axisRange({ values: [3, 7] })).toEqual({ min: 3, max: 7 });
	});

	it('keeps fixed limits and pads only the free ends', () => {
		expect(axisRange({ values: [10, 20], min: 0, pad: 0.1 })).toEqual({ min: 0, max: 22 });
		expect(axisRange({ values: [10, 20], max: 100, pad: 0.1 })).toEqual({ min: 1, max: 100 });
	});

	it('keeps zero on the axis when asked, with negatives', () => {
		expect(axisRange({ values: [5, 9], zero: true })).toEqual({ min: 0, max: 9 });
		expect(axisRange({ values: [-4, -2], zero: true })).toEqual({ min: -4, max: 0 });
	});

	it('makes room for thresholds and targets', () => {
		expect(axisRange({ values: [40, 50], include: [30, 90] })).toEqual({ min: 30, max: 90 });
	});

	it('opens empty and flat ranges', () => {
		expect(axisRange()).toEqual({ min: 0, max: 1 });
		expect(axisRange({ values: [5, 5] })).toEqual({ min: 5, max: 10 });
		expect(axisRange({ values: [0, 0] })).toEqual({ min: 0, max: 1 });
		expect(axisRange({ values: [5], max: 2 })).toEqual({ min: 0, max: 2 });
	});

	it('handles very small and very large ranges', () => {
		const small = axisRange({ values: [0.0001, 0.0002] });
		expect(small.max).toBeGreaterThan(small.min);
		expect(axisRange({ values: [1e12, 4e12], zero: true, nice: true })).toEqual({ min: 0, max: 5e12 });
	});

	it('rounds a free upper end to a nice number', () => {
		expect([7, 13, 42, 0.3].map(niceCeil)).toEqual([10, 20, 50, 0.5]);
	});

	it('finds the extent of long lists without spreading them', () => {
		const values = Array.from({ length: 300000 }, (_, index) => index % 1000);
		expect(extentOf([...values, NaN, null])).toEqual({ min: 0, max: 999 });
		expect(extentOf([])).toBeNull();
	});
});
