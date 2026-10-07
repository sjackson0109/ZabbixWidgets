<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
	->addItem(
		(new CDiv())
			->addClass('zw-charts')
			->addItem((new CDiv())->addClass('zw-charts-canvas'))
			->addItem((new CDiv())->addClass('zw-charts-messages'))
	)
	->setVar('zw_payload', $data['payload'])
	->show();
