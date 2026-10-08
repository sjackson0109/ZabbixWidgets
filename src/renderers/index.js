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
import funnel from './funnel.js';
import levelGauge from './level_gauge.js';
import lldTable from './lld_table.js';
import pie from './pie.js';
import rankingBar from './ranking_bar.js';
import sunburst from './sunburst.js';
import treemap from './treemap.js';
import network from './network.js';
import radar from './radar.js';
import relationship from './relationship.js';
import stackedBar from './stacked_bar.js';
import tree from './tree.js';
import line from './line.js';
import area from './area.js';
import statusMatrix from './status_matrix.js';
import stateTimeline from './state_timeline.js';
import sparklineGrid from './sparkline_grid.js';
import thresholdBand from './threshold_band.js';
import switchPorts from './switch_ports.js';
import mixed from './mixed.js';
import distribution from './distribution.js';
import parallel from './parallel.js';
import sankey from './sankey.js';
import geomap from './geomap.js';
import waterfall from './waterfall.js';

const RENDERERS = new Map([
	column, stackedBar, doughnut, bullet, radar, heatmap, candlestick, bubble, gantt, tree, network, relationship, calendarHeatmap,
	lldTable, pie, levelGauge, rankingBar, treemap, sunburst, funnel, line, area, statusMatrix, stateTimeline, sparklineGrid, thresholdBand,
	switchPorts, mixed, distribution, parallel, sankey, geomap, waterfall
].map((renderer) => [renderer.id, renderer]));

export function getRenderer(id) {
	return RENDERERS.get(id) ?? null;
}
