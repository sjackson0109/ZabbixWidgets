# Changelog

## 1.0.0 - 2026-10-07

First release, under the MIT licence.

- Twenty-six dashboard charts built on Apache ECharts 6.1.0 and HTML: Vertical Column (C01), Stacked Bar (C02), Doughnut (C03), Bullet Graph (C04), Radar (C05), Heat Map (C06), Candlestick / OHLC (C07), Bubble (C08), Gantt (C09), Tree Diagram (C10), Network (C11), Chord / Relationship (C12), Calendar Heat Map (C13), LLD Data Table (C14), Pie (C15), Vertical Level Gauge (C16), Horizontal Ranking Bar (C17), Treemap (C18), Sunburst (C19), Funnel (C20), Temporal Line (C21), Temporal Area (C22), Status Matrix (C23), State Timeline (C24), Sparkline Grid (C25) and Threshold Band (C26).
- Chart type 27 is reserved and never reused. The Switch Port Panel that used it was withdrawn before release; a widget saved with it says the chart was removed.
- One axis range helper for charts that size their own axes, one number formatter per precision (noticeably faster on large charts), and shared natural sort and colour helpers.
- Time-series charts share one layer: real samples only, lines broken at gaps (2.5 update intervals by default, or a set maximum), a crosshair tooltip with each series' nearest sample and "no data" where there is none, one Y-axis per unit, zoom and pan, and hourly trends for long periods.
- Thresholds, targets and scale limits accept numbers or user macros, resolved per host; a chart that draws one set for several hosts reports macros that differ.
- Value mappings, previous values and the item's triggers in the problem state, with Zabbix's severity names and colours, are read when a chart uses them.
- Charts can be HTML (table, matrix, sparkline grid) as well as ECharts. Legend selection, zoom and table sorting survive refreshes.
- Settings shared by every chart, such as the legend, are hidden where a chart does not use them.
- Supports Zabbix 7.0, 7.2 and 7.4, light and dark themes, dashboard time periods, host and item selection, and template dashboards.
- Each chart has an explicit data contract. When the data does not meet it, the widget explains what is missing instead of drawing a misleading chart.
- The edit form shows only the settings the selected chart uses.
- Data is read as the current user, within fixed limits on hosts, items and history values.
- ECharts is bundled privately, so the module can run beside other modules that load their own copy.
- The release package is reproducible: the same commit builds the same bytes.
