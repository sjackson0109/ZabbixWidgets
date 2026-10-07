<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 *
 * @var CView $this
 * @var array $data
 */

use Modules\ZabbixWidgetsCharts\Includes\WidgetForm;

$fields = $data['fields'];

$form = (new CWidgetFormView($data))
	->addField(new CWidgetFieldSelectView($fields['chart_type']))
	->addField(array_key_exists('groupids', $fields) ? new CWidgetFieldMultiSelectGroupView($fields['groupids']) : null)
	->addField(array_key_exists('hostids', $fields) ? new CWidgetFieldMultiSelectHostView($fields['hostids']) : null)
	->addField(new CWidgetFieldMultiSelectOverrideHostView($fields['override_hostid']));

foreach (array_keys(WidgetForm::ITEM_FIELDS) as $name) {
	$form->addField(new CWidgetFieldPatternSelectItemView($fields[$name]));
}

$radio = ['group_by', 'centre_value', 'target_source', 'pair_by', 'radar_scale', 'heat_x', 'heat_y', 'ohlc_mode',
	'gantt_timing', 'tree_source', 'edge_source'
];
$text = ['target_macro', 'target_constant', 'ranges', 'pair_tag', 'radar_max', 'bucket', 'colour_min', 'colour_max',
	'tree_tags', 'tree_delimiter', 'edge_tag', 'source_tag', 'target_tag'
];

$form
	->addField(
		(new CWidgetFieldTimePeriodView($fields['time_period']))
			->setDateFormat(ZBX_FULL_DATE_TIME)
			->setFromPlaceholder(_('YYYY-MM-DD hh:mm:ss'))
			->setToPlaceholder(_('YYYY-MM-DD hh:mm:ss'))
	)
	->addField(new CWidgetFieldSelectView($fields['aggregation']));

foreach ($radio as $name) {
	$form->addField(new CWidgetFieldRadioButtonListView($fields[$name]));
}

foreach ($text as $name) {
	$form->addField(new CWidgetFieldTextBoxView($fields[$name]));
}

$form
	->addField(new CWidgetFieldTextAreaView($fields['edge_list']))
	->addField(new CWidgetFieldCheckBoxView($fields['show_percent']))
	->addField(new CWidgetFieldCheckBoxView($fields['hide_zero']))
	->addField(new CWidgetFieldCheckBoxView($fields['show_legend']))
	->addField(new CWidgetFieldIntegerBoxView($fields['decimals']))
	->includeJsFile('widget.edit.js.php')
	->initFormJs('widget_zabbixwidgets_charts_form.init();')
	->show();
