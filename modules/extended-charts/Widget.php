<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts;

use Zabbix\Core\CWidget;

class Widget extends CWidget {

	public function getDefaultName(): string {
		return _('Extended Charts');
	}
}
