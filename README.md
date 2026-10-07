# ZabbixWidgets

Independent Zabbix dashboard widgets built on Apache ECharts.

> **Status: early draft, not ready to install.** This branch holds the Phase 0-2 foundation (module identity, chart registry, data contracts, validation, data layer, PHP module skeleton and the first renderer). The remaining renderers, CI, licence and provenance documents are still to come.


## Development

```sh
npm ci
npm test        # unit, contract, renderer and UI tests
npm run lint
npm run build   # writes modules/extended-charts/assets/js/zabbixwidgets-charts.js
```

The licence will be MIT once the copyright holder is confirmed.
