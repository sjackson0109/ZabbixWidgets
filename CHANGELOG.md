# Changelog

## Unreleased

- Independent foundation: module identity distinct from the Monzphere ECharts module, a chart capability registry with contracts for C01-C13, a data layer, validation with user-facing messages, a PHP data provider with a shared read budget, a private ECharts 6.1.0 bundle, an edit form that adapts to the chart, and the C01 Column renderer.
- Renderers for C02-C13: Stacked Bar, Doughnut, Bullet Graph, Radar, Heat Map, Candlestick / OHLC, Bubble, Gantt, Tree Diagram, Network, Chord / Relationship (native ECharts chord series) and Calendar Heat Map. New checks: bullet ranges, bullet and heat map units, distinct heat map axes, at most 1000 buckets or candles, and Gantt progress from 0 to 100%.
- Source-similarity review against the reference fork and Monzphere in CI, with reviewed matches documented in PROVENANCE.md. The Gantt bar drawing was rewritten so that it no longer follows the shape of the reference.
- CI checks that a rebuilt release package is byte-identical.
- Tooling: lint (JavaScript and PHP), unit, contract, UI, browser and Zabbix integration tests, licence inventory, provenance audit and a reproducible package build.
