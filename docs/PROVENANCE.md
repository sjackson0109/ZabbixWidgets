# Provenance

## Inspiration

ZabbixWidgets was inspired by [Monzphere/Echarts-Zabbix](https://github.com/Monzphere/Echarts-Zabbix). That project showed that Apache ECharts can be used inside a Zabbix dashboard widget.

## Independent implementation

ZabbixWidgets is an independent implementation. It is not affiliated with, endorsed by, or a source-code continuation of the Monzphere project. Monzphere source code is not intentionally included in the released ZabbixWidgets implementation.

ZabbixWidgets grew out of an earlier fork, `sjackson0109/Echarts-Zabbix`, which added 13 chart types to the Monzphere code. That fork is distributed under the AGPL. ZabbixWidgets was written afresh in a separate repository with its own history. The fork was used only as a **behavioural reference**: what each chart was meant to show, which inputs it needs, and which defects to avoid. That reference is recorded in prose in [REFERENCE-BEHAVIOUR.md](REFERENCE-BEHAVIOUR.md), which contains no code from the fork.

These were written without copying or mechanically transforming fork code:

- the module identity (`zabbixwidgets_charts`, `Modules\ZabbixWidgetsCharts`, `WidgetZabbixWidgetsCharts`, `widget.zabbixwidgets_charts.view`);
- the chart registry and data contracts;
- the data layer;
- the validation;
- the PHP classes;
- the renderers;
- the styles;
- the colour palette, which is the published Okabe-Ito colour-blind-safe set.

`npm run audit:provenance` fails if upstream identifiers appear outside the files that acknowledge the project by name.

### How the clean-room rule was applied

The author of this implementation read the fork's code while writing the behavioural reference. This is not a strict two-team clean room. Code was never copied, and every module was written against the documented APIs listed below. Reviewers should keep checking new code against that rule.

## References used

- Zabbix 7.0 frontend module and widget documentation: <https://www.zabbix.com/documentation/7.0/en/devel/modules>
- Zabbix 7.0 API reference (item, history, trend, host, usermacro): <https://www.zabbix.com/documentation/7.0/en/manual/api>
- Apache ECharts 6.1 documentation: <https://echarts.apache.org/en/option.html>

## Apache ECharts

The release bundles Apache ECharts 6.1.0. It is obtained from the official npm package `echarts`, not copied from any other project, and pinned in `package-lock.json`. Its licensing is recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Licensing

ZabbixWidgets is an independently authored implementation and will be distributed under the MIT licence once the copyright holder is confirmed. It is **not** a relicensing of Echarts-Zabbix. Third-party dependencies keep their own licences.
