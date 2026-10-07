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

## Source-similarity review

`npm run audit:similarity -- <reference checkout>...` compares every authored source file (JavaScript, PHP and CSS, including tests and scripts) with the reference code. CI runs it on every change against fresh clones of `sjackson0109/Echarts-Zabbix` (the fork) and `Monzphere/Echarts-Zabbix`. Minified third-party bundles in the references (ECharts and its plugins) are skipped.

It looks for shared runs of tokens, after removing comments and whitespace, in two forms:

- **exact:** the same tokens in the same order;
- **structural:** the same sequence once identifiers, strings and numbers are replaced by placeholders, which would reveal a renamed copy. Runs that are one short pattern repeated, such as object literals or builder chains, are ignored because they appear in any code.

CI fails on any shared run of 40 tokens or more that has not been reviewed. The reviewed runs, with their reasons, are listed in `scripts/similarity-reviewed.json`. At v1.0.0 there are three, and all of them are Zabbix framework calls that every widget module makes:

| File | Tokens | What is shared |
|---|---|---|
| `views/widget.view.php` | 29 exact, 77 structural | `(new CWidgetView($data))->addItem((new CDiv())...)->setVar(...)->show()`, the Zabbix widget view API. The containers, classes and variables differ. |
| `includes/WidgetForm.php` | 43 exact | The time period field defaulting to the dashboard's period through `CWidgetField::createTypedReference(REFERENCE_DASHBOARD, DATA_TYPE_TIME_PERIOD)`, as documented by Zabbix. |
| `tests/ui/controller.test.js` | 45 structural | A test item literal (id, host, units, value). The field names are Zabbix item fields. |

Everything below 40 tokens is the common vocabulary of the two APIs, such as ECharts option keys (`tooltip`, `trigger: 'axis'`, `series: [{ type: 'bar' ...`) and Zabbix field declarations.

The first review also matched the Gantt bar drawing, 77 structural tokens long. Both versions follow the ECharts custom-series Gantt example (`api.coord` for each end of the bar). The ZabbixWidgets version was rewritten to size the bar with `api.size` so that it no longer follows that shape.

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
