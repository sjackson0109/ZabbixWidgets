import { describe, expect, it } from 'vitest';
import { pairSeries } from '../../src/data/pairing.js';
import { buildHierarchy } from '../../src/data/hierarchy.js';
import { edgesFromHostTag, parseEdgeList, resolveEdges } from '../../src/data/edges.js';
import { buildRelationships } from '../../src/data/relationships.js';
import { buildRadar } from '../../src/data/radar.js';
import { host, item, payload } from '../fixtures/payload.js';

describe('pairSeries', () => {
	it('pairs roles by host', () => {
		const { series } = payload('bubble', { series: [
			item({ role: 'x', hostid: '1' }), item({ role: 'y', hostid: '1' }), item({ role: 'size', hostid: '1' }),
			item({ role: 'x', hostid: '2', host: 'Host B' })
		] });
		const result = pairSeries(series, ['x', 'y', 'size']);
		expect(result.tuples).toHaveLength(1);
		expect(result.incomplete).toEqual([{ key: 'host:2', label: 'Host B', missing: ['y', 'size'] }]);
	});

	it('pairs roles by tag across hosts and reports untagged items', () => {
		const { series } = payload('gantt', { series: [
			item({ role: 'start', hostid: '1', tags: [{ tag: 'job', value: 'backup' }] }),
			item({ role: 'end', hostid: '2', tags: [{ tag: 'job', value: 'backup' }] }),
			item({ role: 'start', hostid: '3' })
		] });
		const result = pairSeries(series, ['start', 'end'], { pairBy: 'tag', pairTag: 'job' });
		expect(result.tuples.map((tuple) => tuple.label)).toEqual(['backup']);
		expect(result.untagged).toHaveLength(1);
	});

	it('reports ambiguous matches instead of picking one', () => {
		const { series } = payload('bubble', { series: [
			item({ role: 'x' }), item({ role: 'x' }), item({ role: 'y' }), item({ role: 'size' })
		] });
		expect(pairSeries(series, ['x', 'y', 'size']).ambiguous).toEqual([{ key: 'host:1', label: 'Host A', roles: ['x'] }]);
	});
});

describe('buildHierarchy', () => {
	const hosts = [host({ hostid: '1', name: 'web01', groups: ['Linux/Web', 'Production'] })];

	it('uses nested host group names', () => {
		const { series } = payload('tree', { series: [item({ hostid: '1', host: 'web01', name: 'Load' })] });
		const tree = buildHierarchy(series, hosts, { source: 'host_group' });
		expect(tree.children.map((node) => node.name)).toEqual(['Linux', 'Production']);
		expect(tree.children[0].children[0].children[0].children[0].name).toBe('Load');
	});

	it('does not split item names unless asked', () => {
		const { series } = payload('tree', { series: [item({ hostid: '1', host: 'web01', name: 'Ping 10.0.0.1' })] });
		const tree = buildHierarchy(series, hosts, { source: 'host_group' });
		expect(JSON.stringify(tree)).toContain('"Ping 10.0.0.1"');
	});

	it('splits item names with an explicit delimiter', () => {
		const { series } = payload('tree', { series: [item({ host: 'web01', name: 'disk/sda/reads' })] });
		const tree = buildHierarchy(series, hosts, { source: 'item_path', delimiter: '/' });
		expect(tree.children[0].name).toBe('web01');
		expect(tree.children[0].children[0].children[0].children[0].name).toBe('reads');
	});

	it('builds levels from tags and labels missing tags honestly', () => {
		const { series } = payload('tree', { series: [
			item({ tags: [{ tag: 'site', value: 'London' }] }), item({ tags: [] })
		] });
		const tree = buildHierarchy(series, hosts, { source: 'tags', tags: ['site'] });
		expect(tree.children.map((node) => node.name)).toEqual(['London', '(no site)']);
	});

	it('handles names that clash with object properties', () => {
		const { series } = payload('tree', { series: [item({ host: 'constructor', name: '__proto__' })] });
		const tree = buildHierarchy(series, hosts, { source: 'item_path', delimiter: '.' });
		expect(tree.children[0].name).toBe('constructor');
		expect({}.polluted).toBeUndefined();
	});
});

describe('edges', () => {
	it('parses edge lists and reports bad lines', () => {
		const { edges, errors } = parseEdgeList('# core\nrouter -> switch : uplink\n\nbroken line\nswitch->server');
		expect(edges).toEqual([
			{ source: 'router', target: 'switch', label: 'uplink', weight: null },
			{ source: 'switch', target: 'server', label: '', weight: null }
		]);
		expect(errors).toEqual([{ line: 4, text: 'broken line' }]);
	});

	it('reads fixed and item weights after the last bar', () => {
		const { edges, errors } = parseEdgeList('a -> b : 10G | 10000\na -> c | net.if.out[ge-0/0/1]\na -> d |\na -> e : x|y | 2.5e3');
		expect(edges.map((edge) => edge.weight)).toEqual([{ constant: 10000 }, { key: 'net.if.out[ge-0/0/1]' }, { constant: 2500 }]);
		expect(edges[2].label).toBe('x|y');
		expect(errors).toEqual([{ line: 3, text: 'a -> d |' }]);
	});

	it('builds edges from host tags and resolves them', () => {
		const hosts = [
			host({ hostid: '1', name: 'switch', tags: [{ tag: 'uplink', value: 'router' }] }),
			host({ hostid: '2', name: 'router' }),
			host({ hostid: '3', name: 'ap', tags: [{ tag: 'uplink', value: 'missing' }] })
		];
		const edges = edgesFromHostTag(hosts, 'uplink');
		const { resolved, unresolved } = resolveEdges(edges, hosts);
		expect(resolved).toHaveLength(1);
		expect(unresolved[0].missing).toEqual(['missing']);
	});
});

describe('buildRelationships', () => {
	it('sums flows per source and target', () => {
		const { series } = payload('relationship', { series: [
			item({ value: '5', tags: [{ tag: 'src', value: 'A' }, { tag: 'dst', value: 'B' }] }),
			item({ value: '7', tags: [{ tag: 'src', value: 'A' }, { tag: 'dst', value: 'B' }] }),
			item({ value: '1', tags: [{ tag: 'src', value: 'B' }] })
		] });
		const result = buildRelationships(series, { sourceTag: 'src', targetTag: 'dst' });
		expect(result.flows).toEqual([{ source: 'A', target: 'B', weight: 12, items: [series[0].itemid, series[1].itemid] }]);
		expect(result.nodes).toEqual(['A', 'B']);
		expect(result.untagged).toHaveLength(1);
	});
});

describe('buildRadar', () => {
	const { series } = payload('radar', { series: [
		item({ hostid: '1', name: 'CPU', value: '50' }),
		item({ hostid: '1', name: 'Memory', value: '20' }),
		item({ hostid: '2', host: 'Host B', name: 'CPU', value: '80' })
	] });

	it('uses a shared maximum', () => {
		expect(buildRadar(series, { scale: 'shared' }).indicators).toEqual([{ name: 'CPU', max: 80 }, { name: 'Memory', max: 80 }]);
		expect(buildRadar(series, { scale: 'shared', max: 100 }).indicators[0].max).toBe(100);
	});

	it('uses per-dimension maxima without altering values', () => {
		const radar = buildRadar(series, { scale: 'per_dimension' });
		expect(radar.indicators).toEqual([{ name: 'CPU', max: 80 }, { name: 'Memory', max: 20 }]);
		expect(radar.entities[1].values.Memory).toBeUndefined();
	});
});
