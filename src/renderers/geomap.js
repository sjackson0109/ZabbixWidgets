/**
 * C32 Geographic Site Map: hosts placed at the latitude and longitude in
 * their Zabbix inventory, over a map that ships with the module.
 *
 * - Coordinates come only from the host inventory (location_lat and
 *   location_lon). A host without valid coordinates is listed by validation
 *   and not drawn: no position is guessed from a name or an address.
 * - The base map is the bundled world land outline (Natural Earth, public
 *   domain), a GeoJSON file an administrator put in the module's assets/geo
 *   folder, or none. Nothing is fetched from a map service.
 * - Links, when listed, join two sites ("site -> site : label | weight", as
 *   for the network diagram). A link says the sites are connected; its width
 *   shows a measured value only when its weight names an item.
 * - Sites can be coloured by thresholds on the site's one item value.
 *
 * The view starts around the sites, and zoom and pan are kept across
 * refreshes.
 */
import { echarts } from '../echarts.js';
import { baseOption } from './common.js';
import { linkWidth } from './network.js';
import { edgeWeight, parseEdgeList, resolveEdges } from '../data/edges.js';
import { bandColours, bandIndex, resolveScale } from '../data/thresholds.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';
import worldLand from '../data/geo/world-land.js';

const WORLD = 'zabbixwidgets-world-land';
let worldRegistered = false;

/** Registers the map a widget draws on and returns its name. Map names are prefixed so they never meet another module's. */
export function registerBaseMap(config, geo, sites) {
	if (config.geo_base === 'custom' && geo !== null) {
		const name = `zabbixwidgets-file-${String(config.geo_file ?? '').trim()}`;
		echarts.registerMap(name, geo);
		return name;
	}
	if (config.geo_base === 'none') {
		// An invisible frame around the sites gives the map component its extent.
		const [[west, north], [east, south]] = viewBox(sites);
		const name = 'zabbixwidgets-frame';
		echarts.registerMap(name, {
			type: 'FeatureCollection',
			features: [{ type: 'Feature', properties: { name: 'frame' }, geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } }]
		});
		return name;
	}
	if (!worldRegistered) {
		echarts.registerMap(WORLD, worldLand);
		worldRegistered = true;
	}
	return WORLD;
}

/** Sites: hosts with valid inventory coordinates, each with its items. */
export function geoSites(payload) {
	const values = payload.series.filter((entry) => entry.role === 'value');
	return payload.hosts
		.filter((host) => host.location?.valid)
		.map((host) => ({
			hostid: host.hostid,
			name: host.name,
			host,
			coords: [host.location.lon, host.location.lat],
			items: values.filter((entry) => entry.hostid === host.hostid)
		}));
}

/** The area to show: the sites with a margin, at least 4 degrees across. */
export function viewBox(sites) {
	if (sites.length === 0) {
		return [[-180, 85], [180, -60]];
	}
	const lons = sites.map((site) => site.coords[0]);
	const lats = sites.map((site) => site.coords[1]);
	const pad = (low, high, limit) => {
		const margin = Math.max(2, (high - low) * 0.15);
		return [Math.max(-limit, low - margin), Math.min(limit, high + margin)];
	};
	const [west, east] = pad(Math.min(...lons), Math.max(...lons), 180);
	const [south, north] = pad(Math.min(...lats), Math.max(...lats), 85);
	return [[west, north], [east, south]];
}

/** Links between sites, from the user's list; links to hosts without coordinates are left out (and reported). */
export function geoLinks(payload, sites) {
	const values = payload.series.filter((entry) => entry.role === 'value');
	const placed = new Map(sites.map((site) => [site.hostid, site]));
	const { resolved } = resolveEdges(parseEdgeList(payload.config.geo_links).edges, payload.hosts);
	return resolved
		.filter((edge) => placed.has(edge.sourceId) && placed.has(edge.targetId))
		.map((edge) => ({
			edge,
			from: placed.get(edge.sourceId),
			to: placed.get(edge.targetId),
			weight: edge.weight === null ? null : edgeWeight(edge, values)
		}));
}

