/**
 * Owns one chart inside one widget: validates the payload, picks the renderer
 * and manages the ECharts instance. Everything is scoped to the widget's own
 * elements, and dispose() releases the instance and observers.
 *
 * Renderers either build an ECharts option (buildOption) or, with kind "dom",
 * draw HTML into the canvas element themselves (render). Both receive
 * context.state, which survives refreshes of the same chart so sorting,
 * paging, legend selection and zoom are kept when new data arrives. A
 * renderer may also read its drawn layout back first (captureState), as the
 * network diagram does for node positions.
 */
import { echarts } from '../echarts.js';
import { getChart } from '../registry/index.js';
import { getRenderer } from '../renderers/index.js';
import { normalisePayload } from '../data/normalise.js';
import { validate } from '../validation/index.js';
import { debounce } from '../utils/debounce.js';
import { detectTheme } from './theme.js';
import { renderMessages } from './messages.js';

const RESIZE_DELAY = 100;

/** Re-applies the legend selection and zoom window the user chose before the refresh. */
export function restoreView(option, state) {
	const restored = { ...option };
	if (state.legendSelected && option.legend?.show) {
		restored.legend = { ...option.legend, selected: { ...state.legendSelected } };
	}
	if (state.zoom && Array.isArray(option.dataZoom)) {
		restored.dataZoom = option.dataZoom.map((zoom) => ({ ...zoom, start: state.zoom.start, end: state.zoom.end }));
	}
	return restored;
}

export class ChartController {

	constructor(root) {
		this.root = root;
		this.canvas = root.querySelector('.zw-charts-canvas');
		this.messages = root.querySelector('.zw-charts-messages');
		this.instance = null;
		this.state = { chart: null };
		this.lastPayload = null;
		this.currentPayload = null;
		// Renderers that load something first (a floor plan's outline) ask to be drawn again once it is ready.
		// One function per widget, so a renderer can tell repeated requests apart.
		this.redraw = () => {
			if (this.currentPayload !== null) {
				this.render(this.currentPayload);
			}
		};
		this.resize = debounce(() => {
			this.instance?.resize();
			// Charts laid out for the widget's shape (several gauges in a grid) are laid out again.
			if (this.instance !== null && this.lastPayload !== null) {
				this.render(this.lastPayload);
			}
		}, RESIZE_DELAY);
		this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
		this.observer?.observe(this.canvas);
	}

	render(rawPayload) {
		this.currentPayload = rawPayload;
		const payload = normalisePayload(rawPayload ?? {});
		const chart = getChart(payload.chart);

		if (chart === null) {
			return this.showProblems({ errors: payload.errors.length
				? payload.errors.map((message) => ({ message }))
				: [{ message: 'Select a chart type.' }] });
		}

		const result = validate(chart, payload);
		if (!result.ok) {
			return this.showProblems(result);
		}

		const renderer = getRenderer(chart.renderer);
		if (renderer === null) {
			return this.showProblems({ ok: false, errors: [{ message: `${chart.name} is not available in this version yet.` }] });
		}

		const sameChart = this.state.chart === chart.id;
		if (!sameChart) {
			this.state = { chart: chart.id };
		}

		const context = {
			theme: detectTheme(this.root),
			showLegend: payload.config.show_legend !== false,
			decimals: Number.isInteger(payload.config.decimals) ? payload.config.decimals : 2,
			timeZone: payload.config.time_zone || undefined,
			redraw: this.redraw,
			aspect: this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0 ? this.canvas.clientWidth / this.canvas.clientHeight : undefined,
			state: this.state
		};

		this.canvas.hidden = false;
		renderMessages(this.messages, { warnings: result.warnings });

		if (renderer.kind === 'dom') {
			this.disposeInstance();
			this.canvas.dataset.zwView = 'dom';
			renderer.render(this.canvas, payload, context);
			return result;
		}

		if (this.canvas.dataset.zwView === 'dom') {
			this.canvas.replaceChildren();
		}
		this.canvas.dataset.zwView = 'echarts';

		if (this.instance === null) {
			this.instance = echarts.init(this.canvas, null, { renderer: 'canvas' });
			this.trackView(this.instance);
		}
		else if (sameChart && renderer.captureState) {
			// Layout the user arranged (dragged nodes, zoom, pan) is read back before the chart is rebuilt.
			renderer.captureState(this.instance, this.state);
		}
		this.instance.setOption(restoreView(renderer.buildOption(payload, context), this.state), { notMerge: true, lazyUpdate: true });
		this.lastPayload = renderer.sizeDependent ? rawPayload : null;
		this.instance.resize();
		return result;
	}

	/** Remembers what the user changed on the chart, so a refresh does not undo it. */
	trackView(instance) {
		instance.on?.('legendselectchanged', (event) => {
			this.state.legendSelected = { ...event.selected };
		});
		instance.on?.('datazoom', () => {
			const zoom = instance.getOption?.().dataZoom?.[0];
			if (zoom !== undefined) {
				this.state.zoom = { start: zoom.start, end: zoom.end };
			}
		});
	}

	showProblems(result) {
		this.lastPayload = null;
		this.instance?.clear();
		if (this.canvas.dataset.zwView === 'dom') {
			this.canvas.replaceChildren();
		}
		this.canvas.hidden = true;
		renderMessages(this.messages, result);
		return result;
	}

	disposeInstance() {
		this.lastPayload = null;
		this.instance?.dispose();
		this.instance = null;
	}

	dispose() {
		this.currentPayload = null;
		this.resize.cancel();
		this.observer?.disconnect();
		this.disposeInstance();
		if (this.canvas.dataset.zwView === 'dom') {
			this.canvas.replaceChildren();
		}
	}
}
