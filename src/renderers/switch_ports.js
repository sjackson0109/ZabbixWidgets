/**
 * C27 Switch Port Panel: one tile per interface, laid out like the front of
 * a switch, drawn as HTML so it scales with the widget.
 *
 * The panel visualises interface items that already exist in Zabbix; it
 * discovers nothing and polls nothing (see data/ports.js for how items become
 * ports). Each tile's fill, border, markers and labels come from the user's
 * channel choices. Meaning is never carried by colour alone: admin-down ports
 * have a dotted border and a marker, problems a marker with a "!", unknown
 * values a hatched fill, and every tile has a text label for screen readers.
 *
 * Tile positions are fixed grid cells, so resizing the widget changes the
 * tile size but never the arrangement. Arrow keys move between tiles.
 */
import { buildPanel, portLink, portVisual, speedPalette, statusColourMap } from '../data/ports.js';
import { applyThemeVariables } from '../ui/theme.js';
import { el, replaceKeepingFocus } from '../utils/dom.js';
import { readableText } from '../utils/colour.js';

const MAX_TOOLTIP_PROBLEMS = 5;
const TOOLTIP_GAP = 8;

/** All the tiles the panel draws, grouped as the panel shows them, with their visuals. */
export function panelModel(payload, context, now = Date.now() / 1000) {
	const { config } = payload;
	const panel = buildPanel(payload);
	const palette = speedPalette(config.speed_colours);
	const { entries: statusColours } = statusColourMap(config.state_colours);
	const hosts = new Map(payload.hosts.map((host) => [host.hostid, host]));
	const options = { palette, statusColours, severities: payload.severities, now, decimals: context.decimals };
	const multipleSections = panel.sections.length > 1;

	const sections = panel.sections.map((section) => ({
		...section,
		title: multipleSections || section.member !== null
			? [multipleSections ? section.host : null, section.member === null ? null : `Member ${section.member}`].filter(Boolean).join(' · ')
			: '',
		groups: section.groups.map((group) => ({
			...group,
			tiles: group.layout.cells.map((cell) => ({
				...cell,
				visual: portVisual(cell.port, config, { ...options, host: hosts.get(cell.port.hostid) ?? null }),
				link: portLink(cell.port, config.port_click ?? 'none')
			}))
		}))
	}));
	return { ...panel, sections, palette };
}

function tileStyle(visual) {
	const style = {};
	if (visual.fill !== null) {
		style['--zw-port-fill'] = visual.fill;
		style['--zw-port-ink'] = readableText(visual.fill) ?? 'inherit';
	}
	if (visual.border !== null) {
		style['--zw-port-border'] = visual.border;
	}
	style['--zw-port-border-style'] = visual.borderStyle;
	return style;
}

function tileClass(tile) {
	const { visual } = tile;
	return [
		'zw-port',
		`zw-port-${tile.port.type?.shape ?? 'socket'}`,
		visual.fill === null ? 'zw-port-neutral' : '',
		visual.fill === null && visual.unknownFill ? 'zw-port-unknown' : '',
		visual.adminDown ? 'zw-port-admin-down' : '',
		visual.stale ? 'zw-port-stale' : '',
		tile.row % 2 === 1 ? 'zw-port-lower' : 'zw-port-upper'
	].filter(Boolean).join(' ');
}

function renderTile(tile, focusKey) {
	const { port, visual } = tile;
	const children = [
		el('span', { className: 'zw-port-label', text: visual.label }),
		visual.sublabel === '' ? null : el('span', { className: 'zw-port-sub', text: visual.sublabel }),
		visual.markAdmin ? el('span', { className: 'zw-port-mark zw-port-mark-admin', text: '⊘', attrs: { 'aria-hidden': 'true' } }) : null,
		visual.markProblem === null ? null : el('span', {
			className: 'zw-port-mark zw-port-mark-problem',
			text: '!',
			style: { 'background-color': visual.markProblem, color: readableText(visual.markProblem) ?? '#000000' },
			attrs: { 'aria-hidden': 'true' }
		}),
		visual.utilisation === null ? null : el('span', { className: 'zw-port-util', attrs: { 'aria-hidden': 'true' } }, [
			el('span', { style: { width: `${visual.utilisation}%` } })
		])
	];
	return el(tile.link === null ? 'div' : 'a', {
		className: tileClass(tile),
		style: { ...tileStyle(visual), 'grid-column': String(tile.column + 1), 'grid-row': String(tile.row + 1) },
		attrs: {
			href: tile.link ?? undefined,
			role: tile.link === null ? 'img' : undefined,
			tabindex: encodeURIComponent(port.key) === focusKey ? '0' : '-1',
			'aria-label': visual.aria,
			// Port keys hold a NUL separator, which cannot appear in a selector; encoding keeps them selector-safe.
			'data-zw-focus': `port:${encodeURIComponent(port.key)}`,
			'data-zw-port': encodeURIComponent(port.key),
			'data-column': String(tile.column),
			'data-row': String(tile.row)
		}
	}, children);
}

