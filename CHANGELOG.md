# Changelog

## Unreleased

- Thirteen more charts: LLD Data Table (C14), Pie (C15), Vertical Level Gauge (C16), Horizontal Ranking Bar (C17), Treemap (C18), Sunburst (C19), Funnel (C20), Temporal Line (C21), Temporal Area (C22), Status Matrix (C23), State Timeline (C24), Sparkline Grid (C25) and Threshold Band (C26). C01-C13 keep their stored chart type values.
- Time-series charts share one layer: real samples only, lines broken at gaps (2.5 update intervals by default, or a set maximum), a crosshair tooltip with each series' nearest sample and "no data" where there is none, one Y-axis per unit, zoom and pan, and hourly trends for long periods.
- Thresholds, targets and scale limits accept numbers or user macros, resolved per host; a chart that draws one set for several hosts reports macros that differ.
- Value mappings, previous values and the item's triggers in the problem state, with Zabbix's severity names and colours, are read when a chart uses them.
- Charts can be HTML (table, matrix, sparkline grid) as well as ECharts. Legend selection, zoom and table sorting survive refreshes.
- Settings shared by every chart, such as the legend, are hidden where a chart does not use them.

## 1.0.0 - 2026-10-07

First release, under the MIT licence.

- Thirteen dashboard charts built on Apache ECharts 6.1.0: Vertical Column, Stacked Bar, Doughnut, Bullet Graph, Radar, Heat Map, Candlestick / OHLC, Bubble, Gantt, Tree Diagram, Network, Chord / Relationship and Calendar Heat Map.
- Supports Zabbix 7.0, 7.2 and 7.4, light and dark themes, dashboard time periods, host and item selection, and template dashboards.
- Each chart has an explicit data contract. When the data does not meet it, the widget explains what is missing instead of drawing a misleading chart.
- The edit form shows only the settings the selected chart uses.
- Data is read as the current user, within fixed limits on hosts, items and history values.
- ECharts is bundled privately, so the module can run beside other modules that load their own copy.
- The release package is reproducible: the same commit builds the same bytes.
