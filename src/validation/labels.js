/** Human-readable labels for roles, used in validation messages. */
export const ROLE_LABELS = Object.freeze({
	value: 'value',
	actual: 'actual',
	target: 'target',
	source: 'source',
	open: 'open',
	high: 'high',
	low: 'low',
	close: 'close',
	x: 'X',
	y: 'Y',
	size: 'size',
	start: 'start',
	end: 'end',
	duration: 'duration',
	progress: 'progress',
	weight: 'weight',
	colour: 'colour'
});

/** Joins names into "a, b and 2 more" so messages stay short. */
export function listNames(names, limit = 3) {
	const unique = [...new Set(names)];
	if (unique.length <= limit) {
		return unique.length > 1
			? `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
			: unique.join('');
	}
	return `${unique.slice(0, limit).join(', ')} and ${unique.length - limit} more`;
}

export function seriesLabel(series) {
	return series.host === '' ? series.name : `${series.host}: ${series.name}`;
}