function renderGroup(group, focusKey) {
	const columns = Math.max(1, group.layout.columns);
	return el('div', {
		className: 'zw-port-group',
		style: { '--zw-port-columns': String(columns), 'flex-grow': String(columns) },
		attrs: { role: 'group', 'aria-label': group.name || undefined }
	}, [
		group.name === '' ? null : el('div', { className: 'zw-port-group-name', text: group.name, title: group.name }),
		el('div', { className: 'zw-port-grid' }, group.tiles.map((tile) => renderTile(tile, focusKey)))
	]);
}

/** Legend entries for the colours and marks actually on the panel. */
export function panelLegend(model, config) {
	const fills = new Map();
	const borders = new Map();
	let adminDown = false;
	let problem = false;
	let unknown = false;
	let stale = false;
	for (const section of model.sections) {
		for (const group of section.groups) {
			for (const { visual } of group.tiles) {
				if (visual.fill !== null && visual.fillLabel !== '') {
					fills.set(visual.fillLabel, visual.fill);
				}
				if (visual.fill === null && visual.unknownFill) {
					unknown = true;
				}
				if (visual.border !== null && visual.borderLabel !== '') {
					borders.set(visual.borderLabel, visual.border);
				}
				adminDown ||= visual.adminDown;
				problem ||= visual.markProblem !== null;
				stale ||= visual.stale;
			}
		}
	}
	const speeds = config.port_fill === 'neg_speed' || config.port_fill === 'cfg_speed' || config.port_fill === undefined;
	const order = speeds ? model.palette.buckets.map((bucket) => bucket.label) : [];
	const sorted = [...fills.entries()].sort(([a], [b]) => {
		const [x, y] = [order.indexOf(a), order.indexOf(b)];
		return (x === -1) - (y === -1) || x - y || a.localeCompare(b);
	});
	return [
		...sorted.map(([label, colour]) => ({ kind: 'fill', label, colour })),
		...(unknown ? [{ kind: 'unknown', label: speeds ? 'Unknown speed' : 'No data' }] : []),
		...[...borders.entries()].map(([label, colour]) => ({ kind: 'border', label, colour })),
		...(adminDown ? [{ kind: 'admin', label: 'Administratively down' }] : []),
		...(problem ? [{ kind: 'problem', label: 'Active problem' }] : []),
		...(stale ? [{ kind: 'stale', label: 'Stale data' }] : [])
	];
}

function renderLegend(entries) {
	return el('div', { className: 'zw-port-legend' }, entries.map((entry) => el('span', { className: 'zw-port-legend-entry' }, [
		el('span', {
			className: `zw-port-key zw-port-key-${entry.kind}`,
			style: entry.kind === 'fill' ? { 'background-color': entry.colour } : entry.kind === 'border' ? { 'border-color': entry.colour } : {},
			text: entry.kind === 'admin' ? '⊘' : entry.kind === 'problem' ? '!' : undefined,
			attrs: { 'aria-hidden': 'true' }
		}),
		el('span', { text: entry.label })
	])));
}

function tooltipContent(tile, payload) {
	const { port, visual } = tile;
	const rows = visual.tooltip.map((row) => el('tr', {}, [el('th', { text: row.label, attrs: { scope: 'row' } }), el('td', { text: row.value })]));
	const problems = port.problems.slice(0, MAX_TOOLTIP_PROBLEMS).map((problem) => el('li', {}, [
		el('span', {
			className: 'zw-port-tip-severity',
			style: { 'background-color': payload.severities[problem.severity]?.color ?? 'transparent' },
			attrs: { 'aria-hidden': 'true' }
		}),
		el('span', { text: `${payload.severities[problem.severity]?.name ?? problem.severity}: ${problem.name}` })
	]));
	if (port.problems.length > MAX_TOOLTIP_PROBLEMS) {
		problems.push(el('li', { text: `and ${port.problems.length - MAX_TOOLTIP_PROBLEMS} more` }));
	}
	return [
		el('table', {}, [el('tbody', {}, rows)]),
		problems.length === 0 ? null : el('div', { className: 'zw-port-tip-heading', text: 'Active problems' }),
		problems.length === 0 ? null : el('ul', {}, problems),
		...visual.missing.map((text) => el('div', { className: 'zw-port-tip-note', text }))
	];
}

