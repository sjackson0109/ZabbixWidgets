# Architecture

```text
modules/extended-charts/         Zabbix module (what gets installed)
├── manifest.json                identity: zabbixwidgets_charts / ZabbixWidgetsCharts
├── registry/charts.json         chart registry: contracts, item fields, enums, control conditions
├── Widget.php
├── includes/
│   ├── WidgetForm.php           every field; chart-specific requirements in validate()
│   ├── WidgetConfig.php         stored field values -> browser configuration
│   ├── ChartRegistry.php        PHP reader for registry/charts.json
│   └── DataProvider.php         fetches what the chart's contract asks for
├── actions/WidgetView.php       builds the payload
├── views/                       widget body, edit form (fields in WidgetForm order), edit-form bootstrap
└── assets/                      built bundle (git-ignored) and scoped CSS

src/                             browser code, bundled with ECharts by esbuild
├── registry/                    registry access, conditions, visible controls
├── data/                        normalisation, units, aggregation, OHLC, pairing,
│                                hierarchy, edges, relationships, radar, value maps,
│                                row identity, thresholds, time series, states
├── validation/                  contract rules and user-facing messages
├── renderers/                   one module per chart (C01-C26), plus shared axes, dimensions and the time-series builder
├── ui/                          widget class, chart controller, edit form, theme
└── utils/
```

## The registry

`registry/charts.json` is read by both sides. `ChartRegistry.php` and `src/registry/index.js` implement the same functions over it (active roles, visible controls, required controls, history and time-period needs), and `tests/compat/registry-parity.test.js` checks they agree for every chart and setting.

- **Charts:** roles (which item field feeds which role, whether it is required, numeric, and how many items it takes), the data to fetch, `min_series`, the controls the chart uses and the validation rules it runs.
- **Enums:** radio and select values, stored by Zabbix as their index. Append only.
- **Item fields:** the item pattern fields and their labels.
- **Control conditions:** when a control is shown, for example `target_macro` only when the target comes from a macro. A chart can override one, as the heat map does for its time controls.
- **Required controls:** settings that must be filled in whenever they are shown. The form enforces them on save; the browser reports them for widgets saved another way.

- **Data tokens:** `latest`, `previous` (the value before the latest), `history`, `valuemaps`, `problems` (the item's triggers in the problem state), `hosts`, `groups`, `tags` and `macros`. `macro_fields` names the settings whose user macros are resolved per host. `trends: "display"` lets a time-series chart draw hourly trends of both numeric types as they are.

Adding a chart means adding its entry, its renderer and any new rule, field or condition; the form, the server and the browser pick it up from there.

## Request flow

1. Zabbix calls `widget.zabbixwidgets_charts.view`. `WidgetView` reads the chart from the registry and turns the stored fields into a configuration.
2. `DataProvider` fetches only what the contract lists. It runs as the current user, so Zabbix permissions apply.
   - Hosts come from the override host, or from host groups and hosts.
   - Items come from item-name patterns, one pattern field per role.
   - Latest values are read only when the chart needs them.
   - History or trends are read only when the chart needs them.
   - Host groups, tags and macros are read only when the chart needs them. A bullet target macro is resolved in Zabbix's order: the host, then its templates level by level (in template ID order within a level), then the global macro.
3. The payload goes to the browser as `zw_payload`. It contains `chart`, `config`, `series[]`, `hosts[]`, `time_period`, `history_source` and `errors[]`.
4. `ChartController` normalises the payload, validates it against the contract, and then either renders or shows the problems as text. ECharts renderers return an option; HTML renderers (`kind: "dom"`: C14, C23, C25) draw into the canvas themselves. The controller keeps one ECharts instance per widget, disposes it when the widget is destroyed or switches to an HTML chart, and keeps view state (legend selection, zoom, table sorting and paging) across refreshes of the same chart.

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

Time-series charts (C21 Temporal Line, C22 Temporal Area, C25 Sparkline Grid, C26 Threshold Band) also read hourly trends for periods longer than two days, for both numeric types, and draw each trend hour as its average with its minimum and maximum in the tooltip. C24 State Timeline never reads trends, because states cannot be averaged.

Under these conditions, trend-based sums, averages, counts, minima and maxima match raw history except for floating-point rounding of the stored average. Candlesticks always read raw history, because trends do not record first and last samples.

## Time series

`src/data/temporal.js` is shared by C21, C22, C24, C25 and C26.

- **Real samples only.** Points are drawn where Zabbix recorded them. Nothing is interpolated, filled with zero or carried forward.
- **Gaps.** Two samples further apart than the series' gap threshold are not joined. The threshold is the "Maximum gap" setting, or by default 2.5 update intervals: the item's own interval when it is a plain one, otherwise the median spacing of its samples. Hourly trends use at least two hours. `0` never breaks lines.
- **Tooltip.** The crosshair shows the sample time nearest the pointer, then each visible series' own nearest sample within half its gap threshold, with its time when it differs, or "no data".
- **Axes.** Each distinct unit gets its own Y-axis, at most two. Axis limits are numbers or macros.
- **Stacking.** Stacked areas average each series into shared buckets (the longest typical interval, rounded up to a usual step). A bucket missing any series is left empty for all of them, so a stack never adds up a partial set. Only one additive unit can be stacked.
- **States.** A state lasts from its sample until the next one, but no longer than the gap threshold; unknown time is drawn as "no data". Colours come from the value colour list, then from the palette in a stable order.

## Isolation from other modules

- **ECharts:** bundled inside an IIFE. `window.echarts` is never read or written.
- **Globals:** only `WidgetZabbixWidgetsCharts` and `ZabbixWidgetsCharts`.
- **CSS:** every rule is under `.zw-charts`.
- **DOM:** lookups are scoped to the widget. Lint forbids document-wide queries in runtime code.
