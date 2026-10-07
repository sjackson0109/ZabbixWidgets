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
 * Nothing here fills gaps: missing values stay null, and a period holding more
 * values than the shared read budget is reported as an error instead of
 * being truncated.
 */
class DataProvider {

	public const MAX_HOSTS = 1000;
	public const MAX_ITEMS = 500;
	public const MAX_HISTORY_VALUES = 200000;

	/** Periods longer than this read hourly trends where they can stand in for history (see planReads()). */
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
	 * Adds history, or hourly trends where they can stand in for it, to
	 * numeric series in place. All reads share one value budget; if the
	 * period holds more, the widget reports it instead of truncating.
	 *
	 * @return string  'history' or 'mixed' (trends for whole hours, history at the edges)
	 */
	private function addHistory(array &$series, array $period): string {
		$numeric = array_filter($series, static function (array $entry): bool {
			return in_array($entry['value_type'], self::NUMERIC_TYPES, true);
		});

		if (!$numeric) {
			return 'history';
		}

		$plan = $this->planReads($numeric, $period);
		$total = 0;

		foreach ($plan as &$read) {
			$read['count'] = $this->countRows($read);
			$total += $read['count'];
		}
		unset($read);

		if ($total > self::MAX_HISTORY_VALUES) {
			$this->errors[] = _s(
				'The selected period holds %1$d values, more than the %2$d this widget reads. Choose a shorter period.',
				$total, self::MAX_HISTORY_VALUES
			);

			return 'history';
		}

		$rows_by_item = [];
		$remaining = self::MAX_HISTORY_VALUES;

		foreach ($plan as $read) {
			$rows = $this->readRows($read, $remaining + 1);

			if (count($rows) > $remaining) {
				// More values arrived between counting and reading; stop rather than show part of the period.
				$this->errors[] = _('New values arrived while reading the period. Refresh the widget.');

				return 'history';
			}

			$remaining -= count($rows);

			foreach ($rows as $row) {
				$rows_by_item[$row[0]][] = array_slice($row, 1);
			}
		}

		foreach ($series as &$entry) {
			$entry_rows = $rows_by_item[$entry['itemid']] ?? [];
			usort($entry_rows, static function (array $a, array $b): int {
				return $a[0] <=> $b[0];
			});
			$entry['history'] = $entry_rows;
		}
		unset($entry);

		$uses_trends = (bool) array_filter($plan, static function (array $read): bool {
			return $read['table'] === 'trends';
		});

		return $uses_trends ? 'mixed' : 'history';
	}

	/**
	 * Decides which table each part of the period is read from.
	 *
	 * Trends are only used for floating-point items (unsigned trends store a
	 * rounded average), for whole hours inside the period (an hour that starts
	 * or ends outside it would include samples from outside), and, for calendar
	 * days, only where every UTC offset in the period is a whole number of
	 * hours (otherwise an hour can straddle midnight). Everything else is raw
	 * history.
	 */
	private function planReads(array $numeric, array $period): array {
		$by_type = [];

		foreach ($numeric as $entry) {
			$by_type[$entry['value_type']][] = $entry['itemid'];
		}

		$trend_start = (int) ceil($period['from'] / 3600) * 3600;
		$trend_end = (int) floor(($period['to'] + 1) / 3600) * 3600;
		$use_trends = $this->canUseTrends($period) && $period['to'] - $period['from'] > self::TRENDS_AFTER
			&& $trend_end > $trend_start;

		$plan = [];

		foreach ($by_type as $value_type => $itemids) {
			if ($use_trends && $value_type == ITEM_VALUE_TYPE_FLOAT) {
				$plan[] = ['table' => 'trends', 'itemids' => $itemids, 'from' => $trend_start, 'to' => $trend_end - 1];

				if ($period['from'] < $trend_start) {
					$plan[] = ['table' => 'history', 'value_type' => $value_type, 'itemids' => $itemids,
						'from' => $period['from'], 'to' => $trend_start - 1
					];
				}

				if ($trend_end <= $period['to']) {
					$plan[] = ['table' => 'history', 'value_type' => $value_type, 'itemids' => $itemids,
						'from' => $trend_end, 'to' => $period['to']
					];
				}
			}
			else {
				$plan[] = ['table' => 'history', 'value_type' => $value_type, 'itemids' => $itemids,
					'from' => $period['from'], 'to' => $period['to']
				];
			}
		}

		return $plan;
	}

	private function canUseTrends(array $period): bool {
		if ($this->chart['id'] === 'calendar_heatmap') {
			return self::wholeHourOffsets($this->config['time_zone'] ?? 'UTC', $period['from'], $period['to']);
		}

		if ($this->chart['id'] === 'heatmap') {
			// Heat map time buckets are aligned to the Unix epoch, so whole-hour buckets align with trends.
			$bucket = timeUnitToSeconds($this->config['bucket']);

			return $bucket !== null && $bucket > 0 && $bucket % 3600 == 0;
		}

		return false;
	}

