/**
 * Host and item dimensions shared by the grid-shaped charts (column, stacked
 * bar, heat map).
 *
 * Dimensions use identities, not display names: hosts by hostid and items by
 * item key, which Zabbix keeps unique per host. Labels are disambiguated when
 * two identities share a display name, so distinct items never collapse.
 */

export function hostDimension(entry) {
	return { id: `host:${entry.hostid}`, label: entry.host, detail: entry.hostid };
}

export function itemDimension(entry) {
	return { id: `item:${entry.key}`, label: entry.name, detail: entry.key };
}

/** Distinct dimensions in first-seen order, with labels made unique. */
export function distinct(series, dimensionOf) {
	const byId = new Map();
	for (const entry of series) {
		const dimension = dimensionOf(entry);
		if (!byId.has(dimension.id)) {
			byId.set(dimension.id, dimension);
		}
	}
	const dimensions = [...byId.values()];
	const labelCounts = new Map();
	for (const dimension of dimensions) {
		labelCounts.set(dimension.label, (labelCounts.get(dimension.label) ?? 0) + 1);
	}
	return dimensions.map((dimension) => ({
		...dimension,
		label: labelCounts.get(dimension.label) > 1 ? `${dimension.label} (${dimension.detail})` : dimension.label
	}));
}

export function groupSeries(series, groupBy) {
	const byHost = groupBy !== 'item';
	const categoryOf = byHost ? hostDimension : itemDimension;
	const seriesOf = byHost ? itemDimension : hostDimension;

	const categories = distinct(series, categoryOf);
	const groupDimensions = distinct(series, seriesOf);

	const cells = new Map();
	for (const entry of series) {
		cells.set(`${seriesOf(entry).id}|${categoryOf(entry).id}`, entry);
	}

	const groups = groupDimensions.map((dimension) => ({
		name: dimension.label,
		cells: categories.map((category) => cells.get(`${dimension.id}|${category.id}`) ?? null)
	}));

	return { categories: categories.map((category) => category.label), groups };
}
