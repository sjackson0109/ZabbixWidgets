<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Includes;

use API;
use CSettingsHelper;
use Manager;

/**
 * Fetches exactly the data a chart's contract asks for, as the current user,
 * so Zabbix permissions apply to every host, item, value and macro.
 *
 * Nothing here fills gaps: missing values stay null and limits that would cut
 * data short are reported as errors instead of truncating silently.
 */
class DataProvider {

	public const MAX_HOSTS = 1000;
	public const MAX_ITEMS = 500;
	public const MAX_HISTORY_VALUES = 200000;

	/** Periods longer than this read hourly trends where the chart can use them exactly. */
	public const TRENDS_AFTER = 2 * 86400;

	private const NUMERIC_TYPES = [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_UINT64];

	private array $chart;
	private array $config;
	private array $errors = [];

	public function __construct(array $chart, array $config) {
		$this->chart = $chart;
		$this->config = $config;
	}

	/**
	 * @param array $fields_values  Widget field values from the controller.
	 *
	 * @return array  Payload for the browser; see docs/ARCHITECTURE.md.
	 */
	public function collect(array $fields_values): array {
		$payload = [
			'chart' => $this->chart['id'],
			'config' => $this->config,
			'series' => [],
			'hosts' => [],
			'time_period' => null,
			'history_source' => null,
			'errors' => []
		];

		$hosts = $this->resolveHosts($fields_values);

		if ($hosts) {
			$items_by_role = $this->resolveItems($fields_values, array_keys($hosts));
			$payload['series'] = $this->buildSeries($items_by_role, $hosts);

			if (ChartRegistry::requiresTimePeriod($this->chart, $this->config)) {
				$payload['time_period'] = [
					'from' => (int) $fields_values['time_period']['from_ts'],
					'to' => (int) $fields_values['time_period']['to_ts']
				];
			}

			if (ChartRegistry::requiresHistory($this->chart, $this->config) && $payload['time_period'] !== null) {
				$payload['history_source'] = $this->addHistory($payload['series'], $payload['time_period']);
			}

			if ($this->needsHostDetails()) {
				$payload['hosts'] = $this->hostDetails($hosts);
			}
		}

		$payload['errors'] = $this->errors;

		return $payload;
	}

	private function resolveHosts(array $fields_values): array {
		$options = [
			'output' => ['hostid', 'name'],
			'monitored_hosts' => true,
			'limit' => self::MAX_HOSTS + 1,
			'preservekeys' => true
		];

		if (!empty($fields_values['override_hostid'])) {
			$options['hostids'] = $fields_values['override_hostid'];
		}
		elseif (!empty($fields_values['groupids']) || !empty($fields_values['hostids'])) {
			if (!empty($fields_values['groupids'])) {
				$options['groupids'] = $fields_values['groupids'];
			}
			if (!empty($fields_values['hostids'])) {
				$options['hostids'] = $fields_values['hostids'];
			}
		}
		else {
			$this->errors[] = _('Select host groups or hosts.');

			return [];
		}

		$hosts = API::Host()->get($options);

		if (count($hosts) > self::MAX_HOSTS) {
			$this->errors[] = _s('More than %1$d hosts match. Narrow the host group or host selection.', self::MAX_HOSTS);

			return [];
		}

		if (!$hosts) {
			$this->errors[] = _('No monitored hosts match the selection, or you do not have access to them.');
		}

		return $hosts;
	}

	/**
	 * @return array  role => [itemid => item]
	 */
	private function resolveItems(array $fields_values, array $hostids): array {
		$items_by_role = [];

		foreach (ChartRegistry::activeRoles($this->chart, $this->config) as $role_name => $role) {
			$patterns = array_values(array_filter((array) ($fields_values[$role['field']] ?? []), 'strlen'));

			if (!$patterns) {
				$items_by_role[$role_name] = [];
				continue;
			}

			$items = API::Item()->get([
				'output' => ['itemid', 'hostid', 'name', 'key_', 'value_type', 'units'],
				'selectTags' => ['tag', 'value'],
				'hostids' => $hostids,
				'search' => ['name' => $patterns],
				'searchWildcardsEnabled' => true,
				'searchByAny' => true,
				'monitored' => true,
				'webitems' => true,
				'sortfield' => 'name',
				'limit' => self::MAX_ITEMS + 1,
				'preservekeys' => true
			]);

			if (count($items) > self::MAX_ITEMS) {
				$this->errors[] = _s('More than %1$d items match "%2$s". Narrow the item pattern.', self::MAX_ITEMS,
					implode(', ', $patterns)
				);
				$items = [];
			}

			$items_by_role[$role_name] = $items;
		}

		return $items_by_role;
	}

