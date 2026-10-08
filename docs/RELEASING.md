# Releasing

Releases are published by the `Release` workflow (`.github/workflows/release.yml`). It builds the module zip and its SHA-256 checksum and publishes them as a GitHub release whose notes are the version's CHANGELOG section.

## Prepare the release on a pull request

1. Set the new version in `package.json`, `package-lock.json` (`npm version --no-git-tag-version <version>`) and `modules/extended-charts/manifest.json`.
2. Move everything under `## Unreleased` in `CHANGELOG.md` into a new `## <version> - YYYY-MM-DD` section at the top. Leave `## Unreleased` empty or remove it.
3. If the number of charts changed, update the first word of the manifest description ("Thirty-two ...").

`npm run release:check` (part of `npm run check` and CI) checks that the versions agree and that the manifest counts the charts in the registry. `node scripts/release-check.mjs --tag v<version>` also runs the release-only CHANGELOG checks.

## Publish

After the pull request is merged, open **Actions > Release > Run workflow**, keep the branch on `main` and enter the version (for example `1.0.0`). The workflow tags the commit it tested as `v<version>`.

Pushing a `v<version>` tag yourself runs the same workflow for that tag.

Before anything is published, the workflow:

| Step | Fails when |
|---|---|
| Version and changelog | the run is not on `main`, the tag already exists, the tag does not match `package.json`, the versions disagree, the manifest miscounts the charts, Unreleased still has entries, or there is no dated, non-empty CHANGELOG section for the version |
| Lint, tests, licences and dependencies | `npm run check` fails, or `npm audit` finds a moderate or worse advisory in a runtime dependency |
| Zabbix integration | the integration test fails on Zabbix 7.0, 7.2 or 7.4 |
| Reproducible package | a second build gives different bytes, the archive lacks the manifest, bundle or licence files, or the checksum does not verify |

Only when all of these pass does the publish job create the tag (when run from the Actions tab) and the release, with `zabbixwidgets-charts-<version>.zip` and `zabbixwidgets-charts-<version>.zip.sha256` attached and the checksum repeated in the notes.

## If a release fails

Nothing is tagged or published until every step has passed, so fix the cause on `main` and run the workflow again. If a tag you pushed yourself points at the wrong commit, delete it before pushing it again.
