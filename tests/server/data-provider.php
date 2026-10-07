<?php declare(strict_types = 0);
/*
 * Runs DataProvider's planning and macro resolution against an in-memory
 * stand-in for the Zabbix API, and prints the results as JSON for
 * tests/server/data-provider.test.js.
 */

const ITEM_VALUE_TYPE_FLOAT = 0;
const ITEM_VALUE_TYPE_UINT64 = 3;
const ZBX_MACRO_TYPE_TEXT = 0;
const ZBX_SORT_UP = 'ASC';

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

		if (!empty($options['globalmacro'])) {
			return $data['global'] === null ? [] : [['value' => $data['global']]];
		}

		foreach ($data['macros'] as $ownerid => $value) {
			if (in_array((string) $ownerid, array_map('strval', $options['hostids']), true)) {
				$rows[] = ['hostid' => (string) $ownerid, 'value' => $value];
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

	if ($case['call'] === 'macros') {
		$GLOBALS['stub'] = $case['stub'];
		$hosts = [];

		foreach ($case['hosts'] as $hostid => $templateids) {
			$hosts[$hostid] = ['parentTemplates' => array_map(static function ($id): array {
				return ['templateid' => (string) $id];
			}, $templateids)];
		}

		$results[] = call($provider, 'resolveTargetMacro', $hosts);
	}
	else {
		$results[] = call($provider, 'planReads', $case['series'], $case['period']);
	}
}

echo json_encode($results, JSON_THROW_ON_ERROR);
