/**
 * Owns one chart inside one widget: validates the payload, picks the renderer
 * and manages the ECharts instance. Everything is scoped to the widget's own
 * elements, and dispose() releases the instance and observers.
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

export class ChartController {

	constructor(root) {
		this.root = root;
		this.canvas = root.querySelector('.zw-charts-canvas');
		this.messages = root.querySelector('.zw-charts-messages');
		this.instance = null;
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

		const context = {
			theme: detectTheme(this.root),
			showLegend: payload.config.show_legend !== false,
			decimals: Number.isInteger(payload.config.decimals) ? payload.config.decimals : 2,
			timeZone: payload.config.time_zone || undefined
		};

		this.canvas.hidden = false;
		renderMessages(this.messages, { warnings: result.warnings });

		if (this.instance === null) {
			this.instance = echarts.init(this.canvas, null, { renderer: 'canvas' });
		}
		this.instance.setOption(renderer.buildOption(payload, context), { notMerge: true, lazyUpdate: true });
		this.resize();
		return result;
	}

	showProblems(result) {
		this.instance?.clear();
		this.canvas.hidden = true;
		renderMessages(this.messages, result);
		return result;
	}

	dispose() {
		this.resize.cancel();
		this.observer?.disconnect();
		this.instance?.dispose();
		this.instance = null;
	}
}
