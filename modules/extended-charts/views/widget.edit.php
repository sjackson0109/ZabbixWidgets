<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 *
 * Shows every field in the order WidgetForm declares it, so related settings
 * stay together. The edit form script hides the ones the chart does not use.
 *
 * @var CView $this
 * @var array $data
 */

use Zabbix\Widgets\Fields;

$views = [
	Fields\CWidgetFieldCheckBox::class => CWidgetFieldCheckBoxView::class,
	Fields\CWidgetFieldIntegerBox::class => CWidgetFieldIntegerBoxView::class,
	Fields\CWidgetFieldMultiSelectGroup::class => CWidgetFieldMultiSelectGroupView::class,
	Fields\CWidgetFieldMultiSelectHost::class => CWidgetFieldMultiSelectHostView::class,
	Fields\CWidgetFieldMultiSelectOverrideHost::class => CWidgetFieldMultiSelectOverrideHostView::class,
	Fields\CWidgetFieldPatternSelectItem::class => CWidgetFieldPatternSelectItemView::class,
	Fields\CWidgetFieldRadioButtonList::class => CWidgetFieldRadioButtonListView::class,
	Fields\CWidgetFieldSelect::class => CWidgetFieldSelectView::class,
	Fields\CWidgetFieldTextArea::class => CWidgetFieldTextAreaView::class,
	Fields\CWidgetFieldTextBox::class => CWidgetFieldTextBoxView::class,
	Fields\CWidgetFieldTimePeriod::class => CWidgetFieldTimePeriodView::class
];

// Examples shown in empty text fields; a view without setPlaceholder() simply shows none.
$placeholders = [
	'port_regex' => '^Interface (\\S+)\\(',
	'port_groups' => "Access = 1-48\nUplinks = 49-52",
	'port_group_tag' => 'module',
	'port_type_rules' => "SFP+ = 49-52\nManagement = /^mgmt/",
	'port_type_tag' => 'interface_type',
	'speed_colours' => "1G = #009E73\n10G = #0072B2",
	'state_colours' => "up = #009E73\ndown = #D55E00",
	'port_fixed_colour' => '#0072B2',
	'port_label_regex' => '(\\d+)$',
	'stale_after' => '10m or 3x'
];

$form = new CWidgetFormView($data);

foreach ($data['fields'] as $field) {
	$view = new $views[get_class($field)]($field);

	if ($view instanceof CWidgetFieldTimePeriodView) {
		$view
			->setDateFormat(ZBX_FULL_DATE_TIME)
			->setFromPlaceholder(_('YYYY-MM-DD hh:mm:ss'))
			->setToPlaceholder(_('YYYY-MM-DD hh:mm:ss'));
	}

	if (array_key_exists($field->getName(), $placeholders) && method_exists($view, 'setPlaceholder')) {
		$view->setPlaceholder($placeholders[$field->getName()]);
	}

	$form->addField($view);
}

$form->includeJsFile('widget.edit.js.php');

// Zabbix 7.4 runs form scripts through initFormJs(); 7.0 and 7.2 use addJavaScript().
if (method_exists($form, 'initFormJs')) {
	$form->initFormJs('widget_zabbixwidgets_charts_form.init();');
}
else {
	$form->addJavaScript('widget_zabbixwidgets_charts_form.init();');
}

$form->show();
