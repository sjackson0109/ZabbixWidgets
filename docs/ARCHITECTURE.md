# Architecture

```text
modules/extended-charts/         Zabbix module (what gets installed)
├── manifest.json                identity: zabbixwidgets_charts / ZabbixWidgetsCharts
├── registry/charts.json         chart capability registry (single source of truth)
├── Widget.php
├── includes/
│   ├── WidgetForm.php           every field; chart-specific requirements in validate()
│   ├── WidgetConfig.php         stored field values -> browser configuration
│   ├── ChartRegistry.php        PHP reader for registry/charts.json
│   └── DataProvider.php         fetches what the chart's contract asks for
├── actions/WidgetView.php       builds the payload
├── views/                       widget body, edit form, edit-form bootstrap
└── assets/                      built bundle (git-ignored) and scoped CSS

src/                             browser code, bundled with ECharts by esbuild
├── registry/                    registry access, conditions, visible controls
├── data/                        normalisation, units, aggregation, OHLC, pairing,
│                                hierarchy, edges, relationships, radar
├── validation/                  contract rules and user-facing messages
├── renderers/                   one module per chart (C01-C13)
├── ui/                          widget class, chart controller, edit form, theme
└── utils/
```

## Request flow

1. Zabbix calls `widget.zabbixwidgets_charts.view`. `WidgetView` reads the chart from the registry and turns the stored fields into a configuration.
2. `DataProvider` fetches only what the contract lists. It runs as the current user, so Zabbix permissions apply.
   - Hosts come from the override host, or from host groups and hosts.
   - Items come from item-name patterns, one pattern field per role.
   - Latest values are read only when the chart needs them.
   - History or trends are read only when the chart needs them.
   - Host groups, tags and macros are read only when the chart needs them.
3. The payload goes to the browser as `zw_payload`. It contains `chart`, `config`, `series[]`, `hosts[]`, `time_period`, `history_source` and `errors[]`.
4. `ChartController` normalises the payload, validates it against the contract, and then either renders or shows the problems as text. It keeps one ECharts instance per widget and disposes it when the widget is destroyed.

## Data limits

| Limit | Value | What happens when it is exceeded |
|---|---|---|
| Hosts | 1000 | Error asking to narrow the selection. |
| Items per role | 500 | Error asking to narrow the pattern. |
| History and trend values per refresh (shared budget) | 200,000 | Counted first; an error is shown instead of a truncated chart. Reads are also capped, so data arriving between count and read cannot exceed the budget. |

## History and trends

Periods longer than two days can read hourly trends. This applies only to charts whose aggregation trends can support: the calendar heat map, and the heat map with whole-hour buckets. Within those charts:

- **Floating-point items only.** Unsigned trends store a rounded average.
- **Whole hours inside the period only.** The partial hours at each end are read from raw history.
- **Calendar: whole-hour UTC offsets only.** Trends are used only when every offset in the period is a whole number of hours, so no trend hour straddles midnight.
- **Weighting.** Each trend hour adds `avg × count` to sums and `count` to counts; min and max come from the hour's min and max.

Under these conditions, trend-based sums, averages, counts, minima and maxima match raw history except for floating-point rounding of the stored average. Candlesticks always read raw history, because trends do not record first and last samples.

## Isolation from other modules

- **ECharts:** bundled inside an IIFE. `window.echarts` is never read or written.
- **Globals:** only `WidgetZabbixWidgetsCharts` and `ZabbixWidgetsCharts`.
- **CSS:** every rule is under `.zw-charts`.
- **DOM:** lookups are scoped to the widget. Lint forbids document-wide queries in runtime code.