	private function buildSeries(array $items_by_role, array $hosts): array {
		$all_items = [];

		foreach ($items_by_role as $items) {
			$all_items += $items;
		}

		$latest = [];

		if ($all_items && ChartRegistry::needs($this->chart, 'latest')) {
			$latest = Manager::History()->getLastValues($all_items, 1,
				timeUnitToSeconds(CSettingsHelper::get(CSettingsHelper::HISTORY_PERIOD))
			);
		}

		$series = [];

		foreach ($items_by_role as $role => $items) {
			foreach ($items as $itemid => $item) {
				$last = $latest[$itemid][0] ?? null;

				$series[] = [
					'itemid' => $itemid,
					'role' => $role,
					'hostid' => $item['hostid'],
					'host' => $hosts[$item['hostid']]['name'] ?? '',
					'name' => $item['name'],
					'key' => $item['key_'],
					'units' => $item['units'],
					'value_type' => (int) $item['value_type'],
					'tags' => $item['tags'],
					'value' => $last !== null ? $last['value'] : null,
					'clock' => $last !== null ? (int) $last['clock'] : null,
					'history' => []
				];
			}
		}

		return $series;
	}

	/**
	 * Adds history (or hourly trends) to numeric series in place.
	 *
	 * @return string  'history' or 'trends'
	 */
	private function addHistory(array &$series, array $period): string {
		$numeric = array_filter($series, static function (array $entry): bool {
			return in_array($entry['value_type'], self::NUMERIC_TYPES, true);
		});

		if (!$numeric) {
			return 'history';
		}

		$source = $this->canUseTrends() && $period['to'] - $period['from'] > self::TRENDS_AFTER ? 'trends' : 'history';
		$rows_by_item = $source === 'trends'
			? $this->fetchTrends($numeric, $period)
			: $this->fetchHistory($numeric, $period);

		foreach ($series as &$entry) {
			$entry['history'] = $rows_by_item[$entry['itemid']] ?? [];
		}
		unset($entry);

		return $source;
	}

	/**
	 * Trends hold hourly count, min, average and max, from which daily or
	 * multi-hour sums, averages, minima, maxima and counts are exact. They
	 * cannot give first/last samples, so OHLC always reads raw history.
	 */
	private function canUseTrends(): bool {
		if ($this->chart['id'] === 'calendar_heatmap') {
			return true;
		}

		if ($this->chart['id'] === 'heatmap') {
			$bucket = timeUnitToSeconds($this->config['bucket']);

			return $bucket !== null && $bucket > 0 && $bucket % 3600 == 0;
		}

		return false;
	}

	private function fetchHistory(array $series, array $period): array {
		$itemids_by_type = [];

		foreach ($series as $entry) {
			$itemids_by_type[$entry['value_type']][$entry['itemid']] = true;
		}

		$rows_by_item = [];

		foreach ($itemids_by_type as $value_type => $itemids) {
			$options = [
				'history' => $value_type,
				'itemids' => array_keys($itemids),
				'time_from' => $period['from'],
				'time_till' => $period['to']
			];

			$count = (int) API::History()->get($options + ['countOutput' => true]);

			if ($count > self::MAX_HISTORY_VALUES) {
				$this->errors[] = _s(
					'The selected period holds %1$d values, more than the %2$d this widget reads. Choose a shorter period.',
					$count, self::MAX_HISTORY_VALUES
				);

				return [];
			}

			$rows = API::History()->get($options + [
				'output' => ['itemid', 'clock', 'value'],
				'sortfield' => 'clock',
				'sortorder' => ZBX_SORT_UP
			]);

			foreach ($rows as $row) {
				$rows_by_item[$row['itemid']][] = [(int) $row['clock'], $row['value']];
			}
		}

		return $rows_by_item;
	}

