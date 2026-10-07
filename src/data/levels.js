/**
 * Hierarchies for the treemap and sunburst, built only from structure that
 * exists in Zabbix: host group names (nested by "/"), hosts, item tags,
 * host tags, and item names split by a delimiter the user chose.
 *
 * Levels are written as a comma-separated list, for example
 * "group, host, tag:service" or "hosttag:site, host, path".
 */
import { tagValue } from './normalise.js';

const SIMPLE = new Set(['group', 'host', 'path']);

/** Parses the level list. Returns { levels: [{ type, name }], error }. */
export function parseLevels(text) {
	const tokens = String(text ?? '').split(',').map((token) => token.trim()).filter((token) => token !== '');
	if (tokens.length === 0) {
		return { levels: [], error: 'Enter the hierarchy levels, for example "group, host".' };
	}
	const levels = [];
	for (const token of tokens) {
		const lower = token.toLowerCase();
		const tag = /^(tag|hosttag):(.+)$/i.exec(token);
		if (SIMPLE.has(lower)) {
			levels.push({ type: lower, name: lower });
		}
		else if (tag !== null && tag[2].trim() !== '') {
			levels.push({ type: tag[1].toLowerCase() === 'tag' ? 'tag' : 'host_tag', name: tag[2].trim() });
		}
		else {
			return { levels: [], error: `"${token}" is not a hierarchy level. Use group, host, tag:<name>, hosttag:<name> or path.` };
		}
	}
	if (levels.some((level, index) => level.type === 'path' && index !== levels.length - 1)) {
		return { levels: [], error: 'The "path" level splits item names and must come last.' };
	}
	return { levels, error: null };
}

function pathsFor(level, entry, host, delimiter) {
	switch (level.type) {
		case 'group': {
			const groups = host?.groups.length ? host.groups : [null];
			// A host in several groups appears under each of them, as it does in Zabbix.
			return groups.map((group) => (group === null ? ['(no host group)'] : group.split('/')));
		}
		case 'host':
			return [[entry.host]];
		case 'tag':
			return [[tagValue(entry.tags, level.name) ?? `(no ${level.name})`]];
		case 'host_tag':
			return [[tagValue(host?.tags ?? [], level.name) ?? `(no ${level.name})`]];
		case 'path':
			return [entry.name.split(delimiter).map((part) => part.trim()).filter((part) => part !== '').slice(0, -1)];
		default:
			return [[]];
	}
}

function leafName(levels, entry, delimiter) {
	if (levels[levels.length - 1]?.type === 'path') {
		const parts = entry.name.split(delimiter).map((part) => part.trim()).filter((part) => part !== '');
		return parts[parts.length - 1] ?? entry.name;
	}
	return entry.name;
}

/** Every combination of the paths each level yields for one item. */
function combine(lists) {
	return lists.reduce((paths, options) => paths.flatMap((path) => options.map((option) => [...path, ...option])), [[]]);
}

/**
 * Builds { name, children } nodes with leaves { name, value, entry }.
 * Returns { root, duplicated } where duplicated lists items that appear
 * more than once (hosts in several groups), whose values then count twice
 * in the totals above them.
 */
export function buildLevelTree(series, hosts, levels, { delimiter = '' } = {}) {
	const root = { name: '', children: [] };
	const byHost = new Map(hosts.map((host) => [host.hostid, host]));
	const duplicated = [];

	for (const entry of series) {
		const host = byHost.get(entry.hostid);
		const paths = combine(levels.map((level) => pathsFor(level, entry, host, delimiter)));
		if (paths.length > 1) {
			duplicated.push(entry);
		}
		for (const path of paths) {
			let node = root;
			for (const name of path) {
				let child = node.children.find((candidate) => candidate.children && candidate.name === name);
				if (child === undefined) {
					child = { name, children: [] };
					node.children.push(child);
				}
				node = child;
			}
			node.children.push({ name: leafName(levels, entry, delimiter), value: entry.value, entry });
		}
	}

	return { root, duplicated };
}

/** Sum of the leaf values below a node. */
export function nodeTotal(node) {
	return node.children ? node.children.reduce((total, child) => total + nodeTotal(child), 0) : (node.value ?? 0);
}

/**
 * Cuts the tree at a depth: nodes at that depth become leaves holding the
 * total of what was below them. Depth 0 keeps the whole tree.
 */
export function limitDepth(node, depth, current = 0) {
	if (!node.children) {
		return node;
	}
	if (depth > 0 && current >= depth) {
		return { name: node.name, value: nodeTotal(node), collapsed: true };
	}
	return { ...node, children: node.children.map((child) => limitDepth(child, depth, current + 1)) };
}

/** Depth of the deepest leaf below a node (a leaf is depth 0). */
export function treeDepth(node) {
	return node.children ? 1 + Math.max(0, ...node.children.map(treeDepth)) : 0;
}
