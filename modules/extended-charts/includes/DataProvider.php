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

	/** Value types whose history is readable through history.get (binary is not). */
	private const HISTORY_TYPES = [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_STR, ITEM_VALUE_TYPE_LOG, ITEM_VALUE_TYPE_UINT64,
		ITEM_VALUE_TYPE_TEXT
	];

	/** Matches one user macro reference, with or without a context. */
	public const MACRO_PATTERN = '/\{\$[A-Z0-9_.]+(?::(?:"(?:[^"\\\\]|\\\\.)*"|[^}]*))?\}/';

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
			'severities' => [],
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

			if (ChartRegistry::needs($this->chart, 'problems')) {
				$this->addProblems($payload['series']);
				$payload['severities'] = self::severities();
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

			$options = [
				'output' => ['itemid', 'hostid', 'name', 'key_', 'value_type', 'units', 'delay'],
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
			];

			if (ChartRegistry::needs($this->chart, 'valuemaps')) {
				$options['selectValueMap'] = ['mappings'];
			}

			$items = API::Item()->get($options);

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
			// Two values where the chart shows the change since the previous one.
			$latest = Manager::History()->getLastValues($all_items, ChartRegistry::needs($this->chart, 'previous') ? 2 : 1,
				timeUnitToSeconds(CSettingsHelper::get(CSettingsHelper::HISTORY_PERIOD))
			);
		}

		$series = [];

		foreach ($items_by_role as $role => $items) {
			foreach ($items as $itemid => $item) {
				$last = $latest[$itemid][0] ?? null;
				$previous = $latest[$itemid][1] ?? null;

				$entry = [
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
					'delay' => self::delaySeconds($item['delay']),
					'history' => []
				];

				if (ChartRegistry::needs($this->chart, 'previous')) {
					$entry['previous'] = $previous !== null
						? ['value' => $previous['value'], 'clock' => (int) $previous['clock']]
						: null;
				}

				if (ChartRegistry::needs($this->chart, 'valuemaps')) {
					$entry['valuemap'] = !empty($item['valuemap']['mappings'])
						? array_map(static function (array $mapping): array {
							return ['type' => (int) $mapping['type'], 'value' => $mapping['value'],
								'newvalue' => $mapping['newvalue']
							];
						}, array_values($item['valuemap']['mappings']))
						: null;
				}

				$series[] = $entry;
			}
		}

		return $series;
	}

	/**
	 * The update interval in seconds when it is a plain interval ("30s", "1m",
	 * or the default part of a flexible interval); null for macros, scheduling
	 * and items without an interval (trappers). The browser then judges gaps
	 * from the samples themselves.
	 */
	public static function delaySeconds($delay): ?int {
		$delay = trim(explode(';', (string) $delay)[0]);

		if (!preg_match('/^\d+[smhdw]?$/', $delay)) {
			return null;
		}

		$seconds = timeUnitToSeconds($delay);

		return $seconds !== null && $seconds > 0 ? (int) $seconds : null;
	}

	/**
	 * Adds the triggers currently in the problem state to each series, from
	 * the triggers that use its item. Disabled and dependent triggers are
	 * left out, as on Zabbix's own problem views.
	 */
	private function addProblems(array &$series): void {
		$itemids = array_column($series, 'itemid');

		if (!$itemids) {
			return;
		}

		$triggers = API::Trigger()->get([
			'output' => ['triggerid', 'description', 'priority'],
			'selectItems' => ['itemid'],
			'itemids' => $itemids,
			'monitored' => true,
			'skipDependent' => true,
			'filter' => ['value' => TRIGGER_VALUE_TRUE],
			'expandDescription' => true,
			'preservekeys' => true
		]);

		$problems = [];

		foreach ($triggers as $trigger) {
			foreach ($trigger['items'] as $item) {
				$problems[$item['itemid']][] = ['name' => $trigger['description'], 'severity' => (int) $trigger['priority']];
			}
		}

		foreach ($series as &$entry) {
			$entry['problems'] = $problems[$entry['itemid']] ?? [];
			usort($entry['problems'], static function (array $a, array $b): int {
				return [$b['severity'], $a['name']] <=> [$a['severity'], $b['name']];
			});
		}
		unset($entry);
	}

	/**
	 * Severity names and colours as configured in this Zabbix installation.
	 */
	private static function severities(): array {
		$severities = [];

		for ($severity = 0; $severity <= 5; $severity++) {
			$severities[] = [
				'name' => (string) CSettingsHelper::get('severity_name_'.$severity),
				'color' => '#'.CSettingsHelper::get('severity_color_'.$severity)
			];
		}

		return $severities;
	}

	/**
	 * Adds history, or hourly trends where they can stand in for it, to
	 * numeric series in place. All reads share one value budget; if the
	 * period holds more, the widget reports it instead of truncating.
	 *
	 * @return string  'history' or 'mixed' (trends for whole hours, history at the edges)
	 */
	private function addHistory(array &$series, array $period): string {
		// Charts that show states read text history too; every other chart reads numbers only.
		$types = $this->readsTextHistory() ? self::HISTORY_TYPES : self::NUMERIC_TYPES;
		$numeric = array_filter($series, static function (array $entry) use ($types): bool {
			return in_array($entry['value_type'], $types, true);
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
			if ($use_trends && in_array($value_type, $this->trendTypes(), true)) {
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

	/**
	 * Value types read from trends. Aggregating charts use floating-point
	 * trends only (unsigned trends store a rounded average); charts that draw
	 * the hourly values as they are ("trends": "display") use both numeric types.
	 */
	private function trendTypes(): array {
		return ($this->chart['trends'] ?? '') === 'display' ? self::NUMERIC_TYPES : [ITEM_VALUE_TYPE_FLOAT];
	}

	private function readsTextHistory(): bool {
		foreach ($this->chart['roles'] as $role) {
			if ($role['numeric']) {
				return false;
			}
		}

		return true;
	}

	private function canUseTrends(array $period): bool {
		if (($this->chart['trends'] ?? '') === 'display') {
			return true;
		}

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

		$macros = $this->resolveMacros($details, $this->macroNames());
		$result = [];

		foreach ($details as $hostid => $host) {
			$result[] = [
				'hostid' => $hostid,
				'name' => $host['name'],
				'groups' => array_column($host['hostgroups'], 'name'),
				'tags' => $host['tags'],
				'macros' => $macros[$hostid] ?? []
			];
		}

		return $result;
	}

	/**
	 * User macros named in the settings the chart reads macros from
	 * ("macro_fields" in the registry), while those settings are shown.
	 */
	private function macroNames(): array {
		if (!ChartRegistry::needs($this->chart, 'macros')) {
			return [];
		}

		$visible = ChartRegistry::visibleControls($this->chart, $this->config);
		$names = [];

		foreach ($this->chart['macro_fields'] ?? [] as $field) {
			if (in_array($field, $visible, true) && preg_match_all(self::MACRO_PATTERN, $this->config[$field] ?? '', $found)) {
				array_push($names, ...$found[0]);
			}
		}

		return array_values(array_unique($names));
	}

	/**
	 * Resolves user macros per host in Zabbix's order: the host, then its
	 * templates level by level (each level in template ID order), then the
	 * global value. Secret and vault macros are not readable and are treated
	 * as undefined.
	 *
	 * @return array  hostid => [macro => value]
	 */
	private function resolveMacros(array $hosts, array $macros): array {
		if (!$macros) {
			return [];
		}

		$parents = [];

		foreach ($hosts as $hostid => $host) {
			$parents[$hostid] = array_column($host['parentTemplates'], 'templateid');
		}

		$parents += self::templateParents(array_merge([], ...array_values($parents)));

		$values = [];

		foreach (API::UserMacro()->get([
			'output' => ['hostid', 'macro', 'value'],
			'hostids' => array_keys($parents),
			'filter' => ['macro' => $macros, 'type' => ZBX_MACRO_TYPE_TEXT]
		]) as $row) {
			$values[$row['macro']][$row['hostid']] = $row['value'];
		}

		$global = [];

		foreach (API::UserMacro()->get([
			'output' => ['macro', 'value'],
			'globalmacro' => true,
			'filter' => ['macro' => $macros, 'type' => ZBX_MACRO_TYPE_TEXT]
		]) as $row) {
			$global[$row['macro']] = $row['value'];
		}

		$resolved = [];

		foreach (array_keys($hosts) as $hostid) {
			foreach ($macros as $macro) {
				$value = self::resolveMacro($hostid, $parents, $values[$macro] ?? []) ?? $global[$macro] ?? null;

				if ($value !== null) {
					$resolved[$hostid][$macro] = $value;
				}
			}
		}

		return $resolved;
	}

	/**
	 * The value nearest to the host: the host itself, then each template
	 * level in turn, the lowest template ID first within a level.
	 */
	private static function resolveMacro($hostid, array $parents, array $values): ?string {
		$level = [$hostid];
		$seen = [$hostid => true];

		while ($level) {
			foreach ($level as $ownerid) {
				if (array_key_exists($ownerid, $values)) {
					return $values[$ownerid];
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

		return null;
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
