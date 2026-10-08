// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import definitions from '../../modules/extended-charts/registry/charts.json';
import { initEditForm, readConfig } from '../../src/ui/edit-form.js';

/** Builds a form shaped like the Zabbix widget dialogue: label + .form-field per control. */
function buildForm({ chart, enums = {} }) {
	const form = document.createElement('form');
	form.id = 'widget-dialogue-form';
	const fields = new Set([...definitions.common_controls, ...definitions.charts.flatMap((entry) => entry.controls)]);

	for (const name of fields) {
		const label = document.createElement('label');
		label.textContent = name;
		const field = document.createElement('div');
		field.className = 'form-field';
		field.dataset.field = name;

		if (name in definitions.enums) {
			definitions.enums[name].forEach((_, index) => {
				const radio = document.createElement('input');
				radio.type = 'radio';
				radio.name = name;
				radio.value = String(index);
				radio.checked = index === (enums[name] ?? 0);
				field.append(radio);
			});
		}
		else if (name === 'chart_type') {
			const select = document.createElement('select');
			select.name = name;
			for (const entry of definitions.charts) {
				select.append(new Option(entry.name, String(entry.form_value), false, entry.id === chart));
			}
			field.append(select);
		}
		else {
			const input = document.createElement('input');
			input.name = name.endsWith('items') || name.endsWith('ids') ? `${name}[]` : name;
			field.append(input);
		}
		form.append(label, field);
	}
	document.body.replaceChildren(form);
	return form;
}

const isShown = (form, name) => form.querySelector(`[data-field="${name}"]`).style.display !== 'none';

describe('edit form', () => {
	it('reads the configuration in registry terms', () => {
		const form = buildForm({ chart: 'bullet', enums: { target_source: 2 } });
		expect(readConfig(form)).toMatchObject({ chartId: 'bullet', config: { target_source: 'constant' } });
	});

	it('hides controls the doughnut does not use', () => {
		const form = buildForm({ chart: 'doughnut' });
		initEditForm(form);
		expect(isShown(form, 'show_percent')).toBe(true);
		expect(isShown(form, 'items')).toBe(true);
		expect(isShown(form, 'group_by')).toBe(false);
		expect(isShown(form, 'start_items')).toBe(false);
		expect(isShown(form, 'time_period')).toBe(false);
		expect(form.querySelector('[data-field="group_by"]').previousElementSibling.style.display).toBe('none');
	});

	it('shows task mappings for Gantt', () => {
		const form = buildForm({ chart: 'gantt' });
		initEditForm(form);
		expect(isShown(form, 'start_items')).toBe(true);
		expect(isShown(form, 'end_items')).toBe(true);
		expect(isShown(form, 'duration_items')).toBe(false);
		expect(isShown(form, 'items')).toBe(false);
	});

	it('updates when the chart type or a mode changes', () => {
		const form = buildForm({ chart: 'column' });
		initEditForm(form);
		const select = form.querySelector('select[name="chart_type"]');
		select.value = String(definitions.charts.find((entry) => entry.id === 'candlestick').form_value);
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(isShown(form, 'items')).toBe(true);
		expect(isShown(form, 'open_items')).toBe(false);

		const explicit = form.querySelector('input[name="ohlc_mode"][value="1"]');
		explicit.checked = true;
		explicit.dispatchEvent(new Event('change', { bubbles: true }));
		expect(isShown(form, 'open_items')).toBe(true);
		expect(isShown(form, 'items')).toBe(false);
	});

	it('adds example placeholders', () => {
		const form = buildForm({ chart: 'bullet' });
		initEditForm(form);
		expect(form.querySelector('[name="target_macro"]').placeholder).toBe('{$CPU.TARGET}');
	});
});

describe('edit form with empty multiselects', () => {
	it('hides a pattern field that has no items yet, as Zabbix draws it', () => {
		const form = buildForm({ chart: 'column' });
		// Zabbix renders an empty multiselect as a container with the field name in its id and no named input.
		for (const name of ['start_items', 'items']) {
			const field = form.querySelector(`[data-field="${name}"]`);
			field.replaceChildren();
			const multiselect = document.createElement('div');
			multiselect.className = 'multiselect';
			multiselect.id = `${name}_`;
			field.append(multiselect);
		}
		initEditForm(form);
		expect(isShown(form, 'start_items')).toBe(false);
		expect(isShown(form, 'items')).toBe(true);
	});
});

describe('edit form for the new presentations', () => {
	const enums = definitions.enums;
	const choose = (form, name, value) => {
		const radio = form.querySelector(`input[name="${name}"][value="${enums[name].indexOf(value)}"]`);
		radio.checked = true;
		radio.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const formFor = (chart) => {
		const form = buildForm({ chart });
		initEditForm(form);
		return form;
	};

	it('shows network positions and the colour tag only when chosen', () => {
		const form = formFor('network');
		expect(isShown(form, 'node_positions')).toBe(false);
		expect(isShown(form, 'node_category_tag')).toBe(false);
		choose(form, 'network_layout', 'fixed');
		choose(form, 'node_category', 'tag');
		expect(isShown(form, 'node_positions')).toBe(true);
		expect(isShown(form, 'node_category_tag')).toBe(true);
	});

	it('shows opposing items only for diverging bars', () => {
		const form = formFor('stacked_bar');
		expect(isShown(form, 'opposing_items')).toBe(false);
		choose(form, 'stack_mode', 'diverging');
		expect(isShown(form, 'opposing_items')).toBe(true);
	});

	it('hides smoothing for stepped lines', () => {
		const form = formFor('line');
		expect(isShown(form, 'smooth')).toBe(true);
		choose(form, 'line_step', 'after');
		expect(isShown(form, 'smooth')).toBe(false);
	});

	it('shows the map file and thresholds only when chosen', () => {
		const form = formFor('geomap');
		expect(isShown(form, 'geo_file')).toBe(false);
		expect(isShown(form, 'thresholds')).toBe(false);
		choose(form, 'geo_base', 'custom');
		choose(form, 'site_colour', 'thresholds');
		expect(isShown(form, 'geo_file')).toBe(true);
		expect(isShown(form, 'thresholds')).toBe(true);
	});

	it('hides size items for a plain scatter', () => {
		const form = formFor('bubble');
		expect(isShown(form, 'size_items')).toBe(true);
		choose(form, 'bubble_size', 'none');
		expect(isShown(form, 'size_items')).toBe(false);
	});
});
