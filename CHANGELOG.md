# Changelog

## Unreleased

- **C34 Wireless Floor Map**: access points drawn on a floor plan (a Zabbix background image). Each radio shows its estimated coverage as nine stacked translucent discs, one per 4 dB signal level down to a coverage edge, sized in metres by the ITU-R P.1238 indoor model from the radio's transmit power and channel frequency, and labelled as an estimate that leaves walls out. Colour shows SNR against thresholds; channel and channel width are in the tooltip. Coverage gaps (no radio reaches the edge) and channel overlap (two access points on overlapping spectrum, from channel and channel width) are shaded on a grid, except over fully transparent parts of the plan, which count as outside the building. Bands are offset a few pixels so their centres stay apart, and a "Band only" style draws plain band rings instead. Hovering a radio highlights the others on the same band and channel. An optional badge shows the rogue AP count each access point reports. Positions come from the access point's own host macros or a positions list, in percent of the image; bands come only from the band item.
- Host tag filter for the Wireless Floor Map (`tag` or `tag=value`, separated by commas).

## 1.0.0 - 2026-10-08

First release, under the MIT licence.

- Thirty-two dashboard charts built on Apache ECharts 6.1.0 and HTML: Vertical Column (C01), Stacked Bar (C02), Doughnut (C03), Bullet Graph (C04), Radar (C05), Heat Map (C06), Candlestick / OHLC (C07), Bubble (C08), Gantt (C09), Tree Diagram (C10), Network (C11), Chord / Relationship (C12), Calendar Heat Map (C13), LLD Data Table (C14), Pie (C15), Gauge (C16), Horizontal Ranking Bar (C17), Treemap (C18), Sunburst (C19), Funnel (C20), Temporal Line (C21), Temporal Area (C22), Status Matrix (C23), State Timeline (C24), Sparkline Grid (C25), Threshold Band (C26), Mixed Line and Bar (C28), Distribution (C29), Parallel Coordinates (C30), Sankey (C31), Geographic Site Map (C32) and Waterfall (C33).
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
- History samples within the same second keep Zabbix's nanosecond order.
- Durations under a minute keep their fractions (2.5s rather than 3s).
- [Apache ECharts example coverage](docs/ECHARTS-COVERAGE.md) compares every example in the official gallery with what the module draws.

### C28-C33 in detail

- **C28 Mixed Line and Bar**: bars aggregated per period (average, sum, minimum, maximum or count) with lines over them, one axis per unit, at most two. Whole-day bars follow calendar days in the dashboard time zone across daylight-saving changes.
- **C29 Distribution (Boxplot / Histogram)**: box plots with Tukey outliers, or histograms with automatic or fixed bins, from raw history only. Hourly trends cannot give quartiles, so a period that would need them is refused.
- **C30 Parallel Coordinates**: one axis per named metric, one line per host or tag value; lines missing an axis are reported and left out.
- **C31 Sankey**: directed flows between endpoints named by item tags; negative flows, non-additive units and cycles are refused. Horizontal or vertical, with node alignment.
- **C32 Geographic Site Map**: hosts at their inventory latitude and longitude over a bundled world outline (Natural Earth, public domain), an administrator's GeoJSON file from the module's `assets/geo` folder, or no base map. Optional links with measured widths and threshold colours. Nothing is fetched from map services.
- **C33 Waterfall**: contributions, measured levels and totals from named items, with a warning when a level differs from the running total.

### Presentations

Charts that can be drawn more than one way offer a choice in the edit form:

- C01 Column: horizontal orientation.
- C02 Stacked Bar: percentage of each category (left empty when a member has no value) and diverging bars with opposing items; vertical orientation.
- C03 Doughnut and C15 Pie: rose layout by radius or area, inner and outer radius; label position for the doughnut.
- C08 Bubble: plain XY scatter without a size item.
- C10 Tree: right-to-left, top-down, bottom-up and radial layouts; zoom and pan kept across refreshes.
- C11 Network: circular, force or fixed layouts; directed or undirected links; node colours by host group or host tag; host and link label toggles; link weights from a number or an item on the source host. Dragged nodes and zoom are kept across refreshes. Peers named by host tags that the user cannot read are counted, never named.
- C16 Gauge: dial, progress arc and ring as well as the level tube, laid out for the widget's shape, with the target as a mark on the rim.
- C21 Temporal Line: step modes (hold until the next sample, back to the previous one, or change halfway), with the held value in the tooltip.
