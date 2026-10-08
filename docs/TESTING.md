# Testing

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | Step modes and the held value under the pointer, bar buckets across daylight-saving changes, quantiles, box statistics and histogram bins, edge weights, fixed node positions, parallel axes, waterfall steps and running totals, units and formatting, normalisation, aggregation (including trend weighting), OHLC, calendar days across time zones, pairing, hierarchy, edges, relationships, radar scales, value maps, row identity and table building, thresholds and macro resolution, hierarchy levels, funnel stages, gaps, nearest-sample lookup, stacking alignment, state segments, the registry, axis ranges, switch port identity, joining, ambiguity, layouts (24 one-row, 24 and 48 two-row, gaps, blocks, stacks, groups, 128 ports), interface types, speed buckets and custom colours, statuses, admin down, thresholds, severity, staleness and links. |
| Contracts | `npm test` | Each of C01-C27 with valid data, invalid values, missing roles, mixed units, empty data, extreme numbers and negatives. C28-C33 and the new presentations: opposing items for diverging bars, shares only of additive non-negative values, fixed positions and weight items for the network, tag peers never named, at most two units and whole-hour bars over trends for mixed charts, distributions refused over trends, axis definitions, Sankey cycles and negative flows, sites without coordinates, one item per site for threshold colours, waterfall steps and unexplained levels. |
| Renderers | `npm test` | Column grouping by identity, gaps, label disambiguation, escaping; the transformations behind C02-C26 (including time-series gaps, tooltips, stacking, bands, state lanes, the status matrix and sparkline tiles); HTML charts (C14, C23, C25, C27) drawn in jsdom, including the switch panel's arrangement, escaped tooltip, ARIA labels, keyboard navigation, links, legend and 128 ports in both themes; every chart's sample payload rendered through the module's own ECharts build (server-side SVG) in light and dark themes with no ECharts warnings; every new presentation (stepped lines, horizontal columns, percentage and diverging stacks, rose pies, XY scatter, dial, progress and ring gauges, network and tree layouts, histograms, vertical Sankey, map without a base) passing its contract and rendering without warnings. |
| UI and configuration | `npm test` | Chart controller lifecycle and error display (jsdom), dragged network positions read back before a refresh, edit-form visibility for every chart, including the Switch Port Panel's conditional sections and the settings each new presentation needs. |
| Stored values | `npm test` | No chart form value or enum index in `tests/fixtures/stored-values.json` changes. |
| Security | `npm test` | No eval, `new Function`, network calls or markup strings in the module's own browser code, no outgoing requests from its PHP. |
| Performance budgets | `npm test` | LLD table, Status Matrix, State Timeline, Sparkline Grid and Switch Port Panel at the server's item limit within 1.5 s each in jsdom, drawing everything. |
| Registry parity | `npm test` (needs PHP) | `ChartRegistry.php` and `src/registry` make the same decisions (roles, visible and required controls, history, time period) for every chart under every setting. |
| Server logic | `npm test` (needs PHP) | `DataProvider.php` against a stand-in API: user macros through nested templates in Zabbix's order and only from settings that are shown, which parts of a period are read from trends or history, item limits and update intervals, and one item lookup per Switch Port Panel role however many ports match; distributions planned from raw history only; history ordered by clock and nanoseconds; map files read by plain name only, refusing paths, missing files and GeoJSON that is not a feature collection. |
| Isolation (bundle) | `npm test` | Distinct identifiers, only two new globals, `window.echarts` untouched, scoped CSS. |
| Browser | `npm run build && npm run test:browser` | Built bundle in Chromium: draws, reuses the instance, shows errors, disposes, leaves a foreign ECharts alone, and paints every chart from its sample payload and every presentation variant (`SAMPLES` and `VARIANTS` in `tests/fixtures/samples.js`). The Switch Port Panel is also drawn small, wide and dark, checking port 1 top-left, port 2 beneath it, port 3 to its right and the tooltip inside the window. Set `SCREENSHOT_DIR` to save one PNG per chart. |
| Zabbix integration | CI workflow `Zabbix integration` | Zabbix 7.0, 7.2 and 7.4 in Docker. The test creates hosts and pushes values, then opens a dashboard holding a Column widget, and a misconfigured Bubble widget. The hosts are linked to a two-level template stack that defines a bullet target macro. A second dashboard holds one configured widget for each of the 33 charts, plus a bullet whose target is that macro, a dial gauge, a force-layout network and a histogram; the test hosts carry inventory locations for the Geographic Site Map; the Switch Port Panel draws a 14-port switch built from tagged interface items, and its arrangement, admin-down label, link and tooltip are checked. A Temporal Line without its own period must follow the dashboard's time selector and refresh when it changes. A user who may read only the test hosts opens a shared dashboard and must see neither the switch's ports nor its name. The run fails on uncaught exceptions, unhandled promise rejections, console errors, ECharts warnings, and widget actions that answer with an HTTP error, a PHP message or an unexpected error. Screenshots are uploaded as artifacts, including one of every chart and one of its edit form under `showcase/`. |

To run the integration test locally (needs Docker and Node 22+):

```sh
npm ci && npm run build && npx playwright install chromium
export ZABBIX_TAG=alpine-7.0-latest
export POSTGRES_PASSWORD=$(openssl rand -hex 24) ZW_ADMIN_PASSWORD=$(openssl rand -hex 24)
docker compose -f tests/integration/docker-compose.yml up -d
tests/integration/install-modules.sh
node tests/integration/smoke.mjs
```

No password is stored in the repository. The database password comes from `POSTGRES_PASSWORD`. The test signs in once with the image's first-login Admin password and replaces it with `ZW_ADMIN_PASSWORD` (or a random one when unset), and the read-only test user gets a new random password on every run. To run the test again against the same containers, keep the same `ZW_ADMIN_PASSWORD`.

The widgets for C28-C33 and the new presentations were added to the integration test with this release; until the workflow has run on them, they are checked by the tests above only.

## Still manual

- Template dashboards with an override host.
- High-contrast themes.
- The Geographic Site Map with real inventory coordinates and an administrator's map file on a live frontend.
- Dashboards with many widgets, for performance.
