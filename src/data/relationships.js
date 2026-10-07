/**
 * Relationship (chord) data: each item carries a source tag and a target tag,
 * and its latest value is the flow weight. Several items describing the same
 * source/target pair are summed.
 */
import { tagValue } from './normalise.js';

export function buildRelationships(series, { sourceTag, targetTag }) {
	const flows = new Map();
	const untagged = [];

	for (const entry of series) {
		const source = tagValue(entry.tags, sourceTag);
		const target = tagValue(entry.tags, targetTag);
		if (source === null || target === null || source === '' || target === '') {
			untagged.push(entry);
			continue;
		}
		if (entry.value === null) {
			continue;
		}
		const key = JSON.stringify([source, target]);
		const flow = flows.get(key) ?? { source, target, weight: 0, items: [] };
		flow.weight += entry.value;
		flow.items.push(entry.itemid);
		flows.set(key, flow);
	}

	const nodes = [...new Set([...flows.values()].flatMap((flow) => [flow.source, flow.target]))].sort();
	return { flows: [...flows.values()], nodes, untagged };
}
