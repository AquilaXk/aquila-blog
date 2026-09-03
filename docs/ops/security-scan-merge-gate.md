# Security scan merge gate (#1124, #1344)

PR → `main` merge-blocking vulnerability gates live in `.github/workflows/security.yml` and
`.github/workflows/reusable-backend-quality.yml` (dependency review).

## Repository split transition

This repository owns backend/runtime scanning. [AquilaXk/aquila-blog-web](https://github.com/AquilaXk/aquila-blog-web) owns Web
CodeQL, lockfile scanning, browser/CSP checks, SBOM/image scanning, and Sonar. Its native `osv-scanner.toml` and
`.trivyignore.yaml` preserve only Web dependency exceptions with explicit expiry dates.

## Backend NVD path split (#1344)

| Event | `backend-dependency-check` |
| --- | --- |
| `pull_request` | Full OWASP/NVD `dependencyCheckAnalyze` **does not run**. Job succeeds immediately so required-check name drift does not block PRs. PR still relies on dependency-review, OSV, Trivy, and exception schema. |
| `push` to `main` | Full NVD scan, fail-closed if `NVD_API_KEY` missing |
| weekly `schedule` / `workflow_dispatch` | Full NVD scan, fail-closed if `NVD_API_KEY` missing |

NVD update outage on main/schedule remains fail-closed (no silent skip). `#1389` configures Gradle
`nvd.datafeedUrl` to the ODC Builder cache
(`https://dependency-check.github.io/DependencyCheck_Builder/nvd_cache/nvdcve-{0}.json.gz`) so CI does not
crawl the NVD REST API for ~370k records (that path hung Deploy for hours after `#1388`).
`#1383`/`#1385` keep limited API retries (`nvd.maxRetryCount=20` / `nvd.delay=4000`) for residual API use.
Do not wrap the scan in a multi-hour shell retry loop. `backend-dependency-check` timeout is 240 minutes.
Do not treat PR green as “NVD clean”; trunk/schedule evidence is the full-scan gate.
`NVD_API_KEY` remains required on the workflow path (fail-closed secret contract); datafeed is the primary
DB refresh source under that gate.

### PR-facing Security jobs (typical required-check names)

- `backend-dependency-check` (PR: deferred success only — not a full NVD result)
- `vulnerability-exception-schema`
- `container-image-scan`
- `sbom`
- `codeql` (java-kotlin)
- plus reusable `dependency-review` from backend quality on PRs

## Required secrets / vars (names only — never commit values)

| Name | Kind | Purpose |
| --- | --- | --- |
| `NVD_API_KEY` | repository secret | OWASP dependency-check NVD API for backend scans |
| GitHub Dependency graph | repository Security setting | PR dependency review compare API |
| `GITHUB_TOKEN` | Actions default | GHCR read (if needed) and API auth for dependency review |

## Container image gate

- Backend: final `FROM` in `back/Dockerfile` (GHCR deploy base)
- Trivy scope: `--pkg-types os` + `--ignore-unfixed` High/Critical (app/library vulnerabilities are covered by backend NVD)
- Temporary OS exceptions live in `.github/security/vulnerability-exceptions.yml`

## Exception allowlist

- File: `.github/security/vulnerability-exceptions.yml`
- Validator: `node tools/guards/check-vulnerability-exceptions.mjs`
- Required fields per entry: `package`, `cve`, `issue` (`#N` or GitHub issue URL), `owner` (`@handle`), `expiry` (`YYYY-MM-DD`), `reason`
- Expired or schema-invalid entries fail CI
- Applied to the Platform Trivy/NVD surfaces that invoke the validator
- **Match the ID each scanner actually reports.** OSV matching also checks the advisory's `aliases`,
  but Trivy matching is an exact comparison against the report's `VulnerabilityID`. When the two
  scanners name the same advisory differently, one entry will not cover both — add one entry per ID.
  Example: brace-expansion DoS is `GHSA-mh99-v99m-4gvg` (aliases `CVE-2026-14257`) in OSV and
  `CVE-2026-14257` in Trivy, so the `CVE-2026-14257` entry happens to cover both; a GHSA-only
  allowlist entry would suppress it in OSV while Trivy kept blocking it.
- **Does not apply** to OWASP `dependencyCheckAnalyze` (`failBuildOnCVSS`). Backend NVD suppressions use
  `back/config/dependency-check-suppressions.xml` wired via `dependencyCheck.suppressionFiles` in
  `back/build.gradle.kts` (#1387, #1391). Prefer upgrades; suppress only CPE false-positives
  (e.g. Netty 4.2.16.Final already vendor-fixed while NVD CPE includes that version) or temporary
  no-GA cases with `until` + issue link.

## Required repository secret

`NVD_API_KEY` must exist in repo Actions secrets. Missing secret fails full `backend-dependency-check` on `main` push, weekly schedule, and `workflow_dispatch` (by design). PR path does not consume the secret (#1344).

Full `backend-dependency-check` caches `~/.gradle/dependency-check-data` with a stable
`owasp-nvd-<os>-<ref>-v2` key (shared across runs on the same ref) and allows up to 240 minutes
so cold NVD sync is not cancelled by the previous 120-minute job timeout (#1385).

### Local template / owner env

| Location | Purpose |
| --- | --- |
| `back/.env.default` | Tracked template (`NVD_API_KEY=NEED_TO_SET`) |
| `back/.env` (gitignored) | Owner local value; also used when exporting for local `dependencyCheckAnalyze` |

After filling `back/.env`, sync the Actions secret (do not commit the value):

```bash
# from repo root, with NVD_API_KEY set in the shell or extracted from back/.env
gh secret set NVD_API_KEY --body "$NVD_API_KEY"
```
