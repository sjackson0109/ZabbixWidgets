#!/usr/bin/env bash
# Copies ZabbixWidgets (and, when present, the Monzphere module for the
# coexistence check) into the running web container's modules directory.
set -euo pipefail

compose=(docker compose -f tests/integration/docker-compose.yml)
web=$("${compose[@]}" ps -q web)

modules_dir=$(docker exec "$web" sh -c 'for d in /usr/share/zabbix/ui/modules /usr/share/zabbix/modules; do [ -d "$d" ] && echo "$d" && exit 0; done; exit 1')
echo "Zabbix modules directory: $modules_dir"

docker cp modules/extended-charts "$web:$modules_dir/zabbixwidgets_charts"

if [ -d "${MONZPHERE_DIR:-}" ]; then
	docker cp "$MONZPHERE_DIR" "$web:$modules_dir/monzphere_echarts"
fi

docker exec -u 0 "$web" sh -c "chmod -R a+rX '$modules_dir'"
docker exec "$web" ls "$modules_dir"
