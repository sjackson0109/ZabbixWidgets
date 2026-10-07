import { describe, expect, it } from 'vitest';
import { evaluateCondition, getChart, listCharts, requiredControls, requiresHistory, visibleControls } from '../../src/registry/index.js';
import { RULES } from '../../src/validation/index.js';

const EXPECTED_IDS = [
	'column', 'stacked_bar', 'doughnut', 'bullet', 'radar', 'heatmap', 'candlestick',
	'bubble', 'gantt', 'tree', 'network', 'relationship', 'calendar_heatmap',
	'lld_table', 'pie', 'level_gauge', 'ranking_bar', 'treemap', 'sunburst', 'funnel',
	'line', 'area', 'status_matrix', 'state_timeline', 'sparkline_grid', 'threshold_band'
];

const REQUIRED_KEYS = ['id', 'code', 'name', 'renderer', 'roles', 'data', 'history', 'time_period', 'min_series', 'controls', 'rules'];

describe('chart registry', () => {
	it('defines every chart in order, with semantic ids and sequential codes', () => {
		expect(listCharts().map((chart) => chart.id)).toEqual(EXPECTED_IDS);
		expect(listCharts().map((chart) => chart.code)).toEqual(EXPECTED_IDS.map((_, index) => `C${String(index + 1).padStart(2, '0')}`));
	});

	it.each(EXPECTED_IDS)('%s has a complete definition', (id) => {
		const chart = getChart(id);
		for (const key of REQUIRED_KEYS) {
			expect(chart, key).toHaveProperty(key);
		}
		for (const rule of chart.rules) {
			expect(RULES, rule).toHaveProperty(rule);
		}
		for (const role of Object.values(chart.roles)) {
			expect(chart.controls).toContain(role.field);
		}
	});

	it('evaluates conditions', () => {
		expect(evaluateCondition('when:mode=a|b', { mode: 'b' })).toBe(true);
		expect(evaluateCondition('when:mode=a', {})).toBe(false);
		expect(() => evaluateCondition('sometimes')).toThrow();
	});

	it('only requests history where the contract needs it', () => {
		expect(requiresHistory(getChart('column'), {})).toBe(false);
		expect(requiresHistory(getChart('calendar_heatmap'), {})).toBe(true);
		expect(requiresHistory(getChart('heatmap'), { heat_x: 'host' })).toBe(false);
		expect(requiresHistory(getChart('heatmap'), { heat_x: 'time' })).toBe(true);
	});
});

describe('visibleControls', () => {
	it('hides line-chart style options for a doughnut', () => {
		const controls = visibleControls('doughnut', {});
		expect(controls).toContain('show_percent');
		expect(controls).not.toContain('group_by');
		expect(controls).not.toContain('time_period');
	});

	it('switches candlestick inputs with the OHLC mode', () => {
		expect(visibleControls('candlestick', { ohlc_mode: 'derived' })).toContain('items');
		expect(visibleControls('candlestick', { ohlc_mode: 'derived' })).not.toContain('open_items');
		expect(visibleControls('candlestick', { ohlc_mode: 'explicit' })).toContain('open_items');
		expect(visibleControls('candlestick', { ohlc_mode: 'explicit' })).not.toContain('items');
	});

	it('shows only the chosen bullet target source', () => {
		const controls = visibleControls('bullet', { target_source: 'macro', pair_by: 'host' });
		expect(controls).toContain('target_macro');
		expect(controls).not.toContain('target_items');
		expect(controls).not.toContain('target_constant');
		expect(controls).not.toContain('pair_tag');
	});

	it('exposes task mappings for Gantt and hides end or duration by timing mode', () => {
		expect(visibleControls('gantt', { gantt_timing: 'start_end' })).toEqual(expect.arrayContaining(['start_items', 'end_items']));
		expect(visibleControls('gantt', { gantt_timing: 'start_end' })).not.toContain('duration_items');
		expect(visibleControls('gantt', { gantt_timing: 'start_duration' })).not.toContain('end_items');
	});

	it('shows time controls for a heat map only on a time axis', () => {
		expect(visibleControls('heatmap', { heat_x: 'host' })).not.toContain('time_period');
		expect(visibleControls('heatmap', { heat_x: 'time' })).toEqual(expect.arrayContaining(['time_period', 'bucket']));
	});
});

describe('requiredControls', () => {
	it('requires a setting only while it is shown', () => {
		expect(requiredControls('bullet', { target_source: 'macro' })).toEqual(['target_macro']);
		expect(requiredControls('bullet', { target_source: 'item', pair_by: 'tag' })).toEqual(['pair_tag']);
		expect(requiredControls('relationship', {})).toEqual(['source_tag', 'target_tag']);
		expect(requiredControls('column', {})).toEqual([]);
	});

	it('handles values containing "="', () => {
		expect(evaluateCondition('when:mode=a=b', { mode: 'a=b' })).toBe(true);
	});
});

describe('stored values', () => {
	it('gives every chart a unique, stable form value', () => {
		const values = listCharts().map((chart) => chart.form_value);
		expect(values).toEqual(values.map((_, index) => index + 1));
	});
});
