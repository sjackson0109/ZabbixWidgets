/**
 * Discrete states over time for C24 State Timeline (and colour lookups for
 * C23 Status Matrix).
 *
 * A state starts at the sample that recorded it and lasts until the next
 * sample, but never longer than the series' gap threshold (see temporal.js);
 * time without a known state is a "no data" interval. Transitions are placed
 * exactly at the recorded samples: nothing is interpolated between states.
 */
import { gapThreshold, parseGap } from './temporal.js';
import { mapValue } from './valuemap.js';
import { formatValue } from './units.js';
import { seriesLabels } from '../renderers/common.js';
import { isHexColour } from '../utils/colour.js';
import { naturalCompare } from '../utils/natural.js';


/**
 * Parses "value = #colour" lines. The value is a raw value or mapped text,
 * matched without regard to case. Returns { entries: Map(lower-case value -> colour), errors }.
 */
export function parseColourMap(text) {
	const entries = new Map();
	const errors = [];
	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === '' || line.startsWith('//')) {
			return;
		}
		const separator = line.lastIndexOf('=');
		const value = separator === -1 ? '' : line.slice(0, separator).trim();
		const colour = separator === -1 ? '' : line.slice(separator + 1).trim();
		if (value === '' || !isHexColour(colour)) {
			errors.push({ line: index + 1, text: line });
			return;
		}
		entries.set(value.toLowerCase(), colour);
	});
	return { entries, errors };
}

/** The state a value represents: { key, text, raw, mapped }. */
export function stateOf(entry, value, useValuemap) {
	const mapped = useValuemap ? mapValue(entry.valuemap, value) : null;
	const raw = String(value);
	const formatted = entry.numeric ? formatValue(value, entry.units, 6) : raw;
	return {
		key: mapped ?? raw,
		raw,
		mapped,
		text: mapped === null ? formatted : `${mapped} (${raw})`
	};
}

/** Colour of a state from the user's map (by mapped text, then raw value), or null. */
export function mappedColour(colours, state) {
	return colours.get(String(state.mapped ?? '').toLowerCase()) ?? colours.get(state.raw.toLowerCase()) ?? null;
}

/**
 * Segments for one series within the period:
 * [{ start, end, state }] where state is null for "no data".
 */
export function stateSegments(entry, period, { useValuemap = true, gap = parseGap('') } = {}) {
	const points = entry.history.filter((point) => point.clock <= period.to);
	const threshold = gapThreshold(entry, gap, points);
	const segments = [];
	let cursor = period.from;
	// Status items repeat a handful of values; each is turned into a state once.
	const known = new Map();
	const state = (value) => {
		if (!known.has(value)) {
			known.set(value, stateOf(entry, value, useValuemap));
		}
		return known.get(value);
	};

	const push = (start, end, state) => {
		if (end <= start) {
			return;
		}
		const last = segments[segments.length - 1];
		if (last !== undefined && last.end === start && (last.state?.key ?? null) === (state?.key ?? null)) {
			last.end = end;
			return;
		}
		segments.push({ start, end, state });
	};

	points.forEach((point, index) => {
		const start = Math.max(point.clock, period.from);
		push(cursor, start, null);
		const next = points[index + 1]?.clock ?? period.to;
		const end = Math.min(next, point.clock + threshold, period.to);
		push(start, end, state(point.value));
		cursor = Math.max(cursor, end);
	});
	push(cursor, period.to, null);
	return segments;
}

/**
 * Lanes for the timeline with a colour for every state: the user's colour
 * map first, then palette colours in the sorted order of the remaining
 * states, so the same states always get the same colours.
 */
export function stateLanes(payload, palette) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const labels = seriesLabels(series);
	const gap = parseGap(config.max_gap);
	const useValuemap = config.use_valuemap !== false;
	const { entries: colourMap } = parseColourMap(config.colour_map);
	const lanes = series.map((entry, index) => ({
		entry,
		label: labels[index],
		segments: payload.timePeriod === null ? [] : stateSegments(entry, payload.timePeriod, { useValuemap, gap })
	}));

	const states = new Map();
	for (const lane of lanes) {
		for (const segment of lane.segments) {
			if (segment.state !== null && !states.has(segment.state.key)) {
				states.set(segment.state.key, segment.state);
			}
		}
	}
	const colours = new Map();
	let next = 0;
	for (const key of [...states.keys()].sort(naturalCompare)) {
		const state = states.get(key);
		colours.set(key, mappedColour(colourMap, state) ?? palette[next++ % palette.length]);
	}
	return { lanes, colours };
}
