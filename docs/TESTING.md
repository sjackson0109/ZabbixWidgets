# Testing

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | Units and formatting, normalisation, aggregation (including trend weighting), OHLC, calendar days across time zones, pairing, hierarchy, edges, relationships, radar scales, the registry. |
| Contracts | `npm test` | Each of C01-C13 with valid data, invalid values, missing roles, mixed units, empty data, extreme numbers and negatives. |
| Renderers | `npm test` | Column grouping by identity, gaps, label disambiguation, escaping; the transformations behind C02-C13; every chart's sample payload rendered through the module's own ECharts build (server-side SVG) in light and dark themes with no ECharts warnings. |
| UI | `npm test` | Chart controller lifecycle and error display (jsdom), edit-form visibility. |
| Isolation (bundle) | `npm test` | Distinct identifiers, only two new globals, `window.echarts` untouched, scoped CSS. |
| Browser | `npm run build && npm run test:browser` | Built bundle in Chromium: draws, reuses the instance, shows errors, disposes, leaves a foreign ECharts alone, and paints every chart from its sample payload (`tests/fixtures/samples.js`). Set `SCREENSHOT_DIR` to save one PNG per chart. |
| Zabbix integration | CI workflow `Zabbix integration` | Zabbix 7.0, 7.2 and 7.4 in Docker. The test creates hosts and pushes values, then opens a dashboard holding a Column widget, and a misconfigured Bubble widget. A second dashboard holds one configured widget for each of the 13 charts. It checks the Column chart draws, the Bubble widget explains what is missing, every chart type draws from Zabbix data, the edit form hides unrelated fields, and the page raises no errors. Screenshots are uploaded as artifacts. |

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
