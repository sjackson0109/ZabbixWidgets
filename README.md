# ZabbixWidgets

Independent Zabbix dashboard widgets built on Apache ECharts.

> **Status: foundation, not yet released.** The chart registry, data contracts, validation and data layer cover all 13 planned charts. Only **C01 Vertical Column** has a renderer so far; the others report "not available in this version yet". The remaining renderers will follow once Column is confirmed working on Zabbix 7.0, 7.2 and 7.4.


## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Chart contracts](docs/CHART-CONTRACTS.md)
- [Testing](docs/TESTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Development

```sh
npm ci
npm run check   # lint (JS and PHP), tests, build, browser test, docs, licences, provenance
npm run package # release zip in dist/ (needs LICENSE)
```

The licence will be MIT once the copyright holder is confirmed.