	private function fetchTrends(array $series, array $period): array {
		$rows = API::Trend()->get([
			'output' => ['itemid', 'clock', 'num', 'value_min', 'value_avg', 'value_max'],
			'itemids' => array_column($series, 'itemid'),
			'time_from' => $period['from'],
			'time_till' => $period['to']
		]);

		$rows_by_item = [];

		foreach ($rows as $row) {
			$rows_by_item[$row['itemid']][] = [
				(int) $row['clock'], $row['value_avg'], $row['value_min'], $row['value_max'], (int) $row['num']
			];
		}

		foreach ($rows_by_item as &$item_rows) {
			usort($item_rows, static function (array $a, array $b): int {
				return $a[0] <=> $b[0];
			});
		}
		unset($item_rows);

		return $rows_by_item;
	}

	private function needsHostDetails(): bool {
		return ChartRegistry::needs($this->chart, 'hosts') || ChartRegistry::needs($this->chart, 'groups')
			|| ChartRegistry::needs($this->chart, 'macros');
	}

	private function hostDetails(array $hosts): array {
		$details = API::Host()->get([
			'output' => ['hostid', 'name'],
			'hostids' => array_keys($hosts),
			'selectHostGroups' => ['name'],
			'selectTags' => ['tag', 'value'],
			'selectParentTemplates' => ['templateid'],
			'preservekeys' => true
		]);

		$macros = $this->resolveTargetMacro($details);
		$result = [];

		foreach ($details as $hostid => $host) {
			$result[] = [
				'hostid' => $hostid,
				'name' => $host['name'],
				'groups' => array_column($host['hostgroups'], 'name'),
				'tags' => $host['tags'],
				'macros' => array_key_exists($hostid, $macros) ? [$this->config['target_macro'] => $macros[$hostid]] : []
			];
		}

		return $result;
	}

	/**
	 * Resolves the bullet target macro per host: host value first, then a
	 * directly linked template, then the global value. Secret and vault macros
	 * are not readable and are treated as undefined.
	 *
	 * @return array  hostid => value
	 */
	private function resolveTargetMacro(array $hosts): array {
		$macro = $this->config['target_macro'] ?? '';

		if (!ChartRegistry::needs($this->chart, 'macros') || ($this->config['target_source'] ?? '') !== 'macro'
				|| $macro === '') {
			return [];
		}

		$owner_ids = array_keys($hosts);

		foreach ($hosts as $host) {
			$owner_ids = array_merge($owner_ids, array_column($host['parentTemplates'], 'templateid'));
		}

		$values = [];

		foreach (API::UserMacro()->get([
			'output' => ['hostid', 'macro', 'value', 'type'],
			'hostids' => array_unique($owner_ids),
			'filter' => ['macro' => $macro, 'type' => ZBX_MACRO_TYPE_TEXT]
		]) as $row) {
			$values[$row['hostid']] = $row['value'];
		}

		$global = API::UserMacro()->get([
			'output' => ['macro', 'value', 'type'],
			'globalmacro' => true,
			'filter' => ['macro' => $macro, 'type' => ZBX_MACRO_TYPE_TEXT]
		]);
		$global_value = $global ? $global[0]['value'] : null;

		$resolved = [];

		foreach ($hosts as $hostid => $host) {
			if (array_key_exists($hostid, $values)) {
				$resolved[$hostid] = $values[$hostid];
				continue;
			}

			foreach (array_column($host['parentTemplates'], 'templateid') as $templateid) {
				if (array_key_exists($templateid, $values)) {
					$resolved[$hostid] = $values[$templateid];
					continue 2;
				}
			}

			if ($global_value !== null) {
				$resolved[$hostid] = $global_value;
			}
		}

		return $resolved;
	}
}
