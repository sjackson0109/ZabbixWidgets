<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Includes;

use CWidgetsData;
use Zabbix\Widgets\CWidgetField;
use Zabbix\Widgets\CWidgetForm;
use Zabbix\Widgets\Fields\CWidgetFieldCheckBox;
use Zabbix\Widgets\Fields\CWidgetFieldIntegerBox;
use Zabbix\Widgets\Fields\CWidgetFieldMultiSelectGroup;
use Zabbix\Widgets\Fields\CWidgetFieldMultiSelectHost;
use Zabbix\Widgets\Fields\CWidgetFieldMultiSelectOverrideHost;
use Zabbix\Widgets\Fields\CWidgetFieldPatternSelectItem;
use Zabbix\Widgets\Fields\CWidgetFieldRadioButtonList;
use Zabbix\Widgets\Fields\CWidgetFieldSelect;
use Zabbix\Widgets\Fields\CWidgetFieldTextArea;
use Zabbix\Widgets\Fields\CWidgetFieldTextBox;
use Zabbix\Widgets\Fields\CWidgetFieldTimePeriod;

/**
 * Every chart's fields are declared here; the edit form script shows only the
 * ones the selected chart lists in the registry. Requirements that depend on
 * the chart type are checked in validate().
 */
class WidgetForm extends CWidgetForm {

