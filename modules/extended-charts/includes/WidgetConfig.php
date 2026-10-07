<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Includes;

/**
 * Turns stored widget field values into the chart configuration the browser
 * receives: enum integers become their registry strings and only plain
 * settings are passed on (item, host and time fields are resolved separately).
 */
class WidgetConfig {

	private const TEXT_FIELDS = [
		'target_macro', 'target_constant', 'ranges', 'pair_tag', 'radar_max', 'bucket', 'colour_min', 'colour_max',
		'tree_tags', 'tree_delimiter', 'edge_list', 'edge_tag', 'source_tag', 'target_tag', 'row_tag', 'row_regex', 'row_heading',
		'table_columns', 'scale_min', 'scale_max', 'target_value', 'thresholds', 'levels', 'path_delimiter', 'stages'
	];

	private const FLAG_FIELDS = ['show_percent', 'hide_zero', 'show_legend', 'show_host', 'show_item_name', 'show_last_update',
		'show_change', 'show_problems', 'use_valuemap', 'table_dense', 'table_striped', 'show_value', 'gauge_segmented', 'show_track',
		'pct_first', 'pct_previous'
	];

	private const INTEGER_FIELDS = ['rank_count' => 10, 'max_depth' => 0];

	public static function fromFieldValues(array $values): array {
		$config = [];

		foreach (array_keys(ChartRegistry::enums()) as $field) {
			$config[$field] = ChartRegistry::enumValue($field, $values[$field] ?? 0);
		}

		foreach (self::TEXT_FIELDS as $field) {
			$config[$field] = trim((string) ($values[$field] ?? ''));
		}

		foreach (self::FLAG_FIELDS as $field) {
			$config[$field] = (bool) ($values[$field] ?? false);
		}

		foreach (self::INTEGER_FIELDS as $field => $default) {
			$config[$field] = (int) ($values[$field] ?? $default);
		}

		$config['decimals'] = (int) ($values['decimals'] ?? 2);

		return $config;
	}
}
