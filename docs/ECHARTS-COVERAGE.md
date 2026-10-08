# Apache ECharts example coverage

This matrix compares the module with the official Apache ECharts example gallery, so it is clear which presentations a Zabbix dashboard can show with ZabbixWidgets and why the others are not offered. It is a reference list, not a score: the counts below are numbers of gallery examples, and they say nothing about how much of ECharts or of a monitoring need is covered.

Source: [apache/echarts-examples](https://github.com/apache/echarts-examples) at commit `88ca004030e999073a15303e5fe32462b8fefae2` (2026-09-24), file `src/data/chart-list-data.js`. The examples were used as reference material only; no example code is included in the module.

## Classes

| Class | Meaning |
| --- | --- |
| supported | A chart in the module draws this presentation from Zabbix data, with the settings named. |
| partial | The main presentation is drawn; the parts listed are not. |
| planned | Fits Zabbix data and is a candidate for a later release; not built yet. |
| extension | Needs data or input the module does not hold today (region maps, statistics across items, rankings over time, user-supplied pictures), so it would need a new data source or adapter first. |
| excluded | Not offered, for the reason given: decoration or animation demos, generated data, external map services, arbitrary JavaScript, or features outside a dashboard widget. |

## Summary

| Class | Gallery examples |
| --- | ---: |
| supported | 120 |
| partial | 32 |
| planned | 19 |
| extension | 21 |
| excluded | 105 |
| **total** | **297** |

Not listed one by one:

- **80 documentation snippets** (`doc-example/…` entries in the same file) illustrate single options for the ECharts handbook: tutorials, accessibility (aria), labels, text, axis pointers, and small versions of the chart types above. They are not separate presentations, so they take the class of the chart type they illustrate.
- **59 ECharts GL examples** (`src/data/chart-list-data-gl.js`: 3D bars, globes, surfaces, flow GL and similar) are **excluded**: the module bundles ECharts without the GL extension, and 3D adds no reading of monitoring values that a 2D chart does not give.

## By gallery category

Examples are grouped by their first gallery category, in gallery order.

### custom

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `bar-histogram` Histogram with Custom Series | supported | C29 Distribution | Histogram from raw samples (dist_view = histogram), automatic or fixed bins. |
| `custom-profit` Profit | supported | C33 Waterfall | Profit-and-loss style waterfall. |
| `custom-error-scatter` Error Scatter on Catesian | planned | C21 Line | Error bars from minimum and maximum items. |
| `custom-bar-trend` Custom Bar Trend | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `custom-cartesian-polygon` Custom Cartesian Polygon | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `custom-error-bar` Error Bar on Catesian | planned | C21 Line | Error bars from minimum and maximum items. |
| `custom-profile` Profile | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `cycle-plot` Cycle Plot | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `custom-gantt-flight` Gantt Chart of Airport Flights | supported | C09 Gantt | Tasks from start and end (or duration) items. |
| `custom-polar-heatmap` Polar Heatmap | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `flame-graph` Flame graph | extension | — | Flame graph of call stacks; profiling data is not held as Zabbix items. |
| `wind-barb` Wind Barb | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `custom-hexbin` Hexagonal Binning | extension | — | Hexagonal binning over a map needs many coordinate points per region. |
| `custom-calendar-icon` Custom Calendar Icon | excluded | — | Small charts or graphs inside calendar cells; decorative layout. |
| `custom-wind` Use custom series to draw wind vectors | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `custom-gauge` Custom Gauge | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `geo-svg-custom-effect` GEO SVG with Customized Effect | excluded | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. Animated effects as well. |
| `pie-parliament-transition` Transition of Parliament and Pie Chart | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `circle-packing-with-d3` Circle Packing with d3 | excluded | — | Uses the d3 library for layout; the module bundles ECharts only. |
| `custom-spiral-race` Custom Spiral Race | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |

### bar

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `bar-simple` Basic Bar | supported | C01 Column | Columns per host or item. |
| `bar-tick-align` Axis Align with Tick | supported | C01 Column | Columns per host or item. |
| `bar-background` Bar with Background | supported | C01 Column | Columns per host or item. |
| `bar-data-color` Set Style of Single Bar. | supported | C01 Column | Columns per host or item. |
| `bar-waterfall` Waterfall Chart | supported | C33 Waterfall | Contributions, levels and totals from named items. |
| `bar-negative2` Bar Chart with Negative Value | supported | C01 Column | Negative values extend below zero. |
| `bar-polar-label-radial` Radial Polar Bar Label Position | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-polar-label-tangential` Tangential Polar Bar Label Position | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-y-category` World Population | supported | C01 Column | Horizontal orientation (bar_orientation). |
| `polar-endAngle` Polar endAngle | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-breaks-simple` Bar Chart with Axis Breaks | planned | C01 Column / C21 Line | Axis breaks hide part of a value axis; a later presentation option for the column and line charts. |
| `bar-gradient` Clickable Column Chart with Gradient | supported | C01 Column | Columns per host or item. |
| `bar-label-rotation` Bar Label Rotation | supported | C01 Column | Columns per host or item. |
| `bar-stack` Stacked Column Chart | supported | C02 Stacked Bar | Stacked values. |
| `bar-stack-borderRadius` Stacked Bar with borderRadius | supported | C02 Stacked Bar | Stacked values. |
| `bar-stack-normalization` Stacked Bar Normalization | supported | C02 Stacked Bar | Percentage of category (stack_mode = percent); categories with a missing member are left empty. |
| `bar-stack-normalization-and-variation` Stacked Bar Normalization and Variation | partial | C02 Stacked Bar | Percentage stacking is drawn; the per-category variation overlay is not. |
| `bar-waterfall2` Waterfall Chart | supported | C33 Waterfall | Contributions, levels and totals from named items. |
| `bar-y-category-stack` Stacked Horizontal Bar | supported | C02 Stacked Bar | Stacked values. |
| `bar-brush` Brush Select on Column Chart | excluded | — | Brush selection across charts; selection is for analysis tools rather than a dashboard widget. |
| `bar-negative` Bar Chart with Negative Value | supported | C02 Stacked Bar | Diverging presentation: opposing items extend the other way from zero. |
| `bar1` Rainfall and Evaporation | supported | C01 Column | Columns per host or item. |
| `mix-line-bar` Mixed Line and Bar | supported | C28 Mixed Line and Bar | Bars and lines over time, with one axis per unit. |
| `mix-zoom-on-value` Mix Zoom On Value | partial | C28 Mixed Line and Bar | Time zoom is supported; zooming on the value axis is not. |
| `multiple-y-axis` Multiple Y Axes | supported | C28 Mixed Line and Bar | Bars and lines over time, with one axis per unit. |
| `bar-animation-delay` Animation Delay | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `bar-drilldown` Bar Chart Drilldown Animation | excluded | — | Drill-down between datasets on click; the module shows one dataset and links to Zabbix pages instead. |
| `bar-large` Large Scale Bar Chart | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `bar-race` Bar Race | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `bar-multi-drilldown` Bar Chart Multi-level Drilldown Animation | excluded | — | Drill-down between datasets on click; the module shows one dataset and links to Zabbix pages instead. |
| `bar-race-country` Bar Race | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `bar-rich-text` Weather Statistics | partial | C01 Column | Bars are drawn; rich-text label styling is not offered. |
| `dynamic-data` Dynamic Data | excluded | — | Simulated live data feed; the module refreshes from Zabbix on the dashboard interval instead. |
| `mix-timeline-finance` Finance Indices 2002 | excluded | — | Steps through several datasets with a timeline player; Zabbix data is one period per refresh. |
| `watermark` Watermark - ECharts Download | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. (watermark decoration) |
| `bar-polar-real-estate` Bar Chart on Polar | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-polar-stack` Stacked Bar Chart on Polar | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-polar-stack-radial` Stacked Bar Chart on Polar(Radial) | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `polar-roundCap` Rounded Bar on Polar | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `bar-breaks-brush` Bar Chart with Axis Breaks (Brush-enabled) | excluded | — | Brush selection across charts; selection is for analysis tools rather than a dashboard widget. |

### calendar

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `calendar-simple` Simple Calendar | supported | C13 Calendar Heat Map | Daily aggregate per calendar day. |
| `calendar-heatmap` Calendar Heatmap | supported | C13 Calendar Heat Map | Daily aggregate per calendar day. |
| `calendar-vertical` Calendar Heatmap Vertical | supported | C13 Calendar Heat Map | Daily aggregate per calendar day. |
| `calendar-horizontal` Calendar Heatmap Horizontal | supported | C13 Calendar Heat Map | Daily aggregate per calendar day. |
| `calendar-graph` Calendar Graph | excluded | — | Small charts or graphs inside calendar cells; decorative layout. |
| `calendar-lunar` Calendar Lunar | excluded | — | Lunar calendar labels; Zabbix periods are Gregorian. |
| `calendar-pie` Calendar Pie | excluded | — | Small charts or graphs inside calendar cells; decorative layout. |
| `calendar-charts` Calendar Charts | excluded | — | Small charts or graphs inside calendar cells; decorative layout. |

### candlestick

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `candlestick-simple` Basic Candlestick | supported | C07 Candlestick | Open, high, low and close per bucket, derived from history or from explicit items. |
| `custom-ohlc` OHLC Chart | supported | C07 Candlestick | Open, high, low and close per bucket, derived from history or from explicit items. |
| `candlestick-sh` ShangHai Index | supported | C07 Candlestick | Open, high, low and close per bucket, derived from history or from explicit items. |
| `candlestick-large` Large Scale Candlestick | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `candlestick-touch` Axis Pointer Link and Touch | partial | C07 Candlestick | Candles with time zoom; volume bars and brush selection are not drawn. |
| `intraday-breaks-1` Intraday Chart with Breaks | planned | C07 Candlestick | Axis breaks hide part of a value axis; a later presentation option for the column and line charts. (non-trading hours) |
| `intraday-breaks-2` Intraday Chart with Breaks (II) | planned | C07 Candlestick | Axis breaks hide part of a value axis; a later presentation option for the column and line charts. (non-trading hours) |
| `candlestick-brush` Candlestick Brush | partial | C07 Candlestick | Candles with time zoom; volume bars and brush selection are not drawn. |
| `candlestick-sh-2015` ShangHai Index, 2015 | supported | C07 Candlestick | Open, high, low and close per bucket, derived from history or from explicit items. |

### chord

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `chord-simple` Basic Chord | supported | C12 Relationship | Flows between endpoints named by item tags (native chord series). |
| `chord-minAngle` Chord minAngle | supported | C12 Relationship | Flows between endpoints named by item tags (native chord series). |
| `chord-lineStyle-color` Chord lineStyle.color | supported | C12 Relationship | Flows between endpoints named by item tags (native chord series). |
| `chord-style` Chord Style | supported | C12 Relationship | Flows between endpoints named by item tags (native chord series). |

### dataset

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `data-transform-sort-bar` Sort Data in Bar Chart | supported | C17 Ranking Bar | Sorted bars (ranking order, top or bottom N). |
| `dataset-encode0` Simple Encode | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `data-transform-multiple-pie` Partition Data to Pies | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `dataset-default` Default arrangement | supported | C15 Pie | Pie of item values (from a dataset in the example). |
| `dataset-encode1` Encode and Matrix | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `dataset-link` Share Dataset | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `dataset-series-layout-by` Series Layout By Column or Row | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `dataset-simple0` Simple Example of Dataset | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `dataset-simple1` Dataset in Object Array | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |

### heatmap

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `heatmap-cartesian` Heatmap on Cartesian | supported | C06 Heat Map | Values by host, item and time bucket. |
| `heatmap-large` Heatmap - 20K data | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `heatmap-large-piecewise` Heatmap - Discrete Mapping of Color | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `heatmap-bmap` Heatmap on Baidu Map Extension | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |
| `heatmap-map` Air Qulity | extension | — | Density heat over a map needs many points with coordinates; sites come from host inventory, one point per host. |

### line

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `line-simple` Basic Line Chart | supported | C21 Line | Time series of item history. |
| `line-smooth` Smoothed Line Chart | supported | C21 Line | Smoothed lines (smooth). |
| `area-basic` Basic area chart | supported | C22 Area | Filled area. |
| `line-stack` Stacked Line Chart | supported | C22 Area | Stacked lines are drawn as stacked areas (area_mode = stacked). |
| `area-stack` Stacked Area Chart | supported | C22 Area | Stacked lines are drawn as stacked areas (area_mode = stacked). |
| `area-stack-gradient` Gradient Stacked Area Chart | supported | C22 Area | Stacked areas with gradient fill (area_gradient). |
| `bump-chart` Bump Chart (Ranking) | extension | — | Ranks over time (bump chart) need a rank per period, which Zabbix does not store. |
| `line-marker` Temperature Change in the Coming Week | partial | C26 Threshold Band | Thresholds are drawn as bands; min/max/average markers are not. |
| `area-pieces` Area Pieces | supported | C26 Threshold Band | Coloured threshold bands behind the series. |
| `data-transform-filter` Data Transform Filter | excluded | — | Shows the dataset/encode API; the module builds series from items, so there is nothing to expose separately. |
| `line-gradient` Line Gradient | supported | C22 Area | Stacked areas with gradient fill (area_gradient). |
| `line-sections` Distribution of Electricity | supported | C26 Threshold Band | Coloured threshold bands behind the series. |
| `area-simple` Large scale area chart | supported | C21 Line | Time zoom on a long series. |
| `confidence-band` Confidence Band | planned | C21 Line | Confidence band from minimum and maximum items around an average. |
| `grid-multiple` Rainfall vs Evaporation | partial | C21 Line | Both series share one time axis and up to two unit axes rather than separate grids. |
| `line-aqi` Beijing AQI | supported | C26 Threshold Band | Coloured threshold bands behind the series. |
| `multiple-x-axis` Multiple X Axes | partial | C28 Mixed Line and Bar | Two value axes are supported; two time axes are not. |
| `area-rainfall` Rainfall | partial | C21 Line | Both series share one time axis and up to two unit axes rather than separate grids. |
| `area-time-axis` Area Chart with Time Axis | supported | C22 Area | Filled area. |
| `dynamic-data2` Dynamic Data + Time Axis | excluded | — | Simulated live data feed; the module refreshes from Zabbix on the dashboard interval instead. |
| `line-function` Function Plot | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `line-race` Line Race | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `line-markline` Line with Marklines | partial | C26 Threshold Band | Thresholds are drawn as bands; min/max/average markers are not. |
| `line-style` Line Style and Item Style | supported | C21 Line | Time series of item history. |
| `line-in-cartesian-coordinate-system` Line Chart in Cartesian Coordinate System | supported | C21 Line | Time series of item history. |
| `line-log` Log Axis | planned | C21 Line | Logarithmic value axis. |
| `line-step` Step Line | supported | C21 Line | Step modes before, after and middle (line_step), with the held value in the tooltip. |
| `line-easing` Line Easing Visualizing | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `line-fisheye-lens` Fisheye Lens on Line Chart | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `line-y-category` Line Y Category | partial | C01 Column | Horizontal bars over a vertical category axis are offered; a line over it is not. |
| `line-graphic` Custom Graphic Component | excluded | — | Free drawing with graphic elements; not a chart of data. |
| `line-pen` Click to Add Points | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `line-polar` Two Value-Axes in Polar | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `line-polar2` Two Value-Axes in Polar | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `line-tooltip-touch` Tooltip and DataZoom on Mobile | supported | C21 Line | Time zoom on a long series. |
| `line-draggable` Draggable Points | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. (dragging points edits data) |

### pie

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `pie-simple` Referer of a Website | supported | C15 Pie | Share of a total. |
| `pie-borderRadius` Doughnut Chart with Rounded Corner | partial | C03 Doughnut | Doughnut is drawn; rounded corners and padding between slices are not offered. |
| `pie-doughnut` Doughnut Chart | supported | C03 Doughnut | Ring with hole; inner and outer radius settings. |
| `pie-half-donut` Half Doughnut Chart | planned | C03 Doughnut | Half doughnut: start and end angle settings. |
| `pie-padAngle` Pie with padAngle | partial | C03 Doughnut | Doughnut is drawn; rounded corners and padding between slices are not offered. |
| `pie-custom` Customized Pie | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `pie-pattern` Texture on Pie Chart | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. (patterned slices) |
| `pie-roseType` Nightingale Chart | supported | C15 Pie / C03 Doughnut | Rose layout by radius or area (pie_rose). |
| `pie-roseType-simple` Nightingale Chart | supported | C15 Pie / C03 Doughnut | Rose layout by radius or area (pie_rose). |
| `pie-alignTo` Pie Label Align | supported | C15 Pie | Share of a total. |
| `pie-labelLine-adjust` Label Line Adjust | supported | C15 Pie | Share of a total. |
| `pie-legend` Pie with Scrollable Legend | supported | C15 Pie | Share of a total. |
| `pie-rich-text` Pie Special Label | partial | C15 Pie | Slices are drawn; rich-text label styling is not offered. |
| `pie-nest` Nested Pies | planned | C15 Pie | Nested rings (two levels of a total); C19 Sunburst covers hierarchies today. |

### radar

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `radar` Basic Radar Chart | supported | C05 Radar | Several metrics per host on shared or per-dimension scales. |
| `radar-aqi` AQI - Radar Chart | supported | C05 Radar | Several metrics per host on shared or per-dimension scales. |
| `radar-custom` Customized Radar Chart | excluded | — | Depends on arbitrary JavaScript in the option (formatters, render callbacks or event code); the module never accepts user code. |
| `radar2` Proportion of Browsers | supported | C05 Radar | Several metrics per host on shared or per-dimension scales. |
| `radar-multiple` Multiple Radar | supported | C05 Radar | Several metrics per host on shared or per-dimension scales. |

### sankey

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `sankey-simple` Basic Sankey | supported | C31 Sankey | Flows between endpoints named by item tags; cycles and negative flows refused. |
| `sankey-vertical` Sankey Orient Vertical | supported | C31 Sankey | Vertical orientation (sankey_orient). |
| `sankey-itemstyle` Specify ItemStyle for Each Node in Sankey | partial | C31 Sankey | Flows are drawn; per-node and per-level colours are not configurable. |
| `sankey-levels` Sankey with Levels Setting | partial | C31 Sankey | Flows are drawn; per-node and per-level colours are not configurable. |
| `sankey-energy` Gradient Edge | supported | C31 Sankey | Flows between endpoints named by item tags; cycles and negative flows refused. |
| `sankey-nodeAlign-left` Node Align Left in Sankey | supported | C31 Sankey | Node alignment left, right or justified (sankey_align). |
| `sankey-nodeAlign-right` Node Align Right in Sankey | supported | C31 Sankey | Node alignment left, right or justified (sankey_align). |

### scatter

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `scatter-simple` Basic Scatter Chart | supported | C08 Bubble | Plain XY scatter of paired items (bubble_size = none). |
| `scatter-anscombe-quartet` Anscomb's quartet | partial | C08 Bubble | Small multiples of XY pairs are drawn as separate widgets, not one grid. |
| `scatter-clustering` Clustering Process | excluded | — | Clustering with ecStat; the module does not compute models from monitoring data. |
| `scatter-clustering-process` Clustering Process | excluded | — | Clustering with ecStat; the module does not compute models from monitoring data. |
| `scatter-exponential-regression` Exponential Regression | excluded | — | Fits a regression line with ecStat; the module does not compute models from monitoring data. |
| `scatter-effect` Effect Scatter Chart | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `scatter-linear-regression` Linear Regression | excluded | — | Fits a regression line with ecStat; the module does not compute models from monitoring data. |
| `scatter-polynomial-regression` Polynomial Regression | excluded | — | Fits a regression line with ecStat; the module does not compute models from monitoring data. |
| `scatter-jitter` Scatter with Jittering | planned | C29 Distribution | Strip (jitter) plot of every sample next to the box plot. |
| `scatter-punchCard` Punch Card of Github | partial | C06 Heat Map | Hour-of-day by day punch card is a heat map of time buckets; circle sizes are not offered. |
| `scatter-single-axis` Scatter on Single Axis | planned | C24 State Timeline | Events on a single time axis (problem events). |
| `scatter-weight` Distribution of Height and Weight | supported | C08 Bubble | Bubble size from a third item. |
| `scatter-aggregate-bar` Aggregate Scatter to Bar | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `scatter-label-align-right` Align Label on the Top | supported | C08 Bubble | Plain XY scatter of paired items (bubble_size = none). |
| `scatter-label-align-top` Align Label on the Top | supported | C08 Bubble | Plain XY scatter of paired items (bubble_size = none). |
| `scatter-symbol-morph` Symbol Shape Morph | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `scatter-large` Large Scatter | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `scatter-nebula` Scatter Nebula | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `scatter-stream-visual` Visual interaction with stream | excluded | — | Shows rendering of very large synthetic datasets; the module caps series and samples (retrieval budgets) instead. |
| `bubble-gradient` Bubble Chart | supported | C08 Bubble | Bubble size from a third item. |
| `scatter-aqi-color` Scatter Aqi Color | partial | C08 Bubble | Points are current values of paired items; colour by a fourth value (visual map) is not offered. |
| `scatter-nutrients` Scatter Nutrients | partial | C08 Bubble | Points are current values of paired items; colour by a fourth value (visual map) is not offered. |
| `scatter-nutrients-matrix` Scatter Nutrients Matrix | partial | C30 Parallel Coordinates | Metrics per entity on parallel axes; the nutrient scatter matrix is not drawn. |
| `scatter-polar-punchCard` Punch Card of Github | excluded | — | Bars or lines in polar coordinates; the same data is clearer on the cartesian charts the module offers. |
| `scatter-life-expectancy-timeline` Life Expectancy and GDP | excluded | — | Steps through several datasets with a timeline player; Zabbix data is one period per refresh. |
| `scatter-painter-choice` Master Painter Color Choices Throughout History | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `effectScatter-bmap` Air Quality - Baidu Map | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |
| `scatter-world-population` World Population (2011) | partial | C08 Bubble | Points are current values of paired items; colour by a fourth value (visual map) is not offered. |
| `scatter-logarithmic-regression` Logarithmic Regression | excluded | — | Fits a regression line with ecStat; the module does not compute models from monitoring data. |
| `effectScatter-map` Air Quality | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. (ripple effect on points) |
| `scatter-map` Air Quality | supported | C32 Geographic Site Map | Sites at inventory latitude and longitude over the bundled outline. |
| `scatter-map-brush` Scatter Map Brush | excluded | — | Brush selection across charts; selection is for analysis tools rather than a dashboard widget. |
| `scatter-weibo` Sign in of weibo | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |

### gauge

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `gauge` Gauge Basic chart | supported | C16 Gauge | Dial with threshold-coloured rim, needle and target mark (gauge_style = dial). |
| `gauge-simple` Simple Gauge | supported | C16 Gauge | Dial with threshold-coloured rim, needle and target mark (gauge_style = dial). |
| `gauge-speed` Speed Gauge | supported | C16 Gauge | Dial with threshold-coloured rim, needle and target mark (gauge_style = dial). |
| `gauge-progress` Progress Gauge | supported | C16 Gauge | Progress arc (gauge_style = progress). |
| `gauge-stage` Stage Speed Gauge | supported | C16 Gauge | Dial with threshold-coloured rim, needle and target mark (gauge_style = dial). |
| `gauge-grade` Grade Gauge | supported | C16 Gauge | Dial with threshold-coloured rim, needle and target mark (gauge_style = dial). |
| `gauge-multi-title` Multi Title Gauge | supported | C16 Gauge | Several gauges in one widget, one per item, laid out for the widget shape. |
| `gauge-temperature` Temperature Gauge chart | supported | C16 Gauge | Level tube (gauge_style = level), the original presentation. |
| `gauge-ring` Ring Gauge | supported | C16 Gauge | Full ring (gauge_style = ring). |
| `gauge-barometer` Gauge Barometer chart | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. (clock, barometer and car dashboard skins) |
| `gauge-clock` Clock | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. (clock, barometer and car dashboard skins) |
| `gauge-car` Gauge Car | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. (clock, barometer and car dashboard skins) |

### graph

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `graph-force2` Force Layout | supported | C11 Network | Force layout (network_layout = force); dragged nodes and zoom kept across refreshes. |
| `graph-grid` Graph on Cartesian | supported | C11 Network | Fixed positions written by the user (network_layout = fixed). |
| `graph-simple` Simple Graph | supported | C11 Network | Fixed positions written by the user (network_layout = fixed). |
| `graph-force` Force Layout | supported | C11 Network | Force layout (network_layout = force); dragged nodes and zoom kept across refreshes. |
| `graph-label-overlap` Hide Overlapped Label | supported | C11 Network | Categories coloured by host group or host tag (node_category), with labels toggled. |
| `graph` Les Miserables | supported | C11 Network | Categories coloured by host group or host tag (node_category), with labels toggled. |
| `graph-circular-layout` Les Miserables | supported | C11 Network | Circular layout (network_layout = circular). |
| `graph-force-dynamic` Graph Dynamic | excluded | — | Simulated live data feed; the module refreshes from Zabbix on the dashboard interval instead. |
| `graph-life-expectancy` Graph Life Expectancy | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `graph-webkit-dep` Graph Webkit Dep | supported | C11 Network | Force layout (network_layout = force); dragged nodes and zoom kept across refreshes. |
| `graph-npm` NPM Dependencies | supported | C11 Network | Force layout (network_layout = force); dragged nodes and zoom kept across refreshes. |

### matrix

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `matrix-simple` Simple Matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-correlation-heatmap` Correlation Matrix (Heatmap) | extension | — | Correlation and covariance matrices need statistics computed across items over a period. |
| `matrix-correlation-scatter` Correlation Matrix (Scatter) | extension | — | Correlation and covariance matrices need statistics computed across items over a period. |
| `matrix-covariance` Covariance Matrix | extension | — | Correlation and covariance matrices need statistics computed across items over a period. |
| `matrix-graph` Graph Chart in Matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-pie` Pie Charts in Matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-confusion` Confusion Matrix | supported | C23 Status Matrix | Cells coloured by value, threshold or severity per host and item. |
| `matrix-grid-layout` Responsive grid layout based on matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-stock` Matrix Stock Application | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-sparkline` Mini Line Charts (Sparkline) in Matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-mini-bar-geo` Mini Bars and Geo in Matrix | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |
| `matrix-periodic-table` Periodic Table | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `matrix-mbti` MBTI Partner Compatibility | excluded | — | Draws generated or decorative data, not measurements; nothing to map to Zabbix items. |
| `matrix-mini-bar-data-collection` Matrix Header Data Collection (Mini Bar) | planned | — | Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option. |

### parallel

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `parallel-simple` Basic Parallel | supported | C30 Parallel Coordinates | One axis per metric, one line per host or tag value; axis ranges fixed or automatic. |
| `parallel-aqi` Parallel Aqi | supported | C30 Parallel Coordinates | One axis per metric, one line per host or tag value; axis ranges fixed or automatic. |
| `parallel-nutrients` Parallel Nutrients | supported | C30 Parallel Coordinates | One axis per metric, one line per host or tag value; axis ranges fixed or automatic. |
| `scatter-matrix` Scatter Matrix | partial | C30 Parallel Coordinates | The parallel axes are drawn; the linked scatter matrix is not. |

### sunburst

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `sunburst-simple` Basic Sunburst | supported | C19 Sunburst | Hierarchy by host group, host and item path. |
| `sunburst-borderRadius` Sunburst with Rounded Corner | partial | C19 Sunburst | Hierarchy is drawn; corner rounding, monochrome and visual-map colour are not configurable. |
| `sunburst-label-rotate` Sunburst Label Rotate | supported | C19 Sunburst | Hierarchy by host group, host and item path. |
| `sunburst-monochrome` Monochrome Sunburst | partial | C19 Sunburst | Hierarchy is drawn; corner rounding, monochrome and visual-map colour are not configurable. |
| `sunburst-visualMap` Sunburst VisualMap | partial | C19 Sunburst | Hierarchy is drawn; corner rounding, monochrome and visual-map colour are not configurable. |
| `sunburst-drink` Drink Flavors | supported | C19 Sunburst | Hierarchy by host group, host and item path. |
| `sunburst-book` Book Records | supported | C19 Sunburst | Hierarchy by host group, host and item path. |

### map

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `geo-graph` Geo Graph | partial | C32 Geographic Site Map | Sites and links over a map; a graph series on the map is not used. |
| `geo-choropleth-scatter` Geo Choropleth and Scatter | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `map-iceland-pie` Pie Charts on GEO Map | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `geo-beef-cuts` GEO Beef Cuts | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-organ` Organ Data with SVG | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-seatmap-flight` Flight Seatmap with SVG | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-svg-lines` GEO SVG Lines | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-svg-map` GEO SVG Map | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-svg-scatter-simple` GEO SVG Scatter | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `geo-svg-traffic` GEO SVG Traffic | extension | — | Draws on an SVG picture used as a map (floor plan, seat map, organ); needs a user-supplied picture and coordinates in it. |
| `lines-airline` 65k+ Airline | supported | C32 Geographic Site Map | Many links between sites over the bundled world outline. |
| `lines-ny` Use lines to draw 1 million New York streets | partial | C32 Geographic Site Map | Links are drawn between sites; polylines along a route are not. |
| `map-bar-morph` Morphing between Map and Bar | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `map-HK` Population Density of HongKong (2011) | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `map-usa` USA Population Estimates (2012) | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `map-usa-projection` USA Choropleth Map with Projection | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `geo-lines` Migration | supported | C32 Geographic Site Map | Lines between sites (geo_links) with widths from a weight item. |
| `geo-map-scatter` map and scatter share a geo | supported | C32 Geographic Site Map | Sites at inventory latitude and longitude over the bundled outline. |
| `lines-bmap` A Hiking Trail in Hangzhou - Baidu Map | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |
| `lines-bmap-bus` Bus Lines of Beijing - Baidu Map | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |
| `lines-bmap-effect` Bus Lines of Beijing - Line Effect | excluded | — | Needs an external map service (Baidu Maps); the module fetches nothing from map providers. |
| `map-bin` Binning on Map | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |
| `map-polygon` Draw Polygon on Map | extension | — | Fills named regions (countries, states, districts) from values; needs a mapping from items to region names and a region map file. |

### boxplot

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `data-transform-aggregate` Data Transform Simple Aggregate | supported | C29 Distribution | Five-number summary with Tukey outliers from raw history (never trends). |
| `boxplot-light-velocity` Boxplot Light Velocity | supported | C29 Distribution | Five-number summary with Tukey outliers from raw history (never trends). |
| `boxplot-light-velocity2` Boxplot Light Velocity2 | supported | C29 Distribution | Five-number summary with Tukey outliers from raw history (never trends). |
| `boxplot-multi` Multiple Categories | supported | C29 Distribution | Five-number summary with Tukey outliers from raw history (never trends). |

### pictorialBar

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `pictorialBar-bar-transition` Transition between pictorialBar and bar | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-body-fill` Water Content | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-dotted` Dotted bar | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-forest` Expansion of forest | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-hill` Wish List and Mountain Height | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-spirit` Spirits | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-vehicle` Vehicles | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |
| `pictorialBar-velocity` Velocity of Christmas Reindeers | excluded | — | Pictorial bars made of pictures; decorative, and pictures add nothing to a measured value. |

### treemap

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `treemap-sunburst-transition` Transition between Treemap and Sunburst | excluded | — | Animation or transition demo; a monitoring widget redraws on refresh and gains nothing from it. |
| `treemap-disk` Disk Usage | supported | C18 Treemap | Sizes by hierarchy with colour from a second item. |
| `treemap-drill-down` ECharts Option Query | supported | C18 Treemap | Navigates into levels by clicking. |
| `treemap-obama` How $3.7 Trillion is Spent | supported | C18 Treemap | Navigates into levels by clicking. |
| `treemap-show-parent` Show Parent Labels | supported | C18 Treemap | Sizes by hierarchy with colour from a second item. |
| `treemap-simple` Basic Treemap | supported | C18 Treemap | Sizes by hierarchy with colour from a second item. |
| `treemap-visual` Gradient Mapping | supported | C18 Treemap | Sizes by hierarchy with colour from a second item. |

### graphic

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `graphic-stroke-animation` Stroke Animation | excluded | — | Free drawing with graphic elements; not a chart of data. |
| `graphic-loading` Customized Loading Animation | excluded | — | Free drawing with graphic elements; not a chart of data. |
| `graphic-wave-animation` Wave Animation | excluded | — | Free drawing with graphic elements; not a chart of data. |

### (none)

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `calendar-effectscatter` calendar-effectscatter | excluded | — | Small charts or graphs inside calendar cells; decorative layout. |

### funnel

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `funnel` Funnel Chart | supported | C20 Funnel | Stages from named items with percentages of the first and previous stage. |
| `funnel-align` Funnel Compare | supported | C20 Funnel | Stages from named items with percentages of the first and previous stage. |
| `funnel-customize` Customized Funnel | partial | C20 Funnel | One funnel per widget; overlaid or several funnels are not offered. |
| `funnel-mutiple` Multiple Funnels | partial | C20 Funnel | One funnel per widget; overlaid or several funnels are not offered. |

### themeRiver

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `themeRiver-basic` ThemeRiver | excluded | C22 Area | Stream graph; the stacked area chart (C22) shows the same series with readable values. |
| `themeRiver-lastfm` ThemeRiver Lastfm | excluded | C22 Area | Stream graph; the stacked area chart (C22) shows the same series with readable values. |

### tree

| Example | Class | Module chart | Reason |
| --- | --- | --- | --- |
| `tree-basic` From Left to Right Tree | supported | C10 Tree | Left-to-right, right-to-left, top-down, bottom-up and radial layouts (tree_layout). |
| `tree-legend` Multiple Trees | partial | C10 Tree | Trees are drawn; elbow (polyline) edges and a legend of several trees are not offered. |
| `tree-orient-bottom-top` From Bottom to Top Tree | supported | C10 Tree | Left-to-right, right-to-left, top-down, bottom-up and radial layouts (tree_layout). |
| `tree-orient-right-left` From Right to Left Tree | supported | C10 Tree | Left-to-right, right-to-left, top-down, bottom-up and radial layouts (tree_layout). |
| `tree-polyline` Tree with Polyline Edge | partial | C10 Tree | Trees are drawn; elbow (polyline) edges and a legend of several trees are not offered. |
| `tree-radial` Radial Tree | supported | C10 Tree | Left-to-right, right-to-left, top-down, bottom-up and radial layouts (tree_layout). |
| `tree-vertical` From Top to Bottom Tree | supported | C10 Tree | Left-to-right, right-to-left, top-down, bottom-up and radial layouts (tree_layout). |

## Following up

The planned examples, in the order they would help most:

- `matrix-simple` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `pie-half-donut` (C03 Doughnut): Half doughnut: start and end angle settings.
- `custom-error-scatter` (C21 Line): Error bars from minimum and maximum items.
- `matrix-graph` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `matrix-pie` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `bar-breaks-simple` (C01 Column / C21 Line): Axis breaks hide part of a value axis; a later presentation option for the column and line charts.
- `custom-error-bar` (C21 Line): Error bars from minimum and maximum items.
- `matrix-grid-layout` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `matrix-stock` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `scatter-jitter` (C29 Distribution): Strip (jitter) plot of every sample next to the box plot.
- `scatter-single-axis` (C24 State Timeline): Events on a single time axis (problem events).
- `confidence-band` (C21 Line): Confidence band from minimum and maximum items around an average.
- `intraday-breaks-1` (C07 Candlestick): Axis breaks hide part of a value axis; a later presentation option for the column and line charts. (non-trading hours)
- `intraday-breaks-2` (C07 Candlestick): Axis breaks hide part of a value axis; a later presentation option for the column and line charts. (non-trading hours)
- `matrix-sparkline` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `pie-nest` (C15 Pie): Nested rings (two levels of a total); C19 Sunburst covers hierarchies today.
- `matrix-mini-bar-geo` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
- `line-log` (C21 Line): Logarithmic value axis.
- `matrix-mini-bar-data-collection` (—): Matrix coordinate system (ECharts 6) laying out cells or small charts in a grid; a candidate for a later layout option.
