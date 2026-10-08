import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changelogSections, numberWord, releaseNotes, releaseProblems } from '../../scripts/release-check.mjs';

const changelog = [
	'# Changelog',
	'',
	'## Unreleased',
	'',
	'## 1.1.0 - 2026-11-01',
	'',
	'- New chart.',
	'',
	'## 1.0.0 - 2026-10-08',
	'',
	'- First release.',
	''
].join('\n');

function input(overrides = {}) {
	return {
		pkg: { version: '1.1.0' },
		lock: { version: '1.1.0', packages: { '': { version: '1.1.0' } } },
		manifest: { version: '1.1.0', description: 'Three charts.' },
		registry: { charts: [{}, {}, {}] },
		changelog,
		...overrides
	};
}

describe('numberWord', () => {
	it('writes the manifest count words', () => {
		expect(numberWord(13)).toBe('thirteen');
		expect(numberWord(20)).toBe('twenty');
		expect(numberWord(32)).toBe('thirty-two');
		expect(() => numberWord(100)).toThrow();
	});
});

describe('changelogSections', () => {
	it('splits on second-level headings', () => {
		expect(changelogSections(changelog).map((section) => section.heading)).toEqual(['Unreleased', '1.1.0 - 2026-11-01', '1.0.0 - 2026-10-08']);
		expect(releaseNotes(changelog, '1.0.0')).toBe('- First release.');
	});
});

describe('releaseProblems', () => {
	it('accepts consistent files and a matching tag', () => {
		expect(releaseProblems(input())).toEqual([]);
		expect(releaseProblems(input({ tag: 'v1.1.0' }))).toEqual([]);
	});

	it('reports versions that disagree', () => {
		const problems = releaseProblems(input({ manifest: { version: '1.0.0', description: 'Three charts.' }, lock: { version: '1.0.0', packages: { '': { version: '1.0.0' } } } }));
		expect(problems).toHaveLength(2);
	});

	it('reports a manifest description that miscounts the charts', () => {
		expect(releaseProblems(input({ manifest: { version: '1.1.0', description: 'Thirteen charts.' } }))[0]).toMatch(/"Three"/);
	});

	it('refuses a tag for another version', () => {
		expect(releaseProblems(input({ tag: 'v1.0.0' }))[0]).toMatch(/does not match/);
	});

	it('refuses a release while Unreleased has entries', () => {
		const text = changelog.replace('## Unreleased\n', '## Unreleased\n\n- Pending.\n');
		expect(releaseProblems(input({ tag: 'v1.1.0', changelog: text }))[0]).toMatch(/Unreleased/);
	});

	it('refuses a release without a dated, newest, non-empty section', () => {
		expect(releaseProblems(input({ tag: 'v1.1.0', changelog: changelog.replace('1.1.0 - 2026-11-01', '1.1.0') }))[0]).toMatch(/YYYY-MM-DD/);
		expect(releaseProblems(input({ tag: 'v1.1.0', changelog: changelog.replace('- New chart.', '') }))[0]).toMatch(/empty/);
		expect(releaseProblems(input({ tag: 'v1.2.0', pkg: { version: '1.2.0' }, lock: { version: '1.2.0', packages: { '': { version: '1.2.0' } } }, manifest: { version: '1.2.0', description: 'Three charts.' } }))[0]).toMatch(/no "## 1.2.0/);
		const older = input({ tag: 'v1.0.0', pkg: { version: '1.0.0' }, lock: { version: '1.0.0', packages: { '': { version: '1.0.0' } } }, manifest: { version: '1.0.0', description: 'Three charts.' } });
		expect(releaseProblems(older)[0]).toMatch(/not the newest/);
	});
});

describe('this repository', () => {
	it('has consistent versions and a manifest that counts the registry', () => {
		const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
		expect(releaseProblems({
			pkg: JSON.parse(read('package.json')),
			lock: JSON.parse(read('package-lock.json')),
			manifest: JSON.parse(read('modules/extended-charts/manifest.json')),
			registry: JSON.parse(read('modules/extended-charts/registry/charts.json')),
			changelog: read('CHANGELOG.md')
		})).toEqual([]);
	});
});
