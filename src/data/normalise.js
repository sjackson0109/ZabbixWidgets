/**
 * Normalises the payload produced by the PHP action into plain series objects.
 *
 * Zabbix returns every value as a string. Numeric item types (float and
 * unsigned) are converted to numbers; anything that does not parse becomes an
 * invalid value rather than being coerced to zero.
 */

export const VALUE_TYPE = Object.freeze({
	FLOAT: 0,
	CHAR: 1,
	LOG: 2,
	UNSIGNED: 3,
	TEXT: 4,
	BINARY: 5
});

export function isNumericType(valueType) {
	return Number(valueType) === VALUE_TYPE.FLOAT || Number(valueType) === VALUE_TYPE.UNSIGNED;
}

export function toNumber(raw) {
	if (typeof raw === 'number') {
		return Number.isFinite(raw) ? raw : null;
	}
	if (typeof raw !== 'string' || raw.trim() === '') {
		return null;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function normaliseTags(tags) {
	return Array.isArray(tags)
		? tags.map(({ tag, value }) => ({ tag: String(tag), value: String(value ?? '') }))
		: [];
}

/**
 * History rows are [clock, value]. Trend rows are [clock, avg, min, max, num]
 * and keep their hourly summary (count, min, max) for weighted aggregation.
 */
function normaliseHistory(history, numeric) {
	if (!Array.isArray(history)) {
		return [];
	}
	return history
		.map(([clock, value, min, max, num]) => {
			const point = { clock: Number(clock), value: numeric ? toNumber(value) : value };
			if (num !== undefined) {
				point.min = toNumber(min);
				point.max = toNumber(max);
				point.num = Number(num);
			}
			return point;
		})
		.filter((point) => Number.isFinite(point.clock) && point.value !== null)
		.sort((a, b) => a.clock - b.clock);
}

export function normaliseSeries(raw) {
	const numeric = isNumericType(raw.value_type);
	const hasLatest = raw.value !== null && raw.value !== undefined;
	const value = hasLatest ? (numeric ? toNumber(raw.value) : String(raw.value)) : null;

	return {
		itemid: String(raw.itemid),
		role: raw.role ?? 'value',
		hostid: String(raw.hostid),
		host: String(raw.host ?? ''),
		name: String(raw.name ?? ''),
		key: String(raw.key ?? ''),
		units: String(raw.units ?? ''),
		valueType: Number(raw.value_type),
		numeric,
		tags: normaliseTags(raw.tags),
		value,
		// A latest value that exists but does not parse is reported, not hidden.
		invalidValue: hasLatest && value === null,
		clock: raw.clock == null ? null : Number(raw.clock),
		history: normaliseHistory(raw.history, numeric)
	};
}

export function normalisePayload(payload = {}) {
	return {
		chart: payload.chart ?? null,
		config: payload.config ?? {},
		series: Array.isArray(payload.series) ? payload.series.map(normaliseSeries) : [],
		hosts: Array.isArray(payload.hosts)
			? payload.hosts.map((host) => ({
				hostid: String(host.hostid),
				name: String(host.name ?? ''),
				groups: Array.isArray(host.groups) ? host.groups.map(String) : [],
				tags: normaliseTags(host.tags),
				macros: host.macros ?? {}
			}))
			: [],
		timePeriod: payload.time_period
			? { from: Number(payload.time_period.from), to: Number(payload.time_period.to) }
			: null,
		historySource: payload.history_source ?? null,
		errors: Array.isArray(payload.errors) ? payload.errors.map(String) : []
	};
}

export function tagValue(tags, name) {
	return tags.find((tag) => tag.tag === name)?.value ?? null;
}