	private static function wholeHourOffsets(string $time_zone, int $from, int $to): bool {
		try {
			$zone = new \DateTimeZone($time_zone);
		}
		catch (\Exception $e) {
			return false;
		}

		$transitions = $zone->getTransitions($from, $to);

		if ($transitions === false) {
			return false;
		}

		foreach ($transitions as $transition) {
			if ($transition['offset'] % 3600 != 0) {
				return false;
			}
		}

		return true;
	}

	private function readOptions(array $read): array {
		return [
			'itemids' => $read['itemids'],
			'time_from' => $read['from'],
			'time_till' => $read['to']
		];
	}

	private function countRows(array $read): int {
		$options = $this->readOptions($read) + ['countOutput' => true];

		$result = $read['table'] === 'trends'
			? API::Trend()->get($options)
			: API::History()->get($options + ['history' => $read['value_type']]);

		return is_array($result) ? count($result) : (int) $result;
	}

	/**
	 * @return array  Rows of [itemid, clock, value] (history) or [itemid, clock, avg, min, max, num] (trends).
	 */
	private function readRows(array $read, int $limit): array {
		$options = $this->readOptions($read) + ['limit' => $limit];

		if ($read['table'] === 'trends') {
			$rows = API::Trend()->get($options + [
				'output' => ['itemid', 'clock', 'num', 'value_min', 'value_avg', 'value_max']
			]);

			return array_map(static function (array $row): array {
				return [$row['itemid'], (int) $row['clock'], $row['value_avg'], $row['value_min'], $row['value_max'],
					(int) $row['num']
				];
			}, $rows);
		}

		$rows = API::History()->get($options + [
			'history' => $read['value_type'],
			'output' => ['itemid', 'clock', 'value'],
			'sortfield' => 'clock',
			'sortorder' => ZBX_SORT_UP
		]);

		return array_map(static function (array $row): array {
			return [$row['itemid'], (int) $row['clock'], $row['value']];
		}, $rows);
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
	 * Resolves the bullet target macro per host in Zabbix's order: the host,
	 * then its templates level by level (each level in template ID order), then
	 * the global value. Secret and vault macros are not readable and are
	 * treated as undefined.
	 *
	 * @return array  hostid => value
	 */
	private function resolveTargetMacro(array $hosts): array {
		$macro = $this->config['target_macro'] ?? '';

		if (!ChartRegistry::needs($this->chart, 'macros') || ($this->config['target_source'] ?? '') !== 'macro'
				|| $macro === '') {
			return [];
		}

		$parents = [];

		foreach ($hosts as $hostid => $host) {
			$parents[$hostid] = array_column($host['parentTemplates'], 'templateid');
		}

		$parents += self::templateParents(array_merge(...array_values($parents)));

		$values = [];

		foreach (API::UserMacro()->get([
			'output' => ['hostid', 'value'],
			'hostids' => array_keys($parents),
			'filter' => ['macro' => $macro, 'type' => ZBX_MACRO_TYPE_TEXT]
		]) as $row) {
			$values[$row['hostid']] = $row['value'];
		}

		$global = API::UserMacro()->get([
			'output' => ['value'],
			'globalmacro' => true,
			'filter' => ['macro' => $macro, 'type' => ZBX_MACRO_TYPE_TEXT]
		]);
		$global_value = $global ? $global[0]['value'] : null;

		$resolved = [];

		foreach (array_keys($hosts) as $hostid) {
			$level = [$hostid];
			$seen = [$hostid => true];

			while ($level) {
				foreach ($level as $ownerid) {
					if (array_key_exists($ownerid, $values)) {
						$resolved[$hostid] = $values[$ownerid];
						continue 3;
					}
				}

				$next = [];

				foreach ($level as $ownerid) {
					foreach ($parents[$ownerid] ?? [] as $templateid) {
						if (!array_key_exists($templateid, $seen)) {
							$seen[$templateid] = true;
							$next[] = $templateid;
						}
					}
				}

				sort($next, SORT_NUMERIC);
				$level = $next;
			}

			if ($global_value !== null) {
				$resolved[$hostid] = $global_value;
			}
		}

		return $resolved;
	}

	/**
	 * Parent templates of the given templates and of all their ancestors.
	 * Templates the user cannot read have no known parents.
	 *
	 * @return array  templateid => [parent templateid, ...]
	 */
	private static function templateParents(array $templateids): array {
		$parents = [];
		$pending = array_unique($templateids);

		while ($pending) {
			foreach ($pending as $templateid) {
				$parents[$templateid] = [];
			}

			$templates = API::Template()->get([
				'output' => ['templateid'],
				'templateids' => $pending,
				'selectParentTemplates' => ['templateid'],
				'preservekeys' => true
			]);

			$next = [];

			foreach ($templates as $templateid => $template) {
				$parents[$templateid] = array_column($template['parentTemplates'], 'templateid');

				foreach ($parents[$templateid] as $parentid) {
					if (!array_key_exists($parentid, $parents)) {
						$next[$parentid] = $parentid;
					}
				}
			}

			$pending = array_values($next);
		}

		return $parents;
	}
}
