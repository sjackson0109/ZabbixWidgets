# Changelog

## 1.0.0 - 2026-10-07

First release, under the MIT licence.

- Thirteen dashboard charts built on Apache ECharts 6.1.0: Vertical Column, Stacked Bar, Doughnut, Bullet Graph, Radar, Heat Map, Candlestick / OHLC, Bubble, Gantt, Tree Diagram, Network, Chord / Relationship and Calendar Heat Map.
- Supports Zabbix 7.0, 7.2 and 7.4, light and dark themes, dashboard time periods, host and item selection, and template dashboards.
- Each chart has an explicit data contract. When the data does not meet it, the widget explains what is missing instead of drawing a misleading chart.
- The edit form shows only the settings the selected chart uses.
- Data is read as the current user, within fixed limits on hosts, items and history values.
- ECharts is bundled privately, so the module can run beside other modules that load their own copy.
- The release package is reproducible: the same commit builds the same bytes.
