/**
 * Every chart's sample payload passes its contract and renders through the
 * module's own ECharts build (server-side, to SVG) without warnings. This
 * catches options that ECharts rejects and components that are used but not
 * registered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SVGRenderer } from 'echarts/renderers';
import { echarts } from '../../src/echarts.js';
import { listCharts } from '../../src/registry/index.js';
import { getRenderer } from '../../src/renderers/index.js';
import { normalisePayload } from '../../src/data/normalise.js';
import { validate } from '../../src/validation/index.js';
import { themeByName } from '../../src/ui/theme.js';
import { sample } from '../fixtures/samples.js';

echarts.use([SVGRenderer]);

function render(option) {
	const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 640, height: 320 });
	try {
		chart.setOption(option);
		return chart.renderToSVGString();
	}
	finally {
		chart.dispose();
	}
}

describe.each(listCharts().map((chart) => [chart.id, chart]))('%s', (id, chart) => {
	let warn;
	let fail;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn');
		fail = vi.spyOn(console, 'error');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('has a renderer', () => {
		expect(getRenderer(chart.renderer)).not.toBeNull();
	});

	for (const theme of ['light', 'dark']) {
		it(`renders its sample payload in the ${theme} theme`, () => {
			const payload = normalisePayload(sample(id));
			const result = validate(chart, payload);
			expect(result.errors).toEqual([]);

			const context = { theme: themeByName(theme), showLegend: true, decimals: 2, timeZone: 'Europe/London' };
			const svg = render(getRenderer(chart.renderer).buildOption(payload, context));
			expect(svg).toContain('<svg');
			expect(svg.length).toBeGreaterThan(1000);
			expect(warn).not.toHaveBeenCalled();
			expect(fail).not.toHaveBeenCalled();
		});
	}
});