	public function addFields(): self {
		$this->addField(
			(new CWidgetFieldSelect('chart_type', _('Chart type'), ChartRegistry::formOptions()))
				->setDefault(1)
				->setFlags(CWidgetField::FLAG_LABEL_ASTERISK)
		);

		if (!$this->isTemplateDashboard()) {
			$this
				->addField(new CWidgetFieldMultiSelectGroup('groupids', _('Host groups')))
				->addField(new CWidgetFieldMultiSelectHost('hostids', _('Hosts')));
		}

		$this->addField(new CWidgetFieldMultiSelectOverrideHost());

		foreach (ChartRegistry::itemFields() as $name => $label) {
			$this->addField(new CWidgetFieldPatternSelectItem($name, _($label)));
		}

		return $this
			->addField(
				(new CWidgetFieldTimePeriod('time_period', _('Time period')))
					->setDefault([
						CWidgetField::FOREIGN_REFERENCE_KEY => CWidgetField::createTypedReference(
							CWidgetField::REFERENCE_DASHBOARD, CWidgetsData::DATA_TYPE_TIME_PERIOD
						)
					])
					->setDefaultPeriod(['from' => 'now-7d', 'to' => 'now'])
			)
			->addField($this->enumField('group_by', _('Group by'), [_('Host'), _('Item')]))
			->addField((new CWidgetFieldCheckBox('show_percent', _('Show percentage')))->setDefault(1))
			->addField(new CWidgetFieldCheckBox('hide_zero', _('Hide zero values')))
			->addField($this->enumField('centre_value', _('Centre value'), [_('None'), _('Sum'), _('Average')]))
			->addField($this->enumField('target_source', _('Target from'), [_('Item'), _('Macro'), _('Constant')]))
			->addField(new CWidgetFieldTextBox('target_macro', _('Target macro')))
			->addField(new CWidgetFieldTextBox('target_constant', _('Target value')))
			->addField(new CWidgetFieldTextBox('ranges', _('Qualitative ranges')))
			->addField($this->enumField('pair_by', _('Pair items by'), [_('Host'), _('Item tag')]))
			->addField(new CWidgetFieldTextBox('pair_tag', _('Pairing tag')))
			->addField($this->enumField('radar_scale', _('Axis scale'), [_('Shared'), _('Per axis')]))
			->addField(new CWidgetFieldTextBox('radar_max', _('Axis maximum')))
			->addField($this->enumField('heat_x', _('Columns'), [_('Hosts'), _('Items'), _('Time')]))
			->addField($this->enumField('heat_y', _('Rows'), [_('Items'), _('Hosts')]))
			->addField((new CWidgetFieldTextBox('bucket', _('Period length')))->setDefault('1h'))
			->addField(
				(new CWidgetFieldSelect('aggregation', _('Aggregation'), [
					_('Average'), _('Sum'), _('Minimum'), _('Maximum'), _('Count')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextBox('colour_min', _('Colour scale minimum')))
			->addField(new CWidgetFieldTextBox('colour_max', _('Colour scale maximum')))
			->addField($this->enumField('ohlc_mode', _('OHLC input'), [_('Derive from one item'), _('Four items')]))
			->addField($this->enumField('gantt_timing', _('Task timing'), [_('Start and end'), _('Start and duration')]))
			->addField($this->enumField('tree_source', _('Hierarchy from'), [_('Host groups'), _('Tags'), _('Item name path')]))
			->addField(new CWidgetFieldTextBox('tree_tags', _('Tag levels')))
			->addField(new CWidgetFieldTextBox('tree_delimiter', _('Path delimiter')))
			->addField($this->enumField('edge_source', _('Relationships from'), [_('List'), _('Host tag')]))
			->addField(new CWidgetFieldTextArea('edge_list', _('Relationships')))
			->addField(new CWidgetFieldTextBox('edge_tag', _('Link tag')))
			->addField(new CWidgetFieldTextBox('source_tag', _('Source tag')))
			->addField(new CWidgetFieldTextBox('target_tag', _('Target tag')))
			->addField($this->enumField('row_identity', _('Rows by'), [
				_('Item'), _('Key parameter'), _('Name pattern'), _('Item tag'), _('Regular expression')
			]))
			->addField(new CWidgetFieldTextBox('row_tag', _('Row tag')))
			->addField(new CWidgetFieldTextBox('row_regex', _('Row expression')))
			->addField(new CWidgetFieldTextBox('row_heading', _('Row heading')))
			->addField(new CWidgetFieldTextArea('table_columns', _('Columns')))
			->addField((new CWidgetFieldCheckBox('show_host', _('Show host')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_item_name', _('Show item name')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_last_update', _('Show last update')))->setDefault(1))
			->addField(new CWidgetFieldCheckBox('show_change', _('Show change')))
			->addField(new CWidgetFieldCheckBox('show_problems', _('Show problems')))
			->addField((new CWidgetFieldCheckBox('use_valuemap', _('Use value mappings')))->setDefault(1))
			->addField(
				(new CWidgetFieldSelect('table_page_size', _('Rows per page'), ['10', '25', '50', '100']))->setDefault(1)
			)
			->addField(new CWidgetFieldCheckBox('table_dense', _('Compact rows')))
			->addField((new CWidgetFieldCheckBox('table_striped', _('Striped rows')))->setDefault(1))
			->addField($this->enumField('entity_by', _('Show'), [_('Each item'), _('Total per host')]))
			->addField($this->enumField('pie_sort', _('Order'), [_('As found'), _('Largest first'), _('Smallest first')]))
			->addField($this->enumField('label_position', _('Labels'), [_('Outside'), _('Inside'), _('None')]))
			->addField((new CWidgetFieldCheckBox('show_value', _('Show values')))->setDefault(1))
			->addField(new CWidgetFieldTextBox('scale_min', _('Minimum')))
			->addField(new CWidgetFieldTextBox('scale_max', _('Maximum')))
			->addField(new CWidgetFieldTextBox('target_value', _('Target')))
			->addField(new CWidgetFieldTextBox('thresholds', _('Thresholds')))
			->addField($this->enumField('threshold_order', _('Worse when'), [_('Higher'), _('Lower')]))
			->addField($this->enumField('gauge_display', _('Value as'), [_('Value'), _('Percentage of scale')]))
			->addField(new CWidgetFieldCheckBox('gauge_segmented', _('Segmented')))
			->addField($this->enumField('rank_order', _('Order'), [_('Highest first'), _('Lowest first')]))
			->addField($this->enumField('rank_limit', _('Limit'), [_('All'), _('Top N'), _('Bottom N')]))
			->addField((new CWidgetFieldIntegerBox('rank_count', _('N'), 1, 100))->setDefault(10))
			->addField((new CWidgetFieldCheckBox('show_track', _('Show track')))->setDefault(1))
			->addField((new CWidgetFieldTextBox('levels', _('Hierarchy levels')))->setDefault('group, host'))
			->addField(new CWidgetFieldTextBox('path_delimiter', _('Path delimiter')))
			->addField((new CWidgetFieldIntegerBox('max_depth', _('Maximum depth'), 0, 10))->setDefault(0))
			->addField(new CWidgetFieldTextArea('stages', _('Stages')))
			->addField($this->enumField('funnel_order', _('Stage order'), [_('As listed'), _('Largest first'), _('Smallest first')]))
			->addField((new CWidgetFieldCheckBox('pct_first', _('Percentage of first stage')))->setDefault(1))
			->addField(new CWidgetFieldCheckBox('pct_previous', _('Percentage of previous stage')))
			->addField(new CWidgetFieldTextBox('y_min', _('Y-axis minimum')))
			->addField(new CWidgetFieldTextBox('y_max', _('Y-axis maximum')))
			->addField(new CWidgetFieldCheckBox('zero_baseline', _('Start Y-axis at zero')))
			->addField(new CWidgetFieldCheckBox('smooth', _('Smooth lines')))
			->addField(new CWidgetFieldCheckBox('show_points', _('Show points')))
			->addField(new CWidgetFieldTextBox('max_gap', _('Maximum gap')))
			->addField($this->enumField('area_mode', _('Areas'), [_('Overlapping'), _('Stacked')]))
			->addField((new CWidgetFieldIntegerBox('area_opacity', _('Fill opacity (%)'), 0, 100))->setDefault(30))
			->addField(new CWidgetFieldCheckBox('area_gradient', _('Gradient fill')))
			->addField($this->enumField('matrix_rows', _('Rows'), [_('Hosts'), _('Items')]))
			->addField($this->enumField('colour_by', _('Colour by'), [_('None'), _('Value colours'), _('Thresholds'), _('Problem severity')]))
			->addField(new CWidgetFieldTextArea('colour_map', _('Value colours')))
			->addField((new CWidgetFieldIntegerBox('grid_columns', _('Columns (0 = fit)'), 0, 12))->setDefault(0))
			->addField($this->enumField('tile_sort', _('Order'), [_('Name'), _('Highest first'), _('Lowest first')]))
			->addField(new CWidgetFieldCheckBox('show_minmax', _('Show minimum and maximum')))
			->addField($this->enumField('port_identity', _('Port identity from'), [_('Item tag'), _('Key parameter'), _('Regular expression')]))
			->addField((new CWidgetFieldTextBox('port_tag', _('Port tag')))->setDefault('interface'))
			->addField($this->enumField('port_regex_target', _('Match expression against'), [_('Item name'), _('Item key')]))
			->addField(new CWidgetFieldTextBox('port_regex', _('Port expression')))
			->addField((new CWidgetFieldIntegerBox('port_id_group', _('Identity capture group'), 1, 9))->setDefault(1))
			->addField((new CWidgetFieldIntegerBox('port_member_group', _('Member capture group (0 = none)'), 0, 9))->setDefault(0))
			->addField((new CWidgetFieldIntegerBox('port_number_group', _('Port number capture group (0 = none)'), 0, 9))->setDefault(0))
			->addField($this->enumField('port_roles_shown', _('Port data'), [_('Common'), _('All')]))
			->addField($this->enumField('port_layout', _('Layout'), [_('Two rows (odd over even)'), _('One row'), _('Automatic')]))
			->addField((new CWidgetFieldIntegerBox('port_columns', _('Columns per block (0 = all)'), 0, 128))->setDefault(0))
			->addField($this->enumField('port_grouping', _('Group ports by'), [
				_('None'), _('Defined groups'), _('Interface type'), _('Name prefix'), _('Item tag')
			]))
			->addField(new CWidgetFieldTextArea('port_groups', _('Port groups')))
			->addField(new CWidgetFieldTextBox('port_group_tag', _('Group tag')))
			->addField(
				(new CWidgetFieldSelect('port_type', _('Interface type'), [
					'RJ45', 'SFP', 'SFP+', 'SFP28', 'QSFP', 'QSFP+', 'QSFP28', 'QSFP56', 'QSFP-DD', _('Fibre'), _('Copper'),
					_('Generic'), _('Management'), _('Console'), _('Stack'), _('Other')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextArea('port_type_rules', _('Interface types')))
			->addField(new CWidgetFieldTextBox('port_type_tag', _('Interface type tag')))
			->addField(
				(new CWidgetFieldSelect('port_fill', _('Port colour'), [
					_('Negotiated speed'), _('Configured speed'), _('Operational status'), _('Administrative status'), _('Thresholds'),
					_('Problem severity'), _('Fixed colour')
				]))->setDefault(0)
			)
			->addField($this->enumField('port_border', _('Border'), [_('Operational status'), _('Administrative status'), _('Problem severity'), _('None')]))
			->addField(
				(new CWidgetFieldSelect('port_marker', _('Marker'), [
					_('Administrative status and problems'), _('Administrative status'), _('Problems'), _('None')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextArea('speed_colours', _('Speed colours')))
			->addField(new CWidgetFieldTextArea('state_colours', _('Status colours')))
			->addField((new CWidgetFieldTextBox('admin_down', _('Administratively down values')))->setDefault('down'))
			->addField(
				(new CWidgetFieldSelect('port_metric', _('Threshold value'), [
					_('Utilisation'), _('Highest of in/out utilisation'), _('Inbound utilisation'), _('Outbound utilisation'), _('PoE power'),
					_('Inbound errors'), _('Outbound errors'), _('Discards'), _('Inbound traffic'), _('Outbound traffic')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextBox('port_fixed_colour', _('Colour')))
			->addField(
				(new CWidgetFieldSelect('port_label', _('Label'), [
					_('Port identity'), _('Alias'), _('Description'), _('Port number'), _('Regular expression'), _('Item name'), _('None')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextBox('port_label_regex', _('Label expression')))
			->addField((new CWidgetFieldCheckBox('port_abbreviate', _('Abbreviate interface names')))->setDefault(1))
			->addField(
				(new CWidgetFieldSelect('port_sublabel', _('Second label'), [
					_('Speed'), _('Alias'), _('Description'), _('Status'), _('Utilisation'), _('None')
				]))->setDefault(0)
			)
			->addField(
				(new CWidgetFieldSelect('port_util_bar', _('Utilisation bar'), [
					_('None'), _('Highest of in/out'), _('Inbound'), _('Outbound'), _('Average of in/out'), _('Utilisation')
				]))->setDefault(0)
			)
			->addField(new CWidgetFieldTextBox('stale_after', _('Stale after')))
			->addField(
				(new CWidgetFieldSelect('port_click', _('On click'), [_('Nothing'), _('Latest data'), _('Item history'), _('Problems')]))
					->setDefault(0)
			)
			->addField((new CWidgetFieldCheckBox('show_legend', _('Show legend')))->setDefault(1))
			->addField((new CWidgetFieldIntegerBox('decimals', _('Decimal places'), 0, 10))->setDefault(2));
	}

	/**
	 * Adds the checks that depend on the selected chart: required item mappings
	 * and required settings, as declared in the registry. Field-level checks
	 * run in the parent.
	 *
	 * They run only in strict mode (saving the form). A widget stored without
	 * them, e.g. through the API, still renders and the browser explains the
	 * missing mappings, instead of Zabbix's generic "not fully configured".
	 */
	public function validate(bool $strict = false): array {
		$errors = parent::validate($strict);

		if ($errors || !$strict) {
			return $errors;
		}

		$values = $this->getFieldsValues();
		$chart = ChartRegistry::byFormValue((int) $values['chart_type']);

		if ($chart === null) {
			return [_('Select a chart type.')];
		}

		$config = WidgetConfig::fromFieldValues($values);

		foreach (ChartRegistry::activeRoles($chart, $config) as $role) {
			if (ChartRegistry::evaluate($role['required'], $config) && !$values[$role['field']]) {
				$errors[] = _s('%1$s requires %2$s.', $chart['name'], $this->getField($role['field'])->getLabel());
			}
		}

		foreach (ChartRegistry::requiredControls($chart, $config) as $field) {
			if (trim((string) $values[$field]) === '') {
				$errors[] = _s('%1$s requires "%2$s".', $chart['name'], $this->getField($field)->getLabel());
			}
		}

		return $errors;
	}

	private function enumField(string $name, string $label, array $labels): CWidgetFieldRadioButtonList {
		return (new CWidgetFieldRadioButtonList($name, $label, $labels))->setDefault(0);
	}
}
