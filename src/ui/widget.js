/**
 * Dashboard widget class registered with Zabbix as WidgetZabbixWidgetsCharts.
 * Zabbix's CWidget base class is only available at runtime in the dashboard,
 * so the class is created by a factory once the bundle loads.
 */
import { ChartController } from './controller.js';

export function createWidgetClass(BaseWidget) {
	return class WidgetZabbixWidgetsCharts extends BaseWidget {

		onInitialize() {
			this._zw_controller = null;
			this._zw_payload = null;
		}

		processUpdateResponse(response) {
			this._zw_payload = response.zw_payload ?? null;
			super.processUpdateResponse(response);
		}

		setContents(response) {
			// The body markup never changes, so it is written once and the chart instance is reused.
			if (this._zw_controller === null || !this._body.contains(this._zw_controller.root)) {
				this._zw_controller?.dispose();
				super.setContents(response);
				const root = this._body.querySelector('.zw-charts');
				this._zw_controller = root === null ? null : new ChartController(root);
			}
			this._zw_controller?.render(this._zw_payload);
		}

		onResize() {
			this._zw_controller?.resize();
		}

		onClearContents() {
			this._zw_controller?.dispose();
			this._zw_controller = null;
		}

		onDestroy() {
			this._zw_controller?.dispose();
			this._zw_controller = null;
		}
	};
}
