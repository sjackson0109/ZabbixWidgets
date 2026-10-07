# Testing

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | Units and formatting, normalisation, aggregation (including trend weighting), OHLC, calendar days across time zones, pairing, hierarchy, edges, relationships, radar scales, value maps, row identity and table building, thresholds and macro resolution, hierarchy levels, funnel stages, gaps, nearest-sample lookup, stacking alignment, state segments, the registry, axis ranges, switch port identity, joining, ambiguity, layouts (24 one-row, 24 and 48 two-row, gaps, blocks, stacks, groups, 128 ports), interface types, speed buckets and custom colours, statuses, admin down, thresholds, severity, staleness and links. |
| Contracts | `npm test` | Each of C01-C27 with valid data, invalid values, missing roles, mixed units, empty data, extreme numbers and negatives. |
| Renderers | `npm test` | Column grouping by identity, gaps, label disambiguation, escaping; the transformations behind C02-C26 (including time-series gaps, tooltips, stacking, bands, state lanes, the status matrix and sparkline tiles); HTML charts (C14, C23, C25, C27) drawn in jsdom, including the switch panel's arrangement, escaped tooltip, ARIA labels, keyboard navigation, links, legend and 128 ports in both themes; every chart's sample payload rendered through the module's own ECharts build (server-side SVG) in light and dark themes with no ECharts warnings. |
| UI and configuration | `npm test` | Chart controller lifecycle and error display (jsdom), edit-form visibility for every chart, including the Switch Port Panel's conditional sections. |
| Stored values | `npm test` | No chart form value or enum index in `tests/fixtures/stored-values.json` changes. |
| Security | `npm test` | No eval, `new Function`, network calls or markup strings in the module's own browser code, no outgoing requests from its PHP. |
| Performance budgets | `npm test` | LLD table, Status Matrix, State Timeline, Sparkline Grid and Switch Port Panel at the server's item limit within 1.5 s each in jsdom, drawing everything. |
| Registry parity | `npm test` (needs PHP) | `ChartRegistry.php` and `src/registry` make the same decisions (roles, visible and required controls, history, time period) for every chart under every setting. |
| Server logic | `npm test` (needs PHP) | `DataProvider.php` against a stand-in API: user macros through nested templates in Zabbix's order and only from settings that are shown, which parts of a period are read from trends or history, item limits and update intervals, and one item lookup per Switch Port Panel role however many ports match. |
| Isolation (bundle) | `npm test` | Distinct identifiers, only two new globals, `window.echarts` untouched, scoped CSS. |
| Browser | `npm run build && npm run test:browser` | Built bundle in Chromium: draws, reuses the instance, shows errors, disposes, leaves a foreign ECharts alone, and paints every chart from its sample payload (`tests/fixtures/samples.js`). The Switch Port Panel is also drawn small, wide and dark, checking port 1 top-left, port 2 beneath it, port 3 to its right and the tooltip inside the window. Set `SCREENSHOT_DIR` to save one PNG per chart. |
| Zabbix integration | CI workflow `Zabbix integration` | Zabbix 7.0, 7.2 and 7.4 in Docker. The test creates hosts and pushes values, then opens a dashboard holding a Column widget, and a misconfigured Bubble widget. The hosts are linked to a two-level template stack that defines a bullet target macro. A second dashboard holds one configured widget for each of the 27 charts, plus a bullet whose target is that macro; the Switch Port Panel draws a 14-port switch built from tagged interface items, and its arrangement, admin-down label, link and tooltip are checked. A Temporal Line without its own period must follow the dashboard's time selector and refresh when it changes. A user who may read only the test hosts opens a shared dashboard and must see neither the switch's ports nor its name. The run fails on uncaught exceptions, unhandled promise rejections, console errors, ECharts warnings, and widget actions that answer with an HTTP error, a PHP message or an unexpected error. Screenshots are uploaded as artifacts, including one of every chart and one of its edit form under `showcase/`. |

To run the integration test locally (needs Docker and Node 22+):

```sh
npm ci && npm run build && npx playwright install chromium
export ZABBIX_TAG=alpine-7.0-latest
docker compose -f tests/integration/docker-compose.yml up -d
tests/integration/install-modules.sh
node tests/integration/smoke.mjs
```

## Still manual

- Template dashboards with an override host.
- High-contrast themes.
- Dashboards with many widgets, for performance.
