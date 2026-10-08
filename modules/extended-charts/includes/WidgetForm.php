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
			(new CWidgetFieldSelect('chart_type', _('Chart type'),
				ChartRegistry::formOptions(array_key_exists('chart_type', $this->values) ? (int) $this->values['chart_type'] : null)
			))
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
			->addField($this->enumField('bar_orientation', _('Bars'), [_('Vertical'), _('Horizontal')]))
			->addField($this->enumField('stack_mode', _('Stacking'), [_('Values'), _('Percentage of category'), _('Diverging')]))
			->addField($this->enumField('stack_orientation', _('Bars'), [_('Horizontal'), _('Vertical')]))
			->addField((new CWidgetFieldCheckBox('show_percent', _('Show percentage')))->setDefault(1))
			->addField(new CWidgetFieldCheckBox('hide_zero', _('Hide zero values')))
			->addField($this->enumField('centre_value', _('Centre value'), [_('None'), _('Sum'), _('Average')]))
			->addField($this->enumField('pie_rose', _('Rose'), [_('None'), _('Radius by value'), _('Equal angles, radius by value')]))
			->addField((new CWidgetFieldIntegerBox('inner_radius', _('Inner radius (%, 0 = automatic)'), 0, 95))->setDefault(0))
			->addField((new CWidgetFieldIntegerBox('outer_radius', _('Outer radius (%, 0 = automatic)'), 0, 100))->setDefault(0))
			->addField($this->enumField('target_source', _('Target from'), [_('Item'), _('Macro'), _('Constant')]))
			->addField(new CWidgetFieldTextBox('target_macro', _('Target macro')))
			->addField(new CWidgetFieldTextBox('target_constant', _('Target value')))
			->addField(new CWidgetFieldTextBox('ranges', _('Qualitative ranges')))
			->addField($this->enumField('pair_by', _('Pair items by'), [_('Host'), _('Item tag')]))
			->addField(new CWidgetFieldTextBox('pair_tag', _('Pairing tag')))
			->addField($this->enumField('bubble_size', _('Bubble size'), [_('From size items'), _('None (XY scatter)')]))
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
			->addField(
				(new CWidgetFieldSelect('tree_layout', _('Layout'), [
					_('Left to right'), _('Right to left'), _('Top down'), _('Bottom up'), _('Radial')
				]))->setDefault(0)
			)
			->addField($this->enumField('edge_source', _('Relationships from'), [_('List'), _('Host tag')]))
			->addField(new CWidgetFieldTextArea('edge_list', _('Relationships')))
			->addField(new CWidgetFieldTextBox('edge_tag', _('Link tag')))
			->addField($this->enumField('edge_direction', _('Links'), [_('Directed'), _('Undirected')]))
			->addField($this->enumField('network_layout', _('Layout'), [_('Circle'), _('Force-directed'), _('Fixed positions')]))
			->addField(new CWidgetFieldTextArea('node_positions', _('Node positions')))
			->addField($this->enumField('node_category', _('Node colour'), [_('Single colour'), _('Host group'), _('Host tag')]))
			->addField(new CWidgetFieldTextBox('node_category_tag', _('Colour tag')))
			->addField((new CWidgetFieldCheckBox('show_node_labels', _('Show host names')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_edge_labels', _('Show link labels')))->setDefault(1))
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
			->addField(
				(new CWidgetFieldSelect('gauge_style', _('Style'), [_('Level tube'), _('Dial'), _('Progress arc'), _('Ring')]))
					->setDefault(0)
			)
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
			->addField(
				(new CWidgetFieldSelect('line_step', _('Steps'), [
					_('None (straight lines)'), _('Hold each value until the next sample'), _('Hold each value back to the previous sample'),
					_('Change halfway between samples')
				]))->setDefault(0)
			)
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
			->addField($this->enumField('dist_view', _('Show'), [_('Boxplot'), _('Histogram')]))
			->addField((new CWidgetFieldIntegerBox('hist_bins', _('Bins (0 = automatic)'), 0, 200))->setDefault(0))
			->addField((new CWidgetFieldCheckBox('show_outliers', _('Show outliers')))->setDefault(1))
			->addField(new CWidgetFieldTextArea('parallel_axes', _('Axes')))
			->addField($this->enumField('sankey_orient', _('Direction'), [_('Left to right'), _('Top to bottom')]))
			->addField($this->enumField('sankey_align', _('Node alignment'), [_('Justify'), _('Left'), _('Right')]))
			->addField($this->enumField('geo_base', _('Base map'), [_('World outline'), _('Map file'), _('None')]))
			->addField(new CWidgetFieldTextBox('geo_file', _('Map file')))
			->addField(new CWidgetFieldTextArea('geo_links', _('Links')))
			->addField($this->enumField('site_colour', _('Site colour'), [_('Single colour'), _('Thresholds')]))
			->addField(new CWidgetFieldTextArea('waterfall_steps', _('Steps')))
			->addField(new CWidgetFieldTextBox('floor_image', _('Floor plan image')))
			->addField(new CWidgetFieldTextBox('host_tags', _('Host tags')))
			->addField($this->enumField('position_source', _('Access point positions from'), [_('Host macros'), _('Positions list')]))
			->addField((new CWidgetFieldTextBox('position_macro_x', _('Across macro (%)')))->setDefault('{$WIFI.MAP.X}'))
			->addField((new CWidgetFieldTextBox('position_macro_y', _('Down macro (%)')))->setDefault('{$WIFI.MAP.Y}'))
			->addField($this->enumField('radio_by', _('Radios from'), [_('Key parameter'), _('Item tag'), _('Regular expression')]))
			->addField(new CWidgetFieldTextBox('radio_tag', _('Radio tag')))
			->addField(new CWidgetFieldTextBox('radio_regex', _('Radio expression')))
			->addField($this->enumField('ring_size', _('Rings'), [_('Estimated coverage'), _('Band only')]))
			->addField(new CWidgetFieldTextBox('plan_width', _('Floor plan width (m)')))
			->addField(new CWidgetFieldTextBox('tx_power_default', _('Transmit power without an item (dBm)')))
			->addField((new CWidgetFieldTextBox('edge_level', _('Coverage edge (dBm)')))->setDefault('-67'))
			->addField((new CWidgetFieldTextBox('path_loss_n', _('Distance loss coefficients (2.4, 5, 6 GHz)')))->setDefault('28, 31, 31'))
			->addField((new CWidgetFieldCheckBox('show_gaps', _('Show coverage gaps')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_interference', _('Show channel overlap')))->setDefault(1))
			->addField((new CWidgetFieldTextBox('snr_thresholds', _('SNR thresholds (dB)')))->setDefault('15, 25'))
			->addField($this->enumField('rogue_count', _('Rogue APs'), [_('Item value is the count'), _('Count matching items')]))
			->addField((new CWidgetFieldCheckBox('show_band_24', _('Show 2.4 GHz')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_band_5', _('Show 5 GHz')))->setDefault(1))
			->addField((new CWidgetFieldCheckBox('show_band_6', _('Show 6 GHz')))->setDefault(1))
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
			$retired = ChartRegistry::retiredByFormValue((int) $values['chart_type']);

			return [$retired === null
				? _('Select a chart type.')
				: _s('The %1$s chart has been removed. Choose another chart type.', $retired['name'])
			];
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
