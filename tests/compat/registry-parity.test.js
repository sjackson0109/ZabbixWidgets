/**
 * The server (ChartRegistry.php) and the browser (src/registry) read the same
 * registry file. This checks they reach the same decisions for every chart
 * under every value of every setting, and under combinations of settings.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	activeRoles, ENUMS, listCharts, requiredControls, requiresHistory, requiresTimePeriod, visibleControls
} from '../../src/registry/index.js';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'registry-parity.php');

function defaults() {
	return Object.fromEntries(Object.entries(ENUMS).map(([field, values]) => [field, values[0]]));
}

/** Small deterministic generator, so a failure always reproduces. */
function random(seed) {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
}

function cases() {
	const list = [];
	const next = random(7);
	for (const chart of listCharts()) {
		list.push({ chart: chart.id, config: defaults() });
		for (const [field, values] of Object.entries(ENUMS)) {
			for (const value of values) {
				list.push({ chart: chart.id, config: { ...defaults(), [field]: value } });
			}
		}
		for (let index = 0; index < 40; index++) {
			const config = Object.fromEntries(Object.entries(ENUMS)
				.map(([field, values]) => [field, values[Math.floor(next() * values.length)]]));
			list.push({ chart: chart.id, config });
		}
	}
	return list;
}

describe('registry parity between PHP and JavaScript', () => {
	it('makes the same decisions for every chart and setting', () => {
		const list = cases();
		const php = JSON.parse(execFileSync('php', [script], { input: JSON.stringify(list) }).toString());

		const js = list.map(({ chart: id, config }) => {
			const chart = listCharts().find((entry) => entry.id === id);
			return {
				activeRoles: activeRoles(chart, config),
				visibleControls: visibleControls(id, config),
				requiredControls: requiredControls(id, config),
				history: requiresHistory(chart, config),
				timePeriod: requiresTimePeriod(chart, config)
			};
		});

		expect(php).toHaveLength(list.length);
		list.forEach((testCase, index) => {
			expect(php[index], JSON.stringify(testCase)).toEqual(js[index]);
		});
	});
});
