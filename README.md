# ZabbixWidgets

Independent Zabbix dashboard widgets built on Apache ECharts.

26 charts (C01-C26) have renderers and are tested against Zabbix 7.0, 7.2 and 7.4. The widgets only read what Zabbix already holds (hosts, items, latest values, history, trends, tags, macros, value maps, triggers and problems); they never collect data or infer topology. See [chart contracts](docs/CHART-CONTRACTS.md) for what each chart needs.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Chart contracts](docs/CHART-CONTRACTS.md)
- [Testing](docs/TESTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Development

```sh
npm ci
npm run check   # lint (JS and PHP), tests, build, browser test, docs, licences
npm run package # release zip in dist/
```

Released under the MIT licence, see [LICENSE](LICENSE).
