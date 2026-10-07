/** Runs `php -l` on every PHP file in the module. Requires PHP on PATH. */
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function phpFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(entries.map((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? phpFiles(full) : (entry.name.endsWith('.php') ? [full] : []);
	}));
	return files.flat().sort();
}

const files = await phpFiles(path.join(root, 'modules'));
let failed = 0;

for (const file of files) {
	try {
		execFileSync('php', ['-l', file], { stdio: 'pipe' });
	}
	catch (error) {
		failed++;
		process.stderr.write(error.stdout?.toString() || error.message);
	}
}

console.log(`php -l: ${files.length - failed}/${files.length} files OK`);
process.exit(failed === 0 ? 0 : 1);
