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
