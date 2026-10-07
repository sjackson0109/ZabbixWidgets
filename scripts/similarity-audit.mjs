/**
 * Source-similarity review (spec Phase 5). Compares this project's authored
 * source with a checkout of the reference implementation and reports shared
 * token sequences, in two forms:
 *
 * - exact: identical runs of tokens, after removing comments and whitespace;
 * - structural: identical runs after replacing every identifier, string and
 *   number with a placeholder, which catches renamed copies.
 *
 * Structural runs that are one short pattern repeated (object literals,
 * builder chains) are ignored. Third-party bundles in the reference (minified ECharts and its plugins) are
 * skipped. Usage:
 *
 *   node scripts/similarity-audit.mjs <reference-dir> [--max-run N]
 *
 * Exits non-zero when any shared run is at least --max-run tokens long.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const maxRunIndex = args.indexOf('--max-run');
const MAX_RUN = maxRunIndex >= 0 ? Number(args[maxRunIndex + 1]) : 40;
const referenceDirs = args.filter((arg, index) => !arg.startsWith('--') && (maxRunIndex < 0 || index !== maxRunIndex + 1));
const WINDOW = 12;
const REVIEWED = JSON.parse(await readFile(path.join(root, 'scripts/similarity-reviewed.json'), 'utf8')).reviewed;

if (referenceDirs.length === 0) {
	console.error('Usage: node scripts/similarity-audit.mjs <reference-dir>... [--max-run N]');
	process.exit(2);
}

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.php', '.css']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.monzphere', 'test-results']);
const SKIP_FILES = [/\.min\.js$/, /assets\/js\/zabbixwidgets-charts\.js$/];

async function sourceFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(entries.map((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full);
		}
		const relative = full.split(path.sep).join('/');
		return SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !SKIP_FILES.some((pattern) => pattern.test(relative)) ? [full] : [];
	}));
	return nested.flat();
}

const KEYWORDS = new Set(`
	abstract and array as break case catch class const continue default delete do else elseif echo export extends
	false finally fn for foreach function if implements import in instanceof interface let match namespace new null
	of private protected public readonly return self static switch this throw true try typeof use var void while yield
`.split(/\s+/).filter(Boolean));

/** Tokens without comments or whitespace, each as [exact, structural]. */
export function tokenise(text) {
	const stripped = text
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/(^|[^:\\])\/\/.*$/gm, '$1')
		.replace(/^\s*#(?!\[).*$/gm, ' ');
	const pattern = /\$?[A-Za-z_][\w$]*|\d+(?:\.\d+)?|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|->|::|\.\.\.|[^\s\w]/g;
	return [...stripped.matchAll(pattern)].map(([token]) => {
		let structural = token;
		if (/^\d/.test(token)) {
			structural = 'NUM';
		}
		else if (/^['"`]/.test(token)) {
			structural = 'STR';
		}
		else if (/^\$?[A-Za-z_]/.test(token) && !KEYWORDS.has(token.toLowerCase())) {
			structural = 'ID';
		}
		return [token, structural];
	});
}

function shingles(tokens, form) {
	const index = new Map();
	for (let i = 0; i + WINDOW <= tokens.length; i++) {
		const key = tokens.slice(i, i + WINDOW).map((token) => token[form]).join('\u0001');
		if (!index.has(key)) {
			index.set(key, i);
		}
	}
	return index;
}

/** Longest runs of tokens in `ours` that also occur in the reference set. */
function sharedRuns(ours, referenceIndex, form) {
	const runs = [];
	let start = -1;
	for (let i = 0; i + WINDOW <= ours.length + 1; i++) {
		const hit = i + WINDOW <= ours.length
			&& referenceIndex.has(ours.slice(i, i + WINDOW).map((token) => token[form]).join('\u0001'));
		if (hit && start < 0) {
			start = i;
		}
		else if (!hit && start >= 0) {
			runs.push({ start, length: i - 1 - start + WINDOW });
			start = -1;
		}
	}
	return runs;
}

const referenceFiles = (await Promise.all(referenceDirs.map((dir) => sourceFiles(path.resolve(dir))))).flat();
const reference = await Promise.all(referenceFiles.map(async (file) => tokenise(await readFile(file, 'utf8'))));
const referenceIndex = {
	0: new Map(reference.flatMap((tokens) => [...shingles(tokens, 0)])),
	1: new Map(reference.flatMap((tokens) => [...shingles(tokens, 1)]))
};

/**
 * True when a structural run is mostly one short pattern repeated, such as
 * "ID : STR ," in an object literal or "-> addField ( new ID ( STR" in a
 * builder chain. Those shapes appear in any code and say nothing about copying.
 */
function isRepetitive(tokens) {
	const shape = tokens.map((token) => token[1]);
	for (let period = 2; period <= 16; period++) {
		let same = 0;
		for (let i = period; i < shape.length; i++) {
			same += shape[i] === shape[i - period] ? 1 : 0;
		}
		if (same / (shape.length - period) >= 0.8) {
			return true;
		}
	}
	return false;
}

const results = [];
for (const file of await sourceFiles(root)) {
	const tokens = tokenise(await readFile(file, 'utf8'));
	for (const [form, label] of [[0, 'exact'], [1, 'structural']]) {
		for (const run of sharedRuns(tokens, referenceIndex[form], form)) {
			if (form === 1 && isRepetitive(tokens.slice(run.start, run.start + run.length))) {
				continue;
			}
			results.push({
				file: path.relative(root, file).split(path.sep).join('/'),
				form: label,
				length: run.length,
				sample: tokens.slice(run.start, run.start + Math.min(run.length, 24)).map((token) => token[0]).join(' ')
			});
		}
	}
}

results.sort((a, b) => b.length - a.length);
const referenceTokens = reference.reduce((total, tokens) => total + tokens.length, 0);
console.log(`Reference: ${reference.length} source files, ${referenceTokens} tokens (minified third-party bundles skipped).`);
console.log(`Shared runs of at least ${WINDOW} tokens: ${results.length}.`);
for (const result of results.slice(0, 25)) {
	console.log(`${String(result.length).padStart(4)} ${result.form.padEnd(10)} ${result.file}: ${result.sample}`);
}

const isReviewed = (result) => REVIEWED.some((entry) => entry.file === result.file && result.sample.includes(entry.contains));
const over = results.filter((result) => result.length >= MAX_RUN);
const unreviewed = over.filter((result) => !isReviewed(result));
console.log(`\nRuns of ${MAX_RUN} or more tokens: ${over.length}, of which reviewed: ${over.length - unreviewed.length}.`);
if (unreviewed.length > 0) {
	console.error(`${unreviewed.length} unreviewed shared run(s):`);
	for (const result of unreviewed) {
		console.error(`  ${result.file} (${result.form}, ${result.length} tokens): ${result.sample}`);
	}
	process.exit(1);
}
