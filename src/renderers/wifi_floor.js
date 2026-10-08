/**
 * C34 Wireless Floor Map: access points drawn on a floor plan image, with
 * one ring per radio.
 *
 * - The floor plan is a Zabbix background image, loaded from the Zabbix
 *   server itself. Positions are in percent of the image, given by the user.
 * - Rings are nested by band (2.4 GHz outermost, 6 GHz innermost) so every
 *   radio stays visible. Ring size shows the band only: it is not a coverage
 *   range, which Zabbix does not measure.
 * - Ring colour is the radio's SNR against the SNR thresholds; a radio with
 *   no SNR value is drawn as a dashed, unfilled ring.
 * - Hovering a radio highlights every radio on the same band and channel.
 * - A rogue AP count, when configured, is a badge on the access point that
 *   reported it. Rogue APs themselves are never placed: their position is
 *   not known.
 *
 * Zoom and pan are kept across refreshes.
 */
import { echarts } from '../echarts.js';
import { baseOption, formatClock } from './common.js';
import { captureGeoState } from './geomap.js';
import { BANDS, BAND_LABELS, sharedChannels, wirelessModel } from '../data/wireless.js';
import { bandColours, bandIndex, resolveScale } from '../data/thresholds.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

const RING_SIZE = Object.freeze({ '2.4': 58, 5: 42, 6: 26 });
const BAND_Z = Object.freeze({ '2.4': 2, 5: 3, 6: 4 });
const ROGUE_COLOUR = '#D55E00';

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
	return wider ? { left: 8, right: 8, top: 'middle' } : { top: 8, bottom: 40, left: 'center' };
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
	const radioSeries = [...groups.values()]
		.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band))
		.map((group) => ({
			type: 'scatter',
			id: `radio:${group.band}|${group.channel ?? '?'}`,
			name: `${BAND_LABELS[group.band]} channel ${group.channel ?? 'unknown'}`,
			coordinateSystem: 'geo',
			z: BAND_Z[group.band],
			emphasis: { focus: 'series', scale: false },
			blur: { itemStyle: { opacity: 0.15 } },
			tooltip: {
				formatter: (param) => {
					const { ap, radio } = group.entries[param.dataIndex];
					const others = radio.channel === null ? 0 : (shared.get(`${radio.band}|${radio.channel}`) ?? 1) - 1;
					return [
						`<b>${escapeHtml(ap.name)}</b>`,
						radioLine(radio),
						...(others > 0 ? [`${others} other radio${others === 1 ? '' : 's'} on this channel`] : [])
					].join('<br>');
				}
			},
			data: group.entries.map(({ ap, radio, size }) => {
				const colour = snrColour(radio.snr, config, ap.host);
				return {
					name: ap.name,
					value: point(ap),
					symbolSize: size,
					itemStyle: colour === null
						? { color: 'transparent', borderColor: theme.mutedText, borderWidth: 1.5, borderType: 'dashed' }
						: { color: withAlpha(colour, 0.28), borderColor: colour, borderWidth: 2 }
				};
			})
		}));

	const withRogues = aps.filter((ap) => ap.rogues !== null);
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
				text: 'Colour: SNR\nRings, outer to inner: 2.4, 5, 6 GHz (not coverage)',
				lineHeight: 14,
				fill: theme.mutedText,
				fontSize: 11
			}
		}],
		tooltip: { ...base.tooltip, trigger: 'item' },
		series: [
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
			{
				type: 'scatter',
				id: 'rogues',
				coordinateSystem: 'geo',
				z: 11,
				symbol: 'roundRect',
				symbolSize: [18, 14],
				symbolOffset: [16, -16],
				label: {
					show: true,
					position: 'inside',
					fontSize: 10,
					fontWeight: 'bold',
					color: '#ffffff',
					formatter: (param) => formatValue(withRogues[param.dataIndex].rogues.count, '', 0)
				},
				tooltip: { formatter: (param) => apTooltip(withRogues[param.dataIndex]) },
				data: withRogues.map((ap) => ({
					name: ap.name,
					value: point(ap),
					itemStyle: { color: ap.rogues.count > 0 ? ROGUE_COLOUR : theme.mutedText }
				}))
			}
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
