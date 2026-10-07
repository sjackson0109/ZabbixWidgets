/**
 * Dashboards store a chart as its form value and every enum setting as an
 * index into its list. Renumbering either would silently change saved
 * widgets, so the values recorded in tests/fixtures/stored-values.json may
 * only be added to: a chart keeps its form value, and an enum list may only
 * grow at the end.
 */
import { describe, expect, it } from 'vitest';
import definitions from '../../modules/extended-charts/registry/charts.json';
import stored from '../fixtures/stored-values.json';

describe('stored values stay stable', () => {
	it('keeps every recorded chart at its form value', () => {
		const current = Object.fromEntries(definitions.charts.map((chart) => [chart.id, chart.form_value]));
		for (const [id, value] of Object.entries(stored.form_values)) {
			expect([id, current[id]]).toEqual([id, value]);
		}
	});

	it('never reuses a form value', () => {
		const values = definitions.charts.map((chart) => chart.form_value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('only appends to enum lists', () => {
		for (const [name, list] of Object.entries(stored.enums)) {
			expect([name, definitions.enums[name]?.slice(0, list.length)]).toEqual([name, list]);
		}
	});

	it('records every chart and enum', () => {
		expect(Object.keys(stored.form_values).sort()).toEqual(definitions.charts.map((chart) => chart.id).sort());
		expect(Object.keys(stored.enums).sort()).toEqual(Object.keys(definitions.enums).sort());
	});
});
