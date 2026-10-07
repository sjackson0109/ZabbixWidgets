/**
 * Network edges come only from explicit configuration or from host tags whose
 * value names another host. Similar item names on different hosts are never
 * treated as evidence of a link.
 */

/**
 * Parses an edge list: one "source -> target" per line, optionally followed by
 * ": label". Blank lines and lines starting with "#" are ignored.
 */
export function parseEdgeList(text) {
	const edges = [];
	const errors = [];

	String(text ?? '').split(/\r?\n/).forEach((rawLine, index) => {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		const match = /^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.*))?$/.exec(line);
		if (match === null || match[1] === '' || match[2] === '') {
			errors.push({ line: index + 1, text: line });
			return;
		}
		edges.push({ source: match[1].trim(), target: match[2].trim(), label: match[3]?.trim() ?? '' });
	});

	return { edges, errors };
}

/** Builds edges from a host tag whose value is the name of the peer host. */
export function edgesFromHostTag(hosts, tagName) {
	const edges = [];
	for (const host of hosts) {
		for (const tag of host.tags) {
			if (tag.tag === tagName && tag.value !== '') {
				edges.push({ source: host.name, target: tag.value, label: '' });
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

