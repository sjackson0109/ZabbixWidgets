/**
 * Owns one chart inside one widget: validates the payload, picks the renderer
 * and manages the ECharts instance. Everything is scoped to the widget's own
 * elements, and dispose() releases the instance and observers.
 *
 * Renderers either build an ECharts option (buildOption) or, with kind "dom",
 * draw HTML into the canvas element themselves (render). Both receive
 * context.state, which survives refreshes of the same chart so sorting,
 * paging, legend selection and zoom are kept when new data arrives.
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
		this.resize = debounce(() => this.instance?.resize(), RESIZE_DELAY);
		this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
		this.observer?.observe(this.canvas);
	}

	render(rawPayload) {
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

		if (this.state.chart !== chart.id) {
			this.state = { chart: chart.id };
		}

		const context = {
			theme: detectTheme(this.root),
			showLegend: payload.config.show_legend !== false,
			decimals: Number.isInteger(payload.config.decimals) ? payload.config.decimals : 2,
			timeZone: payload.config.time_zone || undefined,
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
		this.instance.setOption(restoreView(renderer.buildOption(payload, context), this.state), { notMerge: true, lazyUpdate: true });
		this.resize();
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
		this.instance?.clear();
		if (this.canvas.dataset.zwView === 'dom') {
			this.canvas.replaceChildren();
		}
		this.canvas.hidden = true;
		renderMessages(this.messages, result);
		return result;
	}

	disposeInstance() {
		this.instance?.dispose();
		this.instance = null;
	}

	dispose() {
		this.resize.cancel();
		this.observer?.disconnect();
		this.disposeInstance();
		if (this.canvas.dataset.zwView === 'dom') {
			this.canvas.replaceChildren();
		}
	}
}
