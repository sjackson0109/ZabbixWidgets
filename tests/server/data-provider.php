<?php declare(strict_types = 0);
/*
 * Runs DataProvider's planning and macro resolution against an in-memory
 * stand-in for the Zabbix API, and prints the results as JSON for
 * tests/server/data-provider.test.js.
 */

const ITEM_VALUE_TYPE_FLOAT = 0;
const ITEM_VALUE_TYPE_STR = 1;
const ITEM_VALUE_TYPE_LOG = 2;
const ITEM_VALUE_TYPE_UINT64 = 3;
const ITEM_VALUE_TYPE_TEXT = 4;
const TRIGGER_VALUE_TRUE = 1;
const ZBX_MACRO_TYPE_TEXT = 0;
const ZBX_SORT_UP = 'ASC';

function _s(string $format, ...$arguments): string {
	return vsprintf($format, $arguments);
}

function timeUnitToSeconds(string $text): ?int {
	return preg_match('/^(\d+)([smhdw]?)$/', $text, $match)
		? (int) $match[1] * ['' => 1, 's' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400, 'w' => 604800][$match[2]]
		: null;
}

/** Answers template.get and usermacro.get from fixed data. */
class StubService {

	private string $name;

	public function __construct(string $name) {
		$this->name = $name;
	}

	public function get(array $options): array {
		$data = $GLOBALS['stub'];
		$GLOBALS['calls'][$this->name] = ($GLOBALS['calls'][$this->name] ?? 0) + 1;

		if ($this->name === 'Item') {
			$items = [];

			for ($index = 1; $index <= min($data['items'], $options['limit']); $index++) {
				$items[$index] = ['itemid' => (string) $index];
			}

			return $items;
		}

		if ($this->name === 'Template') {
			$result = [];

			foreach ($options['templateids'] as $templateid) {
				if (array_key_exists($templateid, $data['templates'])) {
					$result[$templateid] = ['templateid' => $templateid, 'parentTemplates' => array_map(
						static function ($id): array {
							return ['templateid' => (string) $id];
						}, $data['templates'][$templateid]
					)];
				}
			}

			return $result;
		}

		$rows = [];

		$macro = $options['filter']['macro'][0];

		if (!empty($options['globalmacro'])) {
			return $data['global'] === null ? [] : [['macro' => $macro, 'value' => $data['global']]];
		}

		foreach ($data['macros'] as $ownerid => $value) {
			if (in_array((string) $ownerid, array_map('strval', $options['hostids']), true)) {
				$rows[] = ['hostid' => (string) $ownerid, 'macro' => $macro, 'value' => $value];
			}
		}

		return $rows;
	}
}

class API {

	public static function __callStatic(string $name, array $arguments): StubService {
		return new StubService($name);
	}
}

require __DIR__.'/../../modules/extended-charts/includes/ChartRegistry.php';
require __DIR__.'/../../modules/extended-charts/includes/DataProvider.php';

use Modules\ZabbixWidgetsCharts\Includes\ChartRegistry;
use Modules\ZabbixWidgetsCharts\Includes\DataProvider;

function call(DataProvider $provider, string $method, ...$arguments) {
	$reflection = new ReflectionMethod($provider, $method);
	$reflection->setAccessible(true);

	return $reflection->invoke($provider, ...$arguments);
}

function chart(string $id): array {
	foreach (ChartRegistry::charts() as $chart) {
		if ($chart['id'] === $id) {
			return $chart;
		}
	}

	throw new RuntimeException($id);
}

$input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
$results = [];

foreach ($input as $case) {
	$provider = new DataProvider(chart($case['chart']), $case['config']);

	if ($case['call'] === 'items') {
		$GLOBALS['stub'] = $case['stub'];
		$items = call($provider, 'resolveItems', ['items' => ['ZW *']], ['1']);
		$errors = (new ReflectionProperty($provider, 'errors'));
		$errors->setAccessible(true);
		$results[] = ['count' => count($items['value']), 'errors' => $errors->getValue($provider)];
	}
	elseif ($case['call'] === 'item_calls') {
		// How many item lookups one refresh makes: one per configured role, however many items match.
		$GLOBALS['stub'] = $case['stub'];
		$GLOBALS['calls'] = [];
		$items = call($provider, 'resolveItems', $case['fields'], ['1']);
		$results[] = ['calls' => $GLOBALS['calls'], 'roles' => count(array_filter($items))];
	}
	elseif ($case['call'] === 'macro_names') {
		$results[] = call($provider, 'macroNames');
	}
	elseif ($case['call'] === 'delay') {
		$results[] = array_map([DataProvider::class, 'delaySeconds'], $case['delays']);
	}
	elseif ($case['call'] === 'macros') {
		$GLOBALS['stub'] = $case['stub'];
		$hosts = [];

		foreach ($case['hosts'] as $hostid => $templateids) {
			$hosts[$hostid] = ['parentTemplates' => array_map(static function ($id): array {
				return ['templateid' => (string) $id];
			}, $templateids)];
		}

		$resolved = call($provider, 'resolveMacros', $hosts, [$case['config']['target_macro']]);
		$results[] = array_map('current', $resolved);
	}
	else {
		$results[] = call($provider, 'planReads', $case['series'], $case['period']);
	}
}

echo json_encode($results, JSON_THROW_ON_ERROR);
