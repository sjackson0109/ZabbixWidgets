# Testing

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | Units and formatting, normalisation, aggregation (including trend weighting), OHLC, calendar days across time zones, pairing, hierarchy, edges, relationships, radar scales, the registry. |
| Contracts | `npm test` | Each of C01-C13 with valid data, invalid values, missing roles, mixed units, empty data, extreme numbers and negatives. |
| Renderers | `npm test` | Column grouping by identity, gaps, label disambiguation, escaping. |
| UI | `npm test` | Chart controller lifecycle and error display (jsdom), edit-form visibility. |
| Coexistence (bundle) | `npm test` | Distinct identifiers, only two new globals, `window.echarts` untouched, scoped CSS. |
| Browser | `npm run build && npm run test:browser` | Built bundle in Chromium: draws, reuses the instance, shows errors, disposes, leaves a foreign ECharts alone. |

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
