/**
 * Checks that a version is ready to release: package.json, package-lock.json
 * and manifest.json carry the same version, the manifest describes the real
 * number of charts and, for a release, the tag names that version and the
 * CHANGELOG has a dated section for it with nothing left under Unreleased.
 *
 * Usage:
 *   node scripts/release-check.mjs                       consistency only (every change)
 *   node scripts/release-check.mjs --tag v1.0.0 [--notes dist/notes.md]
 *                                                        release check; writes the release notes
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
	'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** English words for 0-99, as written at the start of the manifest description ("Thirty-two"). */
export function numberWord(n) {
	if (!Number.isInteger(n) || n < 0 || n > 99) {
		throw new Error(`No word for ${n}.`);
	}
	if (n < 20) {
		return ONES[n];
	}
	return TENS[Math.floor(n / 10)] + (n % 10 === 0 ? '' : '-' + ONES[n % 10]);
}

/**
 * Splits a CHANGELOG into its "## " sections: [{ heading, body }], in file order.
 */
export function changelogSections(text) {
	const sections = [];
	let current = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith('## ')) {
			current = { heading: line.slice(3).trim(), lines: [] };
			sections.push(current);
		} else if (current) {
			current.lines.push(line);
		}
	}
	return sections.map(({ heading, lines }) => ({ heading, body: lines.join('\n').trim() }));
}

/**
 * Returns a list of problems; empty when the files agree with each other and,
 * when a tag is given, with that release.
 */
export function releaseProblems({ pkg, lock, manifest, registry, changelog, tag }) {
	const problems = [];
	const version = pkg.version;

	if (!SEMVER.test(version ?? '')) {
		problems.push(`package.json version "${version}" is not a semantic version.`);
	}
	if (lock.version !== version || lock.packages?.['']?.version !== version) {
		problems.push(`package-lock.json version does not match package.json version ${version}; run npm install.`);
	}
	if (manifest.version !== version) {
		problems.push(`manifest.json version ${manifest.version} does not match package.json version ${version}.`);
	}

	const count = registry.charts.length;
	const word = numberWord(count);
	const expected = word[0].toUpperCase() + word.slice(1) + ' ';
	if (!String(manifest.description ?? '').startsWith(expected)) {
		problems.push(`manifest.json description should start with "${expected.trim()}": the registry has ${count} charts.`);
	}

	if (tag === undefined) {
		return problems;
	}

	if (tag !== `v${version}`) {
		problems.push(`Tag ${tag} does not match package.json version ${version} (expected v${version}).`);
	}

	const sections = changelogSections(changelog);
	const unreleased = sections.find((section) => /^unreleased$/i.test(section.heading));
	if (unreleased && unreleased.body !== '') {
		problems.push('CHANGELOG.md still has entries under Unreleased; move them into the release section.');
	}
	const release = sections.find((section) => section.heading.split(' ')[0] === version);
	if (!release) {
		problems.push(`CHANGELOG.md has no "## ${version} - YYYY-MM-DD" section.`);
	} else {
		if (!new RegExp(`^${version.replace(/\./g, '\\.')} - \\d{4}-\\d{2}-\\d{2}$`).test(release.heading)) {
			problems.push(`CHANGELOG.md heading "## ${release.heading}" should read "## ${version} - YYYY-MM-DD".`);
		}
		if (release.body === '') {
			problems.push(`CHANGELOG.md section for ${version} is empty.`);
		}
		if (sections.find((section) => section !== unreleased) !== release) {
			problems.push(`CHANGELOG.md section for ${version} is not the newest one.`);
		}
	}
	return problems;
}

/** The CHANGELOG section for a version, used as the GitHub release notes. */
export function releaseNotes(changelog, version) {
	return changelogSections(changelog).find((section) => section.heading.split(' ')[0] === version)?.body ?? '';
}

async function main(argv) {
	const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
	const read = async (file) => readFile(path.join(root, file), 'utf8');
	const option = (name) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : argv[index + 1];
	};
	const tag = option('--tag');
	const notesFile = option('--notes');

	const pkg = JSON.parse(await read('package.json'));
	const input = {
		pkg,
		lock: JSON.parse(await read('package-lock.json')),
		manifest: JSON.parse(await read('modules/extended-charts/manifest.json')),
		registry: JSON.parse(await read('modules/extended-charts/registry/charts.json')),
		changelog: await read('CHANGELOG.md'),
		tag
	};

	const problems = releaseProblems(input);
	if (problems.length > 0) {
		console.error(problems.map((problem) => `- ${problem}`).join('\n'));
		process.exit(1);
	}

	if (notesFile) {
		const target = path.resolve(root, notesFile);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, releaseNotes(input.changelog, pkg.version) + '\n');
	}
	console.log(tag ? `Ready to release ${tag}.` : `Version ${pkg.version} is consistent.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main(process.argv.slice(2));
}
