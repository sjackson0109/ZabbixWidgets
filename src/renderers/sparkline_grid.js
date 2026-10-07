/**
 * C25 Sparkline Grid: one compact tile per item with its current value, a
 * small line of its history over the time period, and optionally the change
 * over the period and its minimum and maximum. Tiles reflow to the widget's
 * width; the column count can be fixed instead.
 *
 * The sparkline is plain SVG drawn from real samples, broken at gaps (see
 * data/temporal.js), so many tiles stay cheap to draw.
 */
import { seriesLabels } from './common.js';
import { sortEntities } from '../data/groups.js';
import { gapThreshold, parseGap } from '../data/temporal.js';
import { formatValue } from '../data/units.js';
import { applyThemeVariables } from '../ui/theme.js';
import { el } from '../utils/dom.js';
import { naturalCompare } from '../utils/natural.js';

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 100;
const HEIGHT = 28;

/** Polyline point lists for a sparkline, one per unbroken run of samples. */
export function sparklinePaths(points, threshold, period) {
	if (points.length === 0) {
		return [];
	}
	const from = period?.from ?? points[0].clock;
	const to = period?.to ?? points[points.length - 1].clock;
	const values = points.map((point) => point.value);
	const low = Math.min(...values);
	const high = Math.max(...values);
	const x = (clock) => (to === from ? WIDTH / 2 : ((clock - from) / (to - from)) * WIDTH);
	const y = (value) => (high === low ? HEIGHT / 2 : HEIGHT - 2 - ((value - low) / (high - low)) * (HEIGHT - 4));
	const runs = [[]];
	points.forEach((point, index) => {
		if (index > 0 && point.clock - points[index - 1].clock > threshold) {
			runs.push([]);
		}
		runs[runs.length - 1].push(`${x(point.clock).toFixed(2)},${y(point.value).toFixed(2)}`);
	});
	return runs.map((run) => run.join(' '));
}

/** Tiles in display order, after sorting and the Top/Bottom N limit. */
export function sparklineTiles(payload) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const labels = seriesLabels(series);
	const gap = parseGap(config.max_gap);
	const tiles = series.map((entry, index) => {
		const points = entry.history;
		const values = points.map((point) => point.value);
		return {
			id: entry.itemid,
			label: labels[index],
			entry,
			value: entry.value,
			points,
			threshold: gapThreshold(entry, gap),
			change: typeof entry.value === 'number' && points.length > 0 ? entry.value - points[0].value : null,
			min: values.length ? Math.min(...points.map((point) => point.min ?? point.value)) : null,
			max: values.length ? Math.max(...points.map((point) => point.max ?? point.value)) : null
		};
	});

	const ranked = tiles.filter((tile) => typeof tile.value === 'number');
	const missing = tiles.filter((tile) => typeof tile.value !== 'number');
	const count = Math.max(1, Number(config.rank_count) || 10);
	let chosen = tiles;
	if (config.rank_limit === 'top') {
		chosen = sortEntities(ranked, 'desc').slice(0, count);
	}
	else if (config.rank_limit === 'bottom') {
		chosen = sortEntities(ranked, 'asc').slice(0, count);
	}
	if (config.tile_sort === 'desc' || config.tile_sort === 'asc') {
		const sorted = sortEntities(chosen.filter((tile) => typeof tile.value === 'number'), config.tile_sort);
		return config.rank_limit === 'top' || config.rank_limit === 'bottom' ? sorted : [...sorted, ...missing];
	}
	return [...chosen].sort((a, b) => naturalCompare(a.label, b.label) || naturalCompare(a.id, b.id));
}

function sparkline(tile, period, colour) {
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.setAttribute('class', 'zw-spark-line');
	svg.setAttribute('aria-hidden', 'true');
	for (const points of sparklinePaths(tile.points, tile.threshold, period)) {
		const line = document.createElementNS(SVG, points.includes(' ') ? 'polyline' : 'circle');
		if (points.includes(' ')) {
			line.setAttribute('points', points);
			line.setAttribute('fill', 'none');
			line.setAttribute('stroke', colour);
			line.setAttribute('stroke-width', '1.5');
			line.setAttribute('vector-effect', 'non-scaling-stroke');
		}
		else {
			const [cx, cy] = points.split(',');
			line.setAttribute('cx', cx);
			line.setAttribute('cy', cy);
			line.setAttribute('r', '1.5');
			line.setAttribute('fill', colour);
		}
		svg.append(line);
	}
	return svg;
}

export function renderSparklineGrid(container, payload, context) {
	const { config } = payload;
	const tiles = sparklineTiles(payload);
	const columns = Number(config.grid_columns) || 0;
	const format = (value, entry) => (value === null ? '–' : formatValue(value, entry.units, context.decimals));

	const root = el('div', {
		className: 'zw-spark',
		style: { 'grid-template-columns': columns > 0 ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(150px, 1fr))' }
	}, tiles.map((tile, index) => {
		const colour = context.theme.palette[index % context.theme.palette.length];
		const change = config.show_change && tile.change !== null
			? el('span', {
				className: `zw-spark-change ${tile.change > 0 ? 'zw-spark-up' : tile.change < 0 ? 'zw-spark-down' : ''}`,
				text: `${tile.change > 0 ? '▲' : tile.change < 0 ? '▼' : '='} ${format(Math.abs(tile.change), tile.entry)}`,
				title: 'Change over the time period'
			})
			: null;
		return el('div', { className: 'zw-cell zw-spark-tile', title: `${tile.entry.host}: ${tile.entry.name}` }, [
			el('div', { className: 'zw-spark-label', text: tile.label }),
			el('div', { className: 'zw-spark-value' }, [
				el('span', { text: typeof tile.value === 'number' ? format(tile.value, tile.entry) : 'no data', className: typeof tile.value === 'number' ? '' : 'zw-spark-missing' }),
				change
			]),
			sparkline(tile, payload.timePeriod, colour),
			config.show_minmax
				? el('div', { className: 'zw-spark-range', text: tile.min === null ? 'no history' : `min ${format(tile.min, tile.entry)} · max ${format(tile.max, tile.entry)}` })
				: null
		]);
	}));
	applyThemeVariables(root, context.theme);
	container.replaceChildren(root);
}

export default {
	id: 'sparkline_grid',
	kind: 'dom',
	render: renderSparklineGrid
};
