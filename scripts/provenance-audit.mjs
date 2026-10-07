/**
 * Provenance audit (spec Phase 5): fails when identifiers of the upstream
 * Monzphere module appear outside the files that deliberately acknowledge it.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PATTERNS = [/Monzphere/i, /EchartsWidget/, /WidgetEcharts/, /widget\.echarts\.view/, /colorpickermonz/i, /monzphere\.com/i];

// Files that acknowledge the inspiration or test coexistence by name.
const ALLOWED = new Set([
	'README.md',
	'docs/PROVENANCE.md',
	'docs/REFERENCE-BEHAVIOUR.md',
	'docs/TESTING.md',
	'CHANGELOG.md',
	'scripts/provenance-audit.mjs',
	'tests/compat/coexistence.test.js',
	'tests/integration/smoke.mjs',
	'tests/integration/install-modules.sh',
	'.github/workflows/integration.yml'
]);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);

async function files(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(entries.map((entry) => {
		if (SKIP_DIRS.has(entry.name)) {
			return [];
		}
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? files(full) : [full];
	}));
	return nested.flat();
}

const findings = [];
for (const file of await files(root)) {
	const relative = path.relative(root, file).split(path.sep).join('/');
	if (ALLOWED.has(relative) || relative === 'package-lock.json') {
		continue;
	}
	const text = await readFile(file, 'utf8').catch(() => '');
	text.split('\n').forEach((line, index) => {
		for (const pattern of PATTERNS) {
			if (pattern.test(line)) {
				findings.push(`${relative}:${index + 1}: ${pattern}`);
			}
		}
	});
}

if (findings.length > 0) {
	console.error(`Upstream identifiers found outside acknowledged files:\n${findings.join('\n')}`);
	process.exit(1);
}
console.log('Provenance audit OK.');
