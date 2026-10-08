/**
 * Network edges come only from explicit configuration or from host tags whose
 * value names another host. Similar item names on different hosts are never
 * treated as evidence of a link.
 */

/**
 * Parses an edge list: one "source -> target" per line, optionally followed by
 * ": label", and optionally ending in "| weight". A weight is either a number
 * (a fixed weight, for example a link's capacity) or the key of an item on
 * the source host whose latest value is the measured weight. Blank lines and
 * lines starting with "#" are ignored.
 *
 * Returns { edges: [{ source, target, label, weight }], errors }, where weight
 * is null, { constant: number } or { key: string }.
 */
export function parseEdgeList(text) {
	const edges = [];
	const errors = [];

	String(text ?? '').split(/\r?\n/).forEach((rawLine, index) => {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		const bar = line.lastIndexOf('|');
		const body = bar === -1 ? line : line.slice(0, bar).trim();
		const weightText = bar === -1 ? null : line.slice(bar + 1).trim();
		const match = /^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.*))?$/.exec(body);
		if (match === null || match[1] === '' || match[2] === '' || weightText === '') {
			errors.push({ line: index + 1, text: line });
			return;
		}
		edges.push({ source: match[1].trim(), target: match[2].trim(), label: match[3]?.trim() ?? '', weight: parseWeight(weightText) });
	});

	return { edges, errors };
}

function parseWeight(text) {
	if (text === null) {
		return null;
	}
	const number = Number(text);
	return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text) && Number.isFinite(number) ? { constant: number } : { key: text };
}

/**
 * The weight of one resolved edge: a fixed number, or the latest value of
 * the item with the given key on the source host. Returns { value, units,
 * entry, error }; a missing item or value is reported, never taken as zero.
 */
export function edgeWeight(edge, series) {
	if (edge.weight === null || edge.weight === undefined) {
		return { value: null, units: '', entry: null, error: null };
	}
	if ('constant' in edge.weight) {
		return { value: edge.weight.constant, units: '', entry: null, error: null };
	}
	const matches = series.filter((entry) => entry.hostid === edge.sourceId && entry.key === edge.weight.key);
	if (matches.length === 0) {
		return { value: null, units: '', entry: null, error: 'missing_item' };
	}
	const [entry] = matches;
	return { value: typeof entry.value === 'number' ? entry.value : null, units: entry.units, entry, error: typeof entry.value === 'number' ? null : 'no_value' };
}

/** Builds edges from a host tag whose value is the name of the peer host. */
export function edgesFromHostTag(hosts, tagName) {
	const edges = [];
	for (const host of hosts) {
		for (const tag of host.tags) {
			if (tag.tag === tagName && tag.value !== '') {
				edges.push({ source: host.name, target: tag.value, label: '', weight: null });
			}
		}
	}
	return edges;
}

/**
 * Resolves edge endpoints against the hosts in the widget. Edges naming hosts
 * that are not selected are returned as unresolved so the widget can say so.
 */
export function resolveEdges(edges, hosts) {
	const byName = new Map(hosts.map((host) => [host.name, host]));
	const resolved = [];
	const unresolved = [];

	for (const edge of edges) {
		const source = byName.get(edge.source);
		const target = byName.get(edge.target);
		if (source && target) {
			resolved.push({ ...edge, sourceId: source.hostid, targetId: target.hostid });
		}
		else {
			unresolved.push({ ...edge, missing: [!source && edge.source, !target && edge.target].filter(Boolean) });
		}
	}

	return { resolved, unresolved };
}

