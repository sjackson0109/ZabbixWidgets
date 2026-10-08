# Third-party notices

ZabbixWidgets bundles the following packages into
`modules/extended-charts/assets/js/zabbixwidgets-charts.js`. Each keeps its own
licence; the full licence texts ship in the release package under `licenses/`.
`npm run licences` checks this list against `package-lock.json`.

| Package | Licence | Source |
|---|---|---|
| echarts 6.1.0 | Apache-2.0 | https://echarts.apache.org/ , npm package `echarts` |
| zrender 6.1.0 | BSD-3-Clause | https://github.com/ecomfe/zrender , npm package `zrender` (ECharts rendering engine) |
| tslib 2.3.0 | 0BSD | https://github.com/microsoft/tslib , npm package `tslib` (ECharts runtime helper) |

## Apache ECharts NOTICE

Apache ECharts
Copyright 2017-2026 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (https://www.apache.org/).

The full NOTICE file is distributed as `licenses/echarts/NOTICE` in the release package.

## Natural Earth

The world land outline drawn by the Geographic Site Map,
`src/data/geo/world-land.js`, is derived from Natural Earth's 1:110m land
polygons (`ne_110m_land.geojson` from the natural-earth-vector repository),
with coordinates rounded to two decimal places by `scripts/world-land.mjs`.
Natural Earth data is in the public domain (naturalearthdata.com). No
attribution is required; it is given here for provenance.

Development-only tools (esbuild, ESLint, Vitest, jsdom) are not redistributed.
