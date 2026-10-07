/**
 * Renderer lookup. Each chart id in the registry maps to one renderer module.
 * A chart whose renderer is missing is reported as unavailable rather than
 * drawn with a stand-in.
 */
import bubble from './bubble.js';
import bullet from './bullet.js';
import calendarHeatmap from './calendar_heatmap.js';
import candlestick from './candlestick.js';
import column from './column.js';
import doughnut from './doughnut.js';
import gantt from './gantt.js';
import heatmap from './heatmap.js';
import network from './network.js';
import radar from './radar.js';
import relationship from './relationship.js';
import stackedBar from './stacked_bar.js';
import tree from './tree.js';

const RENDERERS = new Map([
	column, stackedBar, doughnut, bullet, radar, heatmap, candlestick, bubble, gantt, tree, network, relationship, calendarHeatmap
].map((renderer) => [renderer.id, renderer]));

export function getRenderer(id) {
	return RENDERERS.get(id) ?? null;
}
