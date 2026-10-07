/**
 * Builds tree hierarchies only from real structure: nested host group names
 * ("Parent/Child"), an ordered list of tag names, or item names split by a
 * delimiter the user explicitly chose.
 */
import { tagValue } from './normalise.js';

function insert(root, path, leaf) {
	let node = root;
	for (const name of path) {
		let child = node.children.find((candidate) => candidate.name === name && candidate.children);
		if (!child) {
			child = { name, children: [] };
			node.children.push(child);
		}
		node = child;
	}
	node.children.push(leaf);
}

function leafFor(series) {
	return { name: series.name, value: series.value, units: series.units, itemid: series.itemid };
}

export function buildHierarchy(series, hosts, { source, tags = [], delimiter = '' } = {}) {
	const root = { name: '', children: [] };
	const hostById = new Map(hosts.map((host) => [host.hostid, host]));

	for (const entry of series) {
		switch (source) {
			case 'host_group': {
				const host = hostById.get(entry.hostid);
				const groups = host?.groups.length ? host.groups : [null];
				// A host in several groups appears under each of them, as it does in Zabbix.
				for (const group of groups) {
					const groupPath = group === null ? ['(no host group)'] : group.split('/');
					insert(root, [...groupPath, entry.host], leafFor(entry));
				}
				break;
			}
			case 'tags': {
				const path = tags.map((name) => tagValue(entry.tags, name) ?? `(no ${name})`);
				insert(root, path, leafFor(entry));
				break;
			}
			case 'item_path': {
				if (delimiter === '') {
					throw new Error('Item name paths need a delimiter.');
				}
				const parts = entry.name.split(delimiter).filter((part) => part !== '');
				const leafName = parts.pop() ?? entry.name;
				insert(root, [entry.host, ...parts], { ...leafFor(entry), name: leafName });
				break;
			}
			default:
				throw new Error(`Unknown hierarchy source: ${source}`);
		}
	}

	return root;
}
