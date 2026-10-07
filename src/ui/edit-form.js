/**
 * Edit form behaviour: shows only the controls the selected chart uses, and
 * re-evaluates whenever a setting that changes the required inputs is edited.
 */
import { ALL_CONTROLS, ENUMS, chartByFormValue, visibleControls } from '../registry/index.js';

const PLACEHOLDERS = {
	target_macro: '{$CPU.TARGET}',
	target_constant: '90',
	ranges: '50, 80',
	pair_tag: 'component',
	radar_max: '100',
	bucket: '1h',
	tree_tags: 'site, rack',
	tree_delimiter: '/',
	edge_list: 'core-router -> access-switch-1\naccess-switch-1 -> server-01',
	edge_tag: 'uplink',
	source_tag: 'source',
	target_tag: 'target',
	row_tag: 'interface',
	row_regex: '^Interface (.+?):',
	row_heading: 'Interface',
	table_columns: 'In = Interface *: Bits received\nOut = Interface *: Bits sent\nStatus = Interface *: Operational status'
};

const ENUM_FIELDS = Object.keys(ENUMS);

function controlsFor(form, name) {
	return [...form.querySelectorAll(`[name="${name}"], [name^="${name}["]`)];
}

/** The form rows (label and field) that hold a control. */
function rowsFor(form, name) {
	const rows = new Set();
	for (const control of controlsFor(form, name)) {
		const field = control.closest('.form-field, .fields-group');
		if (field === null) {
			continue;
		}
		rows.add(field);
		const label = field.previousElementSibling;
		if (label !== null && label.tagName === 'LABEL') {
			rows.add(label);
		}
	}
	return [...rows];
}

function readValue(form, name) {
	const checked = form.querySelector(`[name="${name}"]:checked`);
	if (checked !== null) {
		return checked.value;
	}
	const control = form.querySelector(`[name="${name}"]`);
	return control === null ? null : control.value;
}

/** Current configuration in registry terms (enum strings, chart id). */
export function readConfig(form) {
	const config = {};
	for (const name of ENUM_FIELDS) {
		const stored = readValue(form, name);
		config[name] = stored === null ? undefined : ENUMS[name][Number(stored)];
	}
	const chart = chartByFormValue(Number(readValue(form, 'chart_type')));
	return { chartId: chart?.id ?? null, config };
}

export function updateVisibility(form) {
	const { chartId, config } = readConfig(form);
	const visible = new Set(visibleControls(chartId, config));

	for (const name of ALL_CONTROLS) {
		for (const row of rowsFor(form, name)) {
			row.style.display = visible.has(name) ? '' : 'none';
		}
	}
}

/**
 * The widget configuration form. Its id differs between Zabbix releases, so
 * the known id is tried first and then the form inside the open dialogue.
 */
export function findEditForm() {
	return document.getElementById('widget-dialogue-form')
		?? [...document.querySelectorAll('.overlay-dialogue form')].pop()
		?? null;
}

export function initEditForm(form = findEditForm()) {
	if (form === null) {
		return;
	}

	for (const [name, placeholder] of Object.entries(PLACEHOLDERS)) {
		for (const control of controlsFor(form, name)) {
			if (control.placeholder === '') {
				control.placeholder = placeholder;
			}
		}
	}

	const watched = new Set(['chart_type', ...ENUM_FIELDS]);
	form.addEventListener('change', (event) => {
		const name = event.target?.getAttribute?.('name');
		if (name !== null && watched.has(name)) {
			updateVisibility(form);
		}
	});

	updateVisibility(form);
}
