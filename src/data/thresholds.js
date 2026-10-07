/**
 * Scale limits, targets and threshold bands from explicit settings or user
 * macros. Nothing is derived from the data: a chart without a configured
 * value has no such line or band.
 */
import { resolveList, resolveNumber } from './patterns.js';

/** Band colours from best to worst, picked evenly for the number of bands. */
const BAND_COLOURS = ['#009E73', '#F0E442', '#E69F00', '#D55E00', '#B2182B'];

export function bandColours(count, order = 'higher_worse') {
	if (count <= 0) {
		return [];
	}
	const colours = count === 1
		? [BAND_COLOURS[0]]
		: Array.from({ length: count }, (_, index) => BAND_COLOURS[Math.round((index * (BAND_COLOURS.length - 1)) / (count - 1))]);
	return order === 'lower_worse' ? colours.reverse() : colours;
}

/** Index of the band a value falls in: below the first threshold is band 0. */
export function bandIndex(value, thresholds) {
	let index = 0;
	while (index < thresholds.length && value >= thresholds[index]) {
		index++;
	}
	return index;
}

/**
 * Resolves the scale settings for one host (macros are per host).
 * Returns { min, max, target, thresholds, errors }.
 */
export function resolveScale(config, host) {
	const errors = [];
	const read = (field, label) => {
		const { value, error } = resolveNumber(config[field], host);
		if (error !== null) {
			errors.push(`${label}: ${error}`);
		}
		return value;
	};
	const min = read('scale_min', 'Minimum');
	const max = read('scale_max', 'Maximum');
	const target = read('target_value', 'Target');
	const list = resolveList(config.thresholds, host);
	if (list.error !== null) {
		errors.push(`Thresholds: ${list.error}`);
	}
	return { min, max, target, thresholds: list.values, errors };
}

/**
 * Resolves settings that one chart shares across all its hosts, such as the
 * bands behind a time series. A macro that resolves differently on two hosts
 * cannot be drawn once, so it is reported instead of picking one.
 * Returns { scale, errors }.
 */
export function sharedScale(config, hosts) {
	const scales = hosts.length === 0 ? [resolveScale(config, null)] : hosts.map((host) => resolveScale(config, host));
	const errors = [...new Set(scales.flatMap((scale) => scale.errors))];
	const [first] = scales;
	const differs = scales.some((scale) => JSON.stringify([scale.min, scale.max, scale.target, scale.thresholds])
		!== JSON.stringify([first.min, first.max, first.target, first.thresholds]));
	if (differs && errors.length === 0) {
		errors.push('the macros resolve to different values on the selected hosts; select hosts that share them or use numbers');
	}
	return { scale: first, errors };
}
