/**
 * C34 Wireless Airspace Heat-Map: access points drawn on a floor plan image, with
 * their radios around them.
 *
 * - The floor plan is a Zabbix background image, loaded from the Zabbix
 *   server itself. Positions are in percent of the image, given by the user.
 * - "Estimated coverage" draws nine stacked translucent discs per radio, one
 *   per signal level in 4 dB steps down to the coverage edge, sized in
 *   metres by the ITU-R P.1238 indoor model (see data/coverage.js) from the
 *   radio's transmit power. The discs add up towards the access point, so
 *   the fade follows the modelled signal. It is labelled as an estimate:
 *   walls are not included. A radio without a transmit power gets a small
 *   band ring instead.
 * - "Band only" draws one ring per radio, nested by band, whose size shows
 *   the band and nothing else.
 * - Each band's rings are offset a few pixels on screen (2.4 GHz left, 5 GHz
 *   up and right, 6 GHz down and right) so their centres stay apart. The
 *   access point's position itself is not moved.
 * - Colour is the radio's SNR against the SNR thresholds; a radio with no
 *   SNR value is grey. Rings have no border.
 * - Hovering a radio highlights every radio on the same band and channel.
 * - A client count (blue) and a rogue AP count (orange), when configured,
 *   are badges side by side on the access point that reported them. Rogue
 *   APs themselves are never placed: their position is not known.
 * - Coverage gaps and channel overlap are shaded on a grid over the plan.
 *   Fully transparent parts of the floor plan image count as outside the
 *   building and are not shaded, so a plan cut out to the building's outline
 *   shows gaps only indoors.
 *
 * Zoom and pan are kept across refreshes.
 */
import { echarts } from '../echarts.js';
import { baseOption, formatClock } from './common.js';
import { captureGeoState } from './geomap.js';
import { BANDS, BAND_LABELS, sharedChannels, wirelessModel } from '../data/wireless.js';
import { LEVEL_STEP, contours, coverageGrid, coverageSettings, gridShape } from '../data/coverage.js';
import { bandColours, bandIndex, resolveScale } from '../data/thresholds.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const RING_SIZE = Object.freeze({ '2.4': 58, 5: 42, 6: 26 });
const BAND_Z = Object.freeze({ '2.4': 2, 5: 3, 6: 4 });
const ROGUE_COLOUR = '#D55E00';
const CLIENT_COLOUR = '#0072B2';
/** Badge layout in pixels: left edge of the first badge from the access point, and the gap between badges. */
const BADGE_LEFT = 7;
const BADGE_GAP = 2;

/**
 * Screen offset of each band's rings from the access point, in pixels, so the
 * centres of overlapping bands stay apart. Only the drawing moves; the
 * access point's position does not.
 */
export const BAND_OFFSET = Object.freeze({ '2.4': [-4, 0], 5: [3, -3], 6: [3, 3] });

/** Opacity of each stacked contour disc: they add up towards the access point. */
const CONTOUR_OPACITY = 0.07;

const GAP_COLOUR = 'rgba(20, 20, 20, 0.3)';
const CLASH_COLOUR = 'rgba(204, 0, 0, 0.3)';

const registered = new Set();