/** Places the tooltip next to a tile, flipped and clamped so it stays inside the window. */
export function placeTooltip(tip, anchor, view = { width: window.innerWidth, height: window.innerHeight }) {
	const box = anchor.getBoundingClientRect();
	const size = tip.getBoundingClientRect();
	let left = box.left + box.width / 2 - size.width / 2;
	let top = box.bottom + TOOLTIP_GAP;
	if (top + size.height > view.height - TOOLTIP_GAP) {
		top = box.top - TOOLTIP_GAP - size.height;
	}
	left = Math.min(Math.max(TOOLTIP_GAP, left), Math.max(TOOLTIP_GAP, view.width - size.width - TOOLTIP_GAP));
	top = Math.min(Math.max(TOOLTIP_GAP, top), Math.max(TOOLTIP_GAP, view.height - size.height - TOOLTIP_GAP));
	tip.style.left = `${Math.round(left)}px`;
	tip.style.top = `${Math.round(top)}px`;
}

/** Arrow keys, Home and End move between tiles of one group by grid position. */
function moveFocus(event) {
	const tile = event.target.closest?.('[data-zw-port]');
	if (!tile) {
		return;
	}
	const grid = tile.parentElement;
	const tiles = [...grid.children];
	const column = Number(tile.dataset.column);
	const row = Number(tile.dataset.row);
	const at = (c, r) => tiles.find((candidate) => Number(candidate.dataset.column) === c && Number(candidate.dataset.row) === r);
	const nearest = (step) => {
		// Skip empty places (gaps in the numbering) in the direction of travel.
		const [dc, dr] = step;
		for (let c = column + dc, r = row + dr, guard = 0; guard < 1024; c += dc, r += dr, guard++) {
			if (c < 0 || r < 0 || c > 1024 || r > 1024) {
				return null;
			}
			const found = at(c, r);
			if (found) {
				return found;
			}
		}
		return null;
	};
	let target;
	switch (event.key) {
		case 'ArrowRight':
			target = nearest([1, 0]);
			break;
		case 'ArrowLeft':
			target = nearest([-1, 0]);
			break;
		case 'ArrowDown':
			target = nearest([0, 1]);
			break;
		case 'ArrowUp':
			target = nearest([0, -1]);
			break;
		case 'Home':
			target = tiles[0];
			break;
		case 'End':
			target = tiles[tiles.length - 1];
			break;
		default:
			return;
	}
	event.preventDefault();
	if (target) {
		tile.tabIndex = -1;
		target.tabIndex = 0;
		target.focus();
	}
}

export function renderSwitchPorts(container, payload, context) {
	const { config } = payload;
	const model = panelModel(payload, context);
	const tiles = new Map();
	for (const section of model.sections) {
		for (const group of section.groups) {
			for (const tile of group.tiles) {
				tiles.set(encodeURIComponent(tile.port.key), tile);
			}
		}
	}
	const state = context.state;
	if (!tiles.has(state.portFocus)) {
		state.portFocus = tiles.keys().next().value ?? null;
	}

	const tip = el('div', { className: 'zw-port-tip', attrs: { role: 'tooltip', hidden: true } });
	const show = (event) => {
		const element = event.target.closest?.('[data-zw-port]');
		const tile = element ? tiles.get(element.dataset.zwPort) : undefined;
		if (tile === undefined) {
			return;
		}
		tip.replaceChildren(...tooltipContent(tile, payload).filter(Boolean));
		tip.hidden = false;
		placeTooltip(tip, element);
	};
	const hide = () => {
		tip.hidden = true;
	};

	const root = el('div', {
		className: 'zw-ports',
		on: {
			mouseover: show,
			focusin: (event) => {
				const key = event.target.dataset?.zwPort;
				if (key !== undefined) {
					state.portFocus = key;
				}
				show(event);
			},
			mouseleave: hide,
			focusout: hide,
			keydown: (event) => {
				if (event.key === 'Escape') {
					hide();
					return;
				}
				moveFocus(event);
			}
		}
	}, [
		el('div', { className: 'zw-port-panel' }, model.sections.map((section) => el('section', {
			className: 'zw-port-section',
			attrs: { 'aria-label': section.title || 'Ports' }
		}, [
			section.title === '' ? null : el('div', { className: 'zw-port-section-title', text: section.title, title: section.title }),
			el('div', { className: 'zw-port-groups' }, section.groups.map((group) => renderGroup(group, state.portFocus)))
		]))),
		context.showLegend ? renderLegend(panelLegend(model, config)) : null,
		tip
	]);
	applyThemeVariables(root, context.theme);
	replaceKeepingFocus(container, () => root);
}

export default {
	id: 'switch_ports',
	kind: 'dom',
	render: renderSwitchPorts
};
