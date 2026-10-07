<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Actions;

use CControllerDashboardWidgetView;
use CControllerResponseData;
use Modules\ZabbixWidgetsCharts\Includes\ChartRegistry;
use Modules\ZabbixWidgetsCharts\Includes\DataProvider;
use Modules\ZabbixWidgetsCharts\Includes\WidgetConfig;

class WidgetView extends CControllerDashboardWidgetView {

	protected function doAction(): void {
		$chart = ChartRegistry::byFormValue((int) $this->fields_values['chart_type']);

		if ($chart === null) {
			$payload = ['chart' => null, 'errors' => [_('Select a chart type.')]];
		}
		else {
			$config = WidgetConfig::fromFieldValues($this->fields_values);
			// Calendar days follow the time zone the frontend uses for this user.
			$config['time_zone'] = date_default_timezone_get();

			$payload = (new DataProvider($chart, $config))->collect($this->fields_values);
		}

		$this->setResponse(new CControllerResponseData([
			'name' => $this->getInput('name', $this->widget->getDefaultName()),
			'payload' => $payload,
			'user' => [
				'debug_mode' => $this->getDebugMode()
			]
		]));
	}
}
