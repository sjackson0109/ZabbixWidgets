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
	it('shows Switch Port Panel sections only for the chosen identity, roles, grouping and colours', () => {
		const enums = definitions.enums;
		const form = buildForm({ chart: 'switch_ports' });
		initEditForm(form);
		expect(isShown(form, 'port_tag')).toBe(true);
		expect(isShown(form, 'port_regex')).toBe(false);
		expect(isShown(form, 'port_oper_items')).toBe(true);
		expect(isShown(form, 'port_poe_power_items')).toBe(false);
		expect(isShown(form, 'port_groups')).toBe(false);
		expect(isShown(form, 'speed_colours')).toBe(true);
		expect(isShown(form, 'thresholds')).toBe(false);
		expect(isShown(form, 'items')).toBe(false);

		const choose = (name, value) => {
			const radio = form.querySelector(`input[name="${name}"][value="${enums[name].indexOf(value)}"]`);
			radio.checked = true;
			radio.dispatchEvent(new Event('change', { bubbles: true }));
		};
		choose('port_identity', 'regex');
		choose('port_roles_shown', 'all');
		choose('port_grouping', 'definitions');
		choose('port_fill', 'thresholds');
		expect(isShown(form, 'port_tag')).toBe(false);
		expect(isShown(form, 'port_regex')).toBe(true);
		expect(isShown(form, 'port_number_group')).toBe(true);
		expect(isShown(form, 'port_poe_power_items')).toBe(true);
		expect(isShown(form, 'port_groups')).toBe(true);
		expect(isShown(form, 'thresholds')).toBe(true);
		expect(isShown(form, 'speed_colours')).toBe(false);
	});
});
