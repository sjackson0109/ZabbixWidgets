# ZabbixWidgets

Independent Zabbix dashboard widgets built on Apache ECharts.

> **Status: not yet released.** All 13 charts (C01-C13) have renderers and are tested against Zabbix 7.0, 7.2 and 7.4. See [chart contracts](docs/CHART-CONTRACTS.md) for what each chart needs.


## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Chart contracts](docs/CHART-CONTRACTS.md)
- [Testing](docs/TESTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Development

```sh
npm ci
npm run check   # lint (JS and PHP), tests, build, browser test, docs, licences, provenance
npm run package # release zip in dist/
```

Released under the MIT licence, see [LICENSE](LICENSE).