function escapeAttribute(text) {
	return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Registers the floor plan as an SVG map holding the image, so points, zoom and pan share its coordinates. */
export function registerFloor(floor) {
	const name = `zabbixwidgets-floor-${floor.width}x${floor.height}-${floor.url.length}-${floor.url.slice(-24)}`;
	if (!registered.has(name)) {
		echarts.registerMap(name, {
			svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${floor.width}" height="${floor.height}" viewBox="0 0 ${floor.width} ${floor.height}">`
				+ `<image x="0" y="0" width="${floor.width}" height="${floor.height}" href="${escapeAttribute(floor.url)}"/></svg>`
		});
		registered.add(name);
	}
	return name;
}

const masks = new Map();

/**
 * Which coverage grid cells are inside the building, read from the floor
 * plan's transparency: a cell is outside when every pixel under it is fully
 * transparent. Returns a function (column, row) -> boolean, or null when the
 * plan has no transparent areas or is not loaded yet. The first call for a
 * plan starts loading it and calls `onReady` once the outline is known.
 */
export function floorMask(floor, columns, rows, onReady) {
	if (typeof document === 'undefined' || typeof Image === 'undefined') {
		return null;
	}
	const key = `${floor.url}|${columns}x${rows}`;
	const known = masks.get(key);
	if (known !== undefined) {
		if (known.pending) {
			known.waiting.add(onReady);
			return null;
		}
		return known.inside;
	}
	const entry = { pending: true, inside: null, waiting: new Set([onReady]) };
	masks.set(key, entry);
	const image = new Image();
	const finish = (inside) => {
		entry.pending = false;
		entry.inside = inside;
		const waiting = [...entry.waiting];
		entry.waiting.clear();
		if (inside !== null) {
			waiting.forEach((callback) => callback());
		}
	};
	image.onload = () => {
		try {
			// Drawn at up to 2048 pixels across, then each cell is checked for any drawn pixel under it.
			const ratio = Math.min(1, 2048 / image.naturalWidth);
			const width = Math.max(columns, Math.round(image.naturalWidth * ratio));
			const height = Math.max(rows, Math.round(image.naturalHeight * ratio));
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const drawing = canvas.getContext('2d');
			drawing.drawImage(image, 0, 0, width, height);
			const { data } = drawing.getImageData(0, 0, width, height);
			const cells = new Uint8Array(columns * rows);
			for (let y = 0; y < height; y++) {
				const row = Math.min(rows - 1, Math.floor((y * rows) / height));
				for (let x = 0; x < width; x++) {
					if (data[(y * width + x) * 4 + 3] > 0) {
						cells[row * columns + Math.min(columns - 1, Math.floor((x * columns) / width))] = 1;
					}
				}
			}
			const outside = cells.reduce((count, cell) => count + 1 - cell, 0);
			finish(outside === 0 ? null : (column, row) => cells[row * columns + column] === 1);
		}
		catch {
			finish(null);
		}
	};
	image.onerror = () => finish(null);
	image.src = floor.url;
	return null;
}

/** SNR colour for one radio on one host, or null without a value. */
export function snrColour(snr, config, host) {
	if (snr === null) {
		return null;
	}
	const scale = resolveScale({ thresholds: config.snr_thresholds }, host);
	if (scale.errors.length > 0 || scale.thresholds.length === 0) {
		return null;
	}
	const colours = bandColours(scale.thresholds.length + 1, 'lower_worse');
	return colours[bandIndex(snr, scale.thresholds)] ?? null;
}

function withAlpha(hex, alpha) {
	const value = Number.parseInt(hex.slice(1), 16);
	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * Where the plan sits: fitted to the widget at its own aspect ratio, with
 * room below it for the key. A plan wider than the widget fills the width;
 * otherwise it fills the height.
 */
export function floorBox(floor, aspect) {
	const wider = aspect !== undefined && floor.width / floor.height > aspect;
	return wider ? { left: 8, right: 8, top: 'middle' } : { top: 8, bottom: 52, left: 'center' };
}

export function buildWifiFloorOption(payload, context) {
	const { config, floor } = payload;
	const { theme } = context;
	const { aps } = wirelessModel(payload);
	const map = registerFloor(floor);
	const roam = context.state?.roam ?? null;
	const point = (ap) => [(ap.position[0] / 100) * floor.width, (ap.position[1] / 100) * floor.height];
	const shared = sharedChannels(aps);

	const radioLine = (radio) => {
		const parts = [
			`<b>${escapeHtml(BAND_LABELS[radio.band])}</b>`,
			`channel ${escapeHtml(radio.channel ?? 'no data')}`,
			radio.width !== null ? `${radio.width} MHz` : (radio.widthText !== null ? escapeHtml(radio.widthText) : null),
			`SNR ${radio.snr === null ? 'no data' : escapeHtml(formatValue(radio.snr, radio.snrUnits, context.decimals))}`
		].filter((part) => part !== null);
		return parts.join(', ');
	};
	const apTooltip = (ap) => {
		const lines = [`<b>${escapeHtml(ap.name)}</b>`, ...ap.radios.map(radioLine)];
		if (ap.clients !== null) {
			lines.push(`Clients: <b>${escapeHtml(formatValue(ap.clients, '', 0))}</b>`);
		}
		if (ap.rogues !== null) {
			lines.push(`Rogue APs: <b>${escapeHtml(formatValue(ap.rogues.count, '', 0))}</b>`);
			lines.push(...ap.rogues.names.slice(0, 10).map((name) => `<span style="opacity:0.7">${escapeHtml(name)}</span>`));
		}
		const clocks = ap.radios.map((radio) => radio.clock).filter(Number.isFinite);
		if (clocks.length > 0) {
			lines.push(`<span style="opacity:0.7">Oldest reading: ${escapeHtml(formatClock(Math.min(...clocks), context.timeZone))}</span>`);
		}
		return lines.join('<br>');
	};

	// One series per band and channel, so hovering a radio highlights its co-channel neighbours.
	const groups = new Map();
	for (const ap of aps) {
		const perBand = new Map();
		for (const radio of ap.radios) {
			const nth = perBand.get(radio.band) ?? 0;
			perBand.set(radio.band, nth + 1);
			const key = `${radio.band}|${radio.channel ?? '?'}`;
			if (!groups.has(key)) {
				groups.set(key, { band: radio.band, channel: radio.channel, entries: [] });
			}
			groups.get(key).entries.push({ ap, radio, size: Math.max(12, RING_SIZE[radio.band] - nth * 8) });
		}
	}
	const bandOnly = (entry) => config.ring_size === 'band' || contours(entry.radio, coverageSettings(config)).length === 0;
	const radioSeries = [...groups.values()]
		.map((group) => ({ ...group, entries: group.entries.filter(bandOnly) }))
		.filter((group) => group.entries.length > 0)
		.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band))
		.map((group) => ({
			type: 'scatter',
			id: `radio:${group.band}|${group.channel ?? '?'}`,
			name: `${BAND_LABELS[group.band]} channel ${group.channel ?? 'unknown'}`,
			coordinateSystem: 'geo',
			z: BAND_Z[group.band],
			emphasis: { focus: 'series', scale: false },
			blur: { itemStyle: { opacity: 0.15 } },
			tooltip: { formatter: (param) => radioTooltip(group)(param) },
			data: group.entries.map(({ ap, radio, size }) => {
				const colour = snrColour(radio.snr, config, ap.host);
				return {
					name: ap.name,
					value: point(ap),
					symbolSize: size,
					symbolOffset: BAND_OFFSET[radio.band],
					itemStyle: { color: withAlpha(colour ?? theme.mutedText, colour === null ? 0.18 : 0.3), borderWidth: 0 }
				};
			})
		}));

	const modelled = config.ring_size !== 'band';
	const coverage = modelled ? coverageSettings(config) : null;
	// Floor plan pixels per metre.
	const scale = coverage === null ? 0 : floor.width / coverage.width;
	const radioTooltip = (group) => (param) => {
		const { ap, radio, rings } = group.entries[param.dataIndex];
		const others = radio.channel === null ? 0 : (shared.get(`${radio.band}|${radio.channel}`) ?? 1) - 1;
		const lines = [`<b>${escapeHtml(ap.name)}</b>`, radioLine(radio)];
		if (rings !== undefined && rings.length > 0) {
			const power = radio.txPower ?? coverage.power;
			lines.push(`Estimated range to ${escapeHtml(String(coverage.edge))} dBm: <b>${escapeHtml(formatValue(rings[0].radius, '', 0))} m</b>`
				+ ` <span style="opacity:0.7">(${escapeHtml(formatValue(power, '', 1))} dBm${radio.txPower === null ? ' entered' : ''}`
				+ `${coverage.factor !== 1 ? `, scaled to ${Math.round(coverage.factor * 100)}%` : ''})</span>`);
		}
		if (others > 0) {
			lines.push(`${others} other radio${others === 1 ? '' : 's'} on this channel`);
		}
		return lines.join('<br>');
	};

	// Estimated coverage: stacked translucent discs, one per signal level, drawn in floor plan metres.
	const coverageSeries = [];
	if (coverage !== null) {
		const coverageGroups = new Map();
		for (const group of groups.values()) {
			for (const entry of group.entries) {
				const rings = contours(entry.radio, coverage);
				if (rings.length > 0) {
					const key = `${group.band}|${group.channel ?? '?'}`;
					if (!coverageGroups.has(key)) {
						coverageGroups.set(key, { band: group.band, channel: group.channel, entries: [] });
					}
					coverageGroups.get(key).entries.push({ ...entry, rings });
				}
			}
		}
		for (const group of coverageGroups.values()) {
			group.entries.sort((a, b) => b.rings[0].radius - a.rings[0].radius);
		}
		coverageSeries.push(...[...coverageGroups.values()]
			.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band))
			.map((group) => ({
				type: 'custom',
				id: `coverage:${group.band}|${group.channel ?? '?'}`,
				name: `${BAND_LABELS[group.band]} channel ${group.channel ?? 'unknown'}`,
				coordinateSystem: 'geo',
				z: BAND_Z[group.band],
				emphasis: { focus: 'series' },
				tooltip: { formatter: radioTooltip(group) },
				renderItem: (params, api) => {
					const { ap, radio, rings } = group.entries[params.dataIndex];
					const [x, y] = point(ap);
					const centre = api.coord([x, y]);
					const [dx, dy] = BAND_OFFSET[radio.band];
					const colour = snrColour(radio.snr, config, ap.host) ?? theme.mutedText;
					return {
						type: 'group',
						children: rings.map((ring) => ({
							type: 'circle',
							shape: { cx: centre[0] + dx, cy: centre[1] + dy, r: Math.max(1, api.coord([x + ring.radius * scale, y])[0] - centre[0]) },
							style: { fill: withAlpha(colour, CONTOUR_OPACITY), stroke: null },
							blur: { style: { opacity: 0.2 } }
						}))
					};
				},
				data: group.entries.map(({ ap }) => ({ name: ap.name, value: point(ap) }))
			})));
	}

	// Coverage gaps and channel overlap, on a grid over the plan, from the same model.
	const cellSeries = [];
	if (coverage !== null && (config.show_gaps !== false || config.show_interference !== false)) {
		const metres = coverage.width / floor.width;
		const sources = aps.flatMap((ap) => ap.radios.map((radio) => {
			const [x, y] = point(ap);
			return { ap, radio, x: x * metres, y: y * metres };
		}));
		const shape = gridShape(coverage.width, floor.height * metres);
		const inside = floorMask(floor, shape.columns, shape.rows, () => context.redraw?.());
		const grid = coverageGrid(sources, coverage, coverage.width, floor.height * metres, inside);
		const cellPx = grid.size * scale;
		const cell = (id, cells, colour, z, describe) => ({
			type: 'custom',
			id,
			coordinateSystem: 'geo',
			z,
			tooltip: { formatter: (param) => describe(cells[param.dataIndex]) },
			renderItem: (params, api) => {
				const { column, row } = cells[params.dataIndex];
				const [x0, y0] = api.coord([column * cellPx, row * cellPx]);
				const [x1, y1] = api.coord([(column + 1) * cellPx, (row + 1) * cellPx]);
				// Whole pixels, so neighbouring cells meet exactly: no seams and no doubled overlap.
				const [left, top, right, bottom] = [x0, y0, x1, y1].map(Math.round);
				return { type: 'rect', shape: { x: left, y: top, width: right - left, height: bottom - top }, style: { fill: colour, stroke: null } };
			},
			data: cells.map(({ column, row }) => ({ value: [(column + 0.5) * cellPx, (row + 0.5) * cellPx] }))
		});
		if (config.show_gaps !== false && grid.gaps.length > 0) {
			cellSeries.push(cell('coverage-gaps', grid.gaps, GAP_COLOUR, 1,
				() => `No radio reaches ${escapeHtml(String(coverage.edge))} dBm here <span style="opacity:0.7">(estimate)</span>`));
		}
		if (config.show_interference !== false && grid.clashes.length > 0) {
			cellSeries.push(cell('channel-overlap', grid.clashes, CLASH_COLOUR, 6, (entry) => [
				'<b>Channel overlap</b> <span style="opacity:0.7">(estimate)</span>',
				...entry.radios
					.sort((a, b) => b.level - a.level)
					.slice(0, 6)
					.map(({ ap, radio, level }) => `${escapeHtml(ap.name)}: ${escapeHtml(BAND_LABELS[radio.band])} channel ${escapeHtml(radio.channel)}`
						+ `${radio.width !== null ? `, ${radio.width} MHz` : ''}, ${escapeHtml(formatValue(level, '', 0))} dBm`)
			].join('<br>')));
		}
	}

	const withRogues = aps.filter((ap) => ap.rogues !== null);
	const withClients = aps.filter((ap) => ap.clients !== null);
	// Badges sit side by side above and to the right of the access point: clients, then rogue APs.
	const badgeText = (count) => formatValue(count, '', 0);
	const badgeWidth = (count) => Math.max(18, badgeText(count).length * 7 + 8);
	const badgeOffset = (ap, slot) => {
		const clientsWidth = ap.clients === null ? 0 : badgeWidth(ap.clients) + BADGE_GAP;
		const left = BADGE_LEFT + (slot === 1 ? clientsWidth : 0);
		const width = badgeWidth(slot === 0 ? ap.clients : ap.rogues.count);
		return [left + width / 2, -16];
	};
	const badgeSeries = (id, list, count, colour, slot) => ({
		type: 'scatter',
		id,
		coordinateSystem: 'geo',
		z: 11,
		symbol: 'roundRect',
		label: {
			show: true,
			position: 'inside',
			fontSize: 10,
			fontWeight: 'bold',
			color: '#ffffff',
			formatter: (param) => badgeText(count(list[param.dataIndex]))
		},
		tooltip: { formatter: (param) => apTooltip(list[param.dataIndex]) },
		data: list.map((ap) => ({
			name: ap.name,
			value: point(ap),
			symbolSize: [badgeWidth(count(ap)), 14],
			symbolOffset: badgeOffset(ap, slot),
			itemStyle: { color: colour(ap) }
		}))
	});
	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		geo: {
			map,
			roam: true,
			...floorBox(floor, context.aspect),
			zoom: roam?.zoom ?? 1,
			center: roam?.center ?? undefined,
			silent: true,
			label: { show: false },
			itemStyle: { areaColor: 'transparent', borderColor: 'transparent' },
			emphasis: { disabled: true }
		},
		graphic: [{
			type: 'text',
			left: 8,
			bottom: 4,
			silent: true,
			style: {
				text: coverage === null
					? 'Colour: SNR\nRings, outer to inner: 2.4, 5, 6 GHz (not coverage)'
					: `Estimated coverage to ${coverage.edge} dBm in ${LEVEL_STEP} dB steps${coverage.factor !== 1 ? `, ranges scaled to ${Math.round(coverage.factor * 100)}%` : ''}, colour: SNR\nDark: no coverage. Red: channel overlap\nITU-R P.1238 indoor model, walls not included`,
				lineHeight: 14,
				fill: theme.mutedText,
				fontSize: 11
			}
		}],
		tooltip: { ...base.tooltip, trigger: 'item' },
		series: [
			...cellSeries,
			...coverageSeries,
			...radioSeries,
			{
				type: 'scatter',
				id: 'access-points',
				coordinateSystem: 'geo',
				z: 10,
				symbolSize: 8,
				itemStyle: { color: theme.text, borderColor: theme.tooltipBackground, borderWidth: 1 },
				label: {
					show: config.show_node_labels !== false,
					position: 'bottom',
					// Below the outermost ring.
					distance: RING_SIZE['2.4'] / 2 + 2,
					color: theme.text,
					textBorderColor: theme.tooltipBackground,
					textBorderWidth: 2,
					formatter: (param) => aps[param.dataIndex].name
				},
				tooltip: { formatter: (param) => apTooltip(aps[param.dataIndex]) },
				data: aps.map((ap) => ({ name: ap.name, value: point(ap) }))
			},
			badgeSeries('clients', withClients, (ap) => ap.clients, () => CLIENT_COLOUR, 0),
			badgeSeries('rogues', withRogues, (ap) => ap.rogues.count, (ap) => (ap.rogues.count > 0 ? ROGUE_COLOUR : theme.mutedText), 1)
		]
	};
}

export default {
	id: 'wifi_floor',
	buildOption: buildWifiFloorOption,
	captureState: captureGeoState,
	// The plan's box depends on the widget's shape.
	sizeDependent: true
};
