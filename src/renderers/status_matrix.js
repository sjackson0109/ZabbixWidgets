/**
 * C23 Status Matrix: a compact grid with hosts and items on its two axes
 * and one cell per item, holding its latest value.
 *
 * Cells are coloured only from what the user chose: their value map colours,
 * threshold bands, or the severity of the item's triggers in the problem
 * state (using the severity colours configured in Zabbix). Otherwise cells
 * stay neutral; no green/red meaning is assumed. Large matrices scroll.
 */
import { distinct, hostDimension, itemDimension } from './dimensions.js';
import { formatClock } from './common.js';
import { bandColours, bandIndex, resolveScale } from '../data/thresholds.js';
import { mappedColour, parseColourMap, stateOf } from '../data/states.js';
import { formatValue } from '../data/units.js';
import { applyThemeVariables } from '../ui/theme.js';
import { el } from '../utils/dom.js';

const DIMENSIONS = { host: hostDimension, item: itemDimension };

/** Text colour that stays readable on a background colour. */
export function readableText(colour) {
	const match = /^#([0-9a-f]{6})$/i.exec(colour ?? '') ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colour ?? '');
	if (match === null) {
		return null;
	}
	const hex = match.length === 4 ? match.slice(1).map((digit) => digit + digit).join('') : match[1];
	const value = parseInt(hex, 16);
	const luminance = (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255;
	return luminance > 0.55 ? '#1f2c33' : '#ffffff';
}

/** Rows, columns and cells: { rows, columns, cells: Map("row|column" -> cell) }. */
export function matrixCells(payload, context) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const rowOf = DIMENSIONS[config.matrix_rows] ?? hostDimension;
	const columnOf = config.matrix_rows === 'item' ? hostDimension : itemDimension;
	const rows = distinct(series, rowOf);
	const columns = distinct(series, columnOf);
	const hosts = new Map(payload.hosts.map((host) => [host.hostid, host]));
	const useValuemap = config.use_valuemap !== false;
	const { entries: colourMap } = parseColourMap(config.colour_map);

	const cells = new Map();
	for (const entry of series) {
		const state = entry.value === null ? null : stateOf(entry, entry.value, useValuemap);
		let colour = null;
		if (state !== null && config.colour_by === 'value_map') {
			colour = mappedColour(colourMap, state);
		}
		else if (state !== null && config.colour_by === 'thresholds' && typeof entry.value === 'number') {
			const scale = resolveScale({ thresholds: config.thresholds }, hosts.get(entry.hostid) ?? null);
			colour = scale.thresholds.length > 0
				? bandColours(scale.thresholds.length + 1, config.threshold_order)[bandIndex(entry.value, scale.thresholds)]
				: null;
		}
		else if (config.colour_by === 'severity' && entry.problems.length > 0) {
			colour = payload.severities[entry.problems[0].severity]?.color ?? null;
		}
		const text = state === null ? 'no data' : (state.mapped ?? (entry.numeric ? formatValue(entry.value, entry.units, context.decimals) : state.raw));
		cells.set(`${rowOf(entry).id}|${columnOf(entry).id}`, { entry, state, colour, text });
	}
	return { rows, columns, cells, rowOf, columnOf };
}

function cellTitle(cell, payload, context) {
	const { entry, state } = cell;
	const lines = [`${entry.host}: ${entry.name}`, `Key: ${entry.key}`];
	if (state === null) {
		lines.push('No recent value');
	}
	else {
		const value = entry.numeric ? formatValue(entry.value, entry.units, context.decimals) : state.raw;
		lines.push(`Value: ${state.mapped === null ? value : `${state.mapped} (${value})`}`);
		if (entry.clock !== null) {
			lines.push(`Updated: ${formatClock(entry.clock, context.timeZone, { seconds: true })}`);
		}
	}
	for (const problem of entry.problems) {
		lines.push(`Problem (${payload.severities[problem.severity]?.name ?? problem.severity}): ${problem.name}`);
	}
	return lines.join('\n');
}

export function renderStatusMatrix(container, payload, context) {
	const { config } = payload;
	const { rows, columns, cells } = matrixCells(payload, context);
	const showValues = config.show_value !== false;

	const table = el('table', { className: 'zw-matrix-grid' }, [
		el('thead', {}, [el('tr', {}, [
			el('th', { className: 'zw-matrix-corner' }),
			...columns.map((column) => el('th', { className: 'zw-matrix-column', title: column.label, attrs: { scope: 'col' } }, [
				el('span', { text: column.label })
			]))
		])]),
		el('tbody', {}, rows.map((row) => el('tr', {}, [
			el('th', { className: 'zw-matrix-row', text: row.label, title: row.label, attrs: { scope: 'row' } }),
			...columns.map((column) => {
				const cell = cells.get(`${row.id}|${column.id}`);
				if (cell === undefined) {
					return el('td', { className: 'zw-matrix-empty' });
				}
				const style = cell.colour === null ? {} : { 'background-color': cell.colour, color: readableText(cell.colour) ?? 'inherit' };
				return el('td', {
					className: `zw-cell zw-matrix-cell${cell.colour === null ? ' zw-matrix-neutral' : ''}${cell.state === null ? ' zw-matrix-missing' : ''}`,
					title: cellTitle(cell, payload, context),
					style
				}, [showValues ? el('span', { text: cell.text }) : null]);
			})
		])))
	]);

	const root = el('div', { className: `zw-matrix${showValues ? '' : ' zw-matrix-compact'}` }, [table]);
	applyThemeVariables(root, context.theme);
	container.replaceChildren(root);
}

export default {
	id: 'status_matrix',
	kind: 'dom',
	render: renderStatusMatrix
};
