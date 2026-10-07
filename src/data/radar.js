/**
 * Radar dimensions are item names; entities are hosts.
 *
 * Axis maxima follow one of two documented rules:
 * - shared: every axis uses the same maximum, either the configured radar_max
 *   or the largest value present. Requires all dimensions to share units.
 * - per_dimension: each axis uses the largest value present for that
 *   dimension, so differently scaled metrics remain readable. Values are not
 *   altered; tooltips show the real value and units.
 */

export function buildRadar(series, { scale = 'shared', max = null } = {}) {
	const dimensions = [...new Set(series.map((entry) => entry.name))];
	const entities = new Map();

	for (const entry of series) {
		if (!entities.has(entry.hostid)) {
			entities.set(entry.hostid, { hostid: entry.hostid, name: entry.host, values: {} });
		}
		entities.get(entry.hostid).values[entry.name] = { value: entry.value, units: entry.units };
	}

	const maxima = {};
	for (const dimension of dimensions) {
		const values = series.filter((entry) => entry.name === dimension && entry.value !== null).map((entry) => entry.value);
		maxima[dimension] = values.length ? Math.max(...values) : null;
	}

	const sharedMax = max ?? Math.max(...Object.values(maxima).filter((value) => value !== null));

	const indicators = dimensions.map((dimension) => ({
		name: dimension,
		max: scale === 'shared' ? sharedMax : maxima[dimension]
	}));

	return { dimensions, indicators, entities: [...entities.values()] };
}