export function captureGeoState(instance, state) {
	try {
		const geo = instance.getModel().getComponent('geo', 0);
		if (geo) {
			state.roam = { zoom: geo.get('zoom'), center: geo.get('center') };
		}
	}
	catch {
		// Nothing to keep.
	}
}

export function buildGeomapOption(payload, context) {
	const { config } = payload;
	const { theme } = context;
	const sites = geoSites(payload);
	const links = geoLinks(payload, sites);
	const map = registerBaseMap(config, payload.geo, sites);
	const roam = context.state?.roam ?? null;
	const byThresholds = config.site_colour === 'thresholds';
	const largest = Math.max(0, ...links.map((link) => link.weight?.value ?? 0));
	const format = (entry) => (entry.value === null ? 'no data' : formatValue(entry.value, entry.units, context.decimals));

	const siteColour = (site) => {
		if (!byThresholds || site.items.length !== 1 || typeof site.items[0].value !== 'number') {
			return byThresholds ? theme.neutral : theme.palette[0];
		}
		const scale = resolveScale({ thresholds: config.thresholds }, site.host);
		const colours = bandColours(scale.thresholds.length + 1, config.threshold_order);
		return colours[bandIndex(site.items[0].value, scale.thresholds)] ?? theme.neutral;
	};

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		geo: {
			map,
			roam: true,
			// Zoom and centre are relative to this first view, so it stays the same across refreshes.
			boundingCoords: viewBox(sites),
			zoom: roam?.zoom ?? 1,
			center: roam?.center ?? undefined,
			silent: true,
			label: { show: false },
			itemStyle: config.geo_base === 'none'
				? { areaColor: 'transparent', borderColor: 'transparent' }
				: { areaColor: theme.mode === 'dark' ? '#2f3a40' : '#e8eef1', borderColor: theme.axisLine, borderWidth: 0.6 },
			emphasis: { disabled: true }
		},
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				if (param.seriesType === 'lines') {
					const link = links[param.dataIndex];
					const lines = [`${escapeHtml(link.from.name)} → ${escapeHtml(link.to.name)}`];
					if (link.edge.label) {
						lines.push(escapeHtml(link.edge.label));
					}
					if (link.weight !== null) {
						const what = link.weight.entry === null ? 'Weight' : link.weight.entry.name;
						const value = link.weight.value === null ? 'no data' : formatValue(link.weight.value, link.weight.units, context.decimals);
						lines.push(`${escapeHtml(what)}: <b>${escapeHtml(value)}</b>`);
					}
					return lines.join('<br>');
				}
				const site = sites[param.dataIndex];
				const position = `${formatValue(site.coords[1], '', 4)}, ${formatValue(site.coords[0], '', 4)}`;
				return [
					`<b>${escapeHtml(site.name)}</b>`,
					`<span style="opacity:0.7">${escapeHtml(position)}</span>`,
					...site.items.map((entry) => `${escapeHtml(entry.name)}: <b>${escapeHtml(format(entry))}</b>`)
				].join('<br>');
			}
		},
		series: [
			{
				type: 'lines',
				coordinateSystem: 'geo',
				silent: false,
				lineStyle: { color: theme.mutedText, opacity: 0.8, curveness: 0.15 },
				data: links.map((link) => ({
					coords: [link.from.coords, link.to.coords],
					lineStyle: {
						width: link.weight === null ? 1.5 : linkWidth(link.weight, largest),
						type: link.weight !== null && link.weight.value === null ? 'dashed' : 'solid'
					}
				}))
			},
			{
				type: 'scatter',
				coordinateSystem: 'geo',
				symbolSize: 11,
				z: 3,
				label: {
					show: config.show_node_labels !== false,
					position: 'right',
					color: theme.text,
					formatter: (param) => sites[param.dataIndex].name
				},
				itemStyle: { borderColor: theme.tooltipBackground, borderWidth: 1 },
				data: sites.map((site) => ({ name: site.name, value: site.coords, itemStyle: { color: siteColour(site) } }))
			}
		]
	};
}

export default {
	id: 'geomap',
	buildOption: buildGeomapOption,
	captureState: captureGeoState
};
