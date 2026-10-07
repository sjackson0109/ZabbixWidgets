/**
 * Browser entry point. Exposes exactly two globals: the widget class Zabbix
 * instantiates by name, and a small namespace used by the edit form.
 */
import { createWidgetClass } from './ui/widget.js';
import { initEditForm } from './ui/edit-form.js';

/* global CWidget, __ZW_VERSION__, __ECHARTS_VERSION__ */

if (typeof CWidget === 'function') {
	window.WidgetZabbixWidgetsCharts = createWidgetClass(CWidget);
}

window.ZabbixWidgetsCharts = Object.freeze({
	version: __ZW_VERSION__,
	echartsVersion: __ECHARTS_VERSION__,
	initEditForm
});
