/**
 * Lists every production dependency that ends up in the released bundle,
 * fails on licences outside the allow-list, and checks that
 * THIRD_PARTY_NOTICES.md names each package at its installed version.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set(['MIT', 'Apache-2.0', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');

const production = Object.entries(lock.packages)
	.filter(([location, info]) => location.startsWith('node_modules/') && !info.dev)
	.map(([location, info]) => ({ name: location.slice('node_modules/'.length), version: info.version, licence: info.license }))
	.sort((a, b) => a.name.localeCompare(b.name));

const problems = [];
for (const pkg of production) {
	if (!ALLOWED.has(pkg.licence)) {
		problems.push(`${pkg.name}@${pkg.version}: licence ${pkg.licence ?? 'unknown'} is not on the allow-list`);
	}
	if (!notices.includes(`${pkg.name} ${pkg.version}`)) {
		problems.push(`${pkg.name}@${pkg.version}: not listed in THIRD_PARTY_NOTICES.md as "${pkg.name} ${pkg.version}"`);
	}
}

console.table(production);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log(`Licence inventory OK: ${production.length} production packages.`);
