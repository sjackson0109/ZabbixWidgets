/**
 * Builds the release archive: only the runtime files needed to install the
 * module, plus licence notices. The archive is reproducible: files are sorted
 * and stored with a fixed timestamp, so the same commit gives the same bytes.
 *
 * Usage: node scripts/package.mjs   (after npm run build)
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleDir = path.join(root, 'modules/extended-charts');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(moduleDir, 'manifest.json'), 'utf8'));

if (manifest.version !== pkg.version) {
	throw new Error(`manifest.json version ${manifest.version} does not match package.json version ${pkg.version}.`);
}

async function listFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(entries.map((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? listFiles(full) : [full];
	}));
	return nested.flat();
}

const prefix = 'zabbixwidgets_charts/';
const entries = [];

for (const file of await listFiles(moduleDir)) {
	if (file.endsWith('.map')) {
		continue;
	}
	entries.push({ name: prefix + path.relative(moduleDir, file).split(path.sep).join('/'), data: await readFile(file) });
}

const required = [
	['LICENSE', path.join(root, 'LICENSE')],
	['THIRD_PARTY_NOTICES.md', path.join(root, 'THIRD_PARTY_NOTICES.md')],
	['licenses/echarts/LICENSE', path.join(root, 'node_modules/echarts/LICENSE')],
	['licenses/echarts/NOTICE', path.join(root, 'node_modules/echarts/NOTICE')],
	['licenses/zrender/LICENSE', path.join(root, 'node_modules/zrender/LICENSE')],
	['licenses/tslib/LICENSE.txt', path.join(root, 'node_modules/tslib/LICENSE.txt')]
];

for (const [name, source] of required) {
	const data = await readFile(source).catch(() => {
		throw new Error(`${path.relative(root, source)} is required in a release package but is missing.`);
	});
	entries.push({ name: prefix + name, data });
}

if (!entries.some((entry) => entry.name.endsWith('assets/js/zabbixwidgets-charts.js'))) {
	throw new Error('Bundle missing: run npm run build first.');
}

entries.sort((a, b) => a.name.localeCompare(b.name));

// Minimal ZIP writer (deflate, fixed 1980-01-01 timestamp).
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const locals = [];
const centrals = [];
let offset = 0;

for (const entry of entries) {
	const name = Buffer.from(entry.name, 'utf8');
	const compressed = deflateRawSync(entry.data, { level: 9 });
	const crc = crc32(entry.data);

	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(0x0800, 6);
	local.writeUInt16LE(8, 8);
	local.writeUInt16LE(DOS_TIME, 10);
	local.writeUInt16LE(DOS_DATE, 12);
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(compressed.length, 18);
	local.writeUInt32LE(entry.data.length, 22);
	local.writeUInt16LE(name.length, 26);
	local.writeUInt16LE(0, 28);
	locals.push(local, name, compressed);

	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(0x031e, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(0x0800, 8);
	central.writeUInt16LE(8, 10);
	central.writeUInt16LE(DOS_TIME, 12);
	central.writeUInt16LE(DOS_DATE, 14);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(compressed.length, 20);
	central.writeUInt32LE(entry.data.length, 24);
	central.writeUInt16LE(name.length, 28);
	central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
	central.writeUInt32LE(offset, 42);
	centrals.push(central, name);

	offset += local.length + name.length + compressed.length;
}

const centralSize = centrals.reduce((total, buffer) => total + buffer.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const archive = Buffer.concat([...locals, ...centrals, end]);
const outDir = path.join(root, 'dist');
const fileName = `zabbixwidgets-charts-${pkg.version}.zip`;
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, fileName), archive);

const sha256 = createHash('sha256').update(archive).digest('hex');
await writeFile(path.join(outDir, `${fileName}.sha256`), `${sha256}  ${fileName}\n`);
console.log(`${fileName}: ${entries.length} files, ${archive.length} bytes, sha256 ${sha256}`);
