# Security scan merge gate (#1124, #1344)

PR → `main` merge-blocking vulnerability gates live in `.github/workflows/security.yml` and
`.github/workflows/reusable-backend-quality.yml` (dependency review).

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
- `frontend-lockfile-audit`
- `container-image-scan`
- `sbom`
- `privacy-drift-gate`
- `codeql` (java-kotlin / javascript-typescript)
- plus reusable `dependency-review` from backend quality on PRs

## Required secrets / vars (names only — never commit values)

| Name | Kind | Purpose |
| --- | --- | --- |
| `NVD_API_KEY` | repository secret | OWASP dependency-check NVD API for backend scans |
| GitHub Dependency graph | repository Security setting | PR dependency review compare API |
| `GITHUB_TOKEN` | Actions default | GHCR read (if needed) and API auth for dependency review |

Frontend OSV and Trivy (lockfile + runtime image) use public vulnerability DBs; no extra secrets.

## Container image gate

- Backend: final `FROM` in `back/Dockerfile` (GHCR deploy base)
- Frontend homeserver: `node:20-alpine` (`NODE_RUNTIME_IMAGE` default) — not `front/Dockerfile`
- Trivy scope: `--pkg-types os` + `--ignore-unfixed` High/Critical (app/library vulns are covered by backend NVD and the frontend lockfile gate below)
- Temporary OS exceptions live in `.github/security/vulnerability-exceptions.yml`

## Exception allowlist

- File: `.github/security/vulnerability-exceptions.yml`
- Validator: `node tools/guards/check-vulnerability-exceptions.mjs`
- Required fields per entry: `package`, `cve`, `issue` (`#N` or GitHub issue URL), `owner` (`@handle`), `expiry` (`YYYY-MM-DD`), `reason`
- Expired or schema-invalid entries fail CI
- Applied to Trivy High/Critical (runtime images and `front/yarn.lock`) and OSV High/Critical
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

## Frontend lockfile gate (`frontend-lockfile-audit`, #1422)

- Two independent DBs read `front/yarn.lock`: osv-scanner `v2.4.0`, then Trivy `0.72.0`
  (`trivy fs --scanners vuln --severity HIGH,CRITICAL --list-all-pkgs`). Both verdicts come from
  `check-vulnerability-exceptions.mjs` (`--filter-osv` / `--filter-trivy`), never from the scanner exit code.
- **Neither scanner can silence the other.** OSV runs first, and the two Trivy steps carry
  `if: ${{ !cancelled() }}` so they still run when OSV fails — a step without an `if` inherits an
  implicit `success()` and would be skipped. The job still fails on the failed step, so this collects
  both signals without weakening the gate. In #1422 a broken first step hid every scanner behind it,
  leaving the frontend with zero dependency scanning while also blocking all merges.
- **An empty scan is not a pass.** A structurally valid report with no results parses to zero findings
  and would clear the allowlist filter. `--list-all-pkgs` makes Trivy list every package it parsed, and
  the step fails when that count is 0. osv-scanner needs no equivalent assertion: a lockfile that yields
  0 packages exits 128 (`No package sources found`), which the tool-failure branch already rejects —
  its JSON lists only vulnerable packages, so it carries no total to assert. Re-measure that on any
  `OSV_SCANNER_VERSION` bump.
- No `yarn install` in this job: both scanners parse the lockfile, so `node_modules` and the
  `postinstall` script are never needed.
- `yarn audit` is **not** a gate anymore and must not be reintroduced. The npm registry returns audit
  responses gzipped without `Content-Encoding`, so yarn classic and npm both fail to parse them, and
  yarn classic is unmaintained. (Historic trap: yarn classic `--groups dependencies,devDependencies`
  could audit 0 packages and still exit 0 — the same empty-scan false pass the package count now blocks.)
- Exit-code contract: `osv-scanner` returns 1 when it finds vulnerabilities (report is still parsed),
  `trivy fs` returns 0 on findings unless `--exit-code` is passed. Any other non-zero status is a tool
  failure and fails the job fail-closed.

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
