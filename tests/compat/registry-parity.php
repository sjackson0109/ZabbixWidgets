<?php declare(strict_types = 1);
/*
 * Reads [{chart, config}] as JSON on stdin and prints what ChartRegistry.php
 * decides for each case, for tests/compat/registry-parity.test.js.
 */

require __DIR__.'/../../modules/extended-charts/includes/ChartRegistry.php';

use Modules\ZabbixWidgetsCharts\Includes\ChartRegistry;

$cases = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
$charts = array_column(ChartRegistry::charts(), null, 'id');
$results = [];

foreach ($cases as $case) {
	$chart = $charts[$case['chart']];
	$config = $case['config'];

	$results[] = [
		'activeRoles' => array_keys(ChartRegistry::activeRoles($chart, $config)),
		'visibleControls' => ChartRegistry::visibleControls($chart, $config),
		'requiredControls' => ChartRegistry::requiredControls($chart, $config),
		'history' => ChartRegistry::requiresHistory($chart, $config),
		'timePeriod' => ChartRegistry::requiresTimePeriod($chart, $config)
	];
}

echo json_encode($results, JSON_THROW_ON_ERROR);
