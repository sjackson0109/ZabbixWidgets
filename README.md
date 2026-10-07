# ZabbixWidgets

Independent Zabbix dashboard widgets built on Apache ECharts.

27 charts (C01-C27) have renderers and are tested against Zabbix 7.0, 7.2 and 7.4. The widgets only read what Zabbix already holds (hosts, items, latest values, history, trends, tags, macros, value maps, triggers and problems); they never collect data or infer topology. See [chart contracts](docs/CHART-CONTRACTS.md) for what each chart needs.

## Charts

| Code | Chart | Shows |
|---|---|---|
| C01 | Vertical Column | Values per host or item as vertical columns. |
| C02 | Stacked Bar | Items stacked per host or per item. |
| C03 | Doughnut | Shares of a total as a ring. |
| C04 | Bullet Graph | Actual against a target (number, item or macro) with ranges. |
| C05 | Radar | Several items per host on shared axes. |
| C06 | Heat Map | Hosts, items or time on two axes, coloured by value. |
| C07 | Candlestick / OHLC | Open, high, low and close per time bucket. |
| C08 | Bubble | X, Y and size from three items per host. |
| C09 | Gantt | Start, end and progress per task. |
| C10 | Tree Diagram | Host groups, hosts and items as a tree. |
| C11 | Network / Graph Diagram | Hosts linked by tags or an edge list. |
| C12 | Chord / Relationship Diagram | Flows between tagged sources and targets (chord). |
| C13 | Calendar Heat Map | Daily values on a calendar. |
| C14 | LLD Data Table | Discovered items as a sortable, filterable table. |
| C15 | Pie | Shares of a total as a full pie. |
| C16 | Vertical Level Gauge | Tank-style level against a minimum and maximum. |
| C17 | Horizontal Ranking Bar | Top or bottom N as horizontal bars. |
| C18 | Treemap | Nested rectangles sized by value. |
| C19 | Sunburst | Nested rings sized by value. |
| C20 | Funnel | Named stages, each one item. |
| C21 | Temporal Line | History as lines, broken at real gaps. |
| C22 | Temporal Area | History as filled or stacked areas. |
| C23 | Status Matrix | Hosts against items, one coloured cell each. |
| C24 | State Timeline | How long each item stayed in each state. |
| C25 | Sparkline Grid | A tile per item with its latest value and a sparkline. |
| C26 | Threshold Band | History over threshold bands and a target. |
| C27 | Switch Port Panel | Interfaces as the front panel of a switch. |

The Switch Port Panel (C27) consumes existing Zabbix interface data only. It contains no switch discovery, SNMP polling, LLDP/CDP processing, VLAN discovery or MAC-address discovery. By default it lays ports out in two rows, odd numbers along the top and even numbers beneath, with port 1 top-left, port 2 under port 1 and port 3 to the right of port 1, and keeps that arrangement at every widget size.

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
