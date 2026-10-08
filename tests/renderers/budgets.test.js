// @vitest-environment jsdom
/**
 * S11: the data-heavy charts stay within a time budget at the sizes the
 * server allows (DataProvider::MAX_ITEMS per role) and draw everything they
 * are given, without truncating. Budgets are generous for slow CI runners;
 * they catch accidental quadratic work, not small regressions.
 */
import { describe, expect, it } from 'vitest';
import { getChart } from '../../src/registry/index.js';
import { getRenderer } from '../../src/renderers/index.js';
import { validate } from '../../src/validation/index.js';
import { themeByName } from '../../src/ui/theme.js';
import { item, payload } from '../fixtures/payload.js';

const BUDGET_MS = 1500;
const NOW = 1700000000;
const context = () => ({ theme: themeByName('light'), showLegend: true, decimals: 2, timeZone: 'UTC', state: {} });

function timed(id, data) {
	const started = performance.now();
	const result = validate(getChart(id), data);
	const renderer = getRenderer(id);
	const container = document.createElement('div');
	if (renderer.kind === 'dom') {
		renderer.render(container, data, context());
	}
	else {
		renderer.buildOption(data, context());
	}
	return { ms: performance.now() - started, result, container };
}

const history = (count, step, value) => Array.from({ length: count }, (_, index) => [NOW - (count - index) * step, value(index)]);

describe('performance budgets', () => {
	it('C14 LLD data table: 500 items in 250 rows', () => {
		const series = Array.from({ length: 250 }, (_, index) => ['In', 'Out'].map((column) => item({
			name: `Interface if${index}: ${column}`, units: 'bps', value: String(index * 10), tags: [{ tag: 'interface', value: `if${index}` }]
		}))).flat();
		const { ms, result, container } = timed('lld_table', payload('lld_table', {
			config: { row_identity: 'tag', row_tag: 'interface', table_columns: 'In = Interface *: In\nOut = Interface *: Out', table_page_size: '100' }, series
		}));
		expect(result.errors).toEqual([]);
		expect(container.textContent).toContain('of 250');
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('C23 status matrix: 500 cells', () => {
		const series = Array.from({ length: 500 }, (_, index) => item({
			hostid: String(1 + (index % 25)), host: `host${index % 25}`, name: `Check ${Math.floor(index / 25)}`, units: '', value: String(index % 3)
		}));
		const { ms, result, container } = timed('status_matrix', payload('status_matrix', { config: { matrix_rows: 'host', colour_by: 'none' }, series }));
		expect(result.errors).toEqual([]);
		expect(container.querySelectorAll('.zw-matrix-cell')).toHaveLength(500);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('C24 state timeline: 50 items with 2000 states each', () => {
		const series = Array.from({ length: 50 }, (_, index) => item({
			name: `State ${index}`, units: '', value_type: 3, value: '1', delay: 60,
			history: history(2000, 60, (step) => String(1 + (Math.floor(step / 37) % 3)))
		}));
		const { ms, result } = timed('state_timeline', payload('state_timeline', {
			config: { colour_map: '', max_gap: '' }, series, time_period: { from: NOW - 2000 * 60, to: NOW }
		}));
		expect(result.errors).toEqual([]);
		expect(ms).toBeLessThan(BUDGET_MS);
	});

	it('C25 sparkline grid: 100 tiles with 1000 points each', () => {
		const series = Array.from({ length: 100 }, (_, index) => item({
			hostid: String(index), host: `host${index}`, value: '5', delay: 60, history: history(1000, 60, (step) => String((step * 7) % 100))
		}));
		const { ms, result, container } = timed('sparkline_grid', payload('sparkline_grid', {
			config: { grid_columns: 0, tile_sort: 'name', rank_limit: 'all', max_gap: '' }, series, time_period: { from: NOW - 60000, to: NOW }
		}));
		expect(result.errors).toEqual([]);
		expect(container.querySelectorAll('svg')).toHaveLength(100);
		expect(ms).toBeLessThan(BUDGET_MS);
	});
});
