# Security scan merge gate (#1124, #1344)

PR → `main` merge-blocking vulnerability gates live in `.github/workflows/security.yml` and
`.github/workflows/reusable-backend-quality.yml` (dependency review).

## Backend NVD path split (#1344)

| Event | `backend-dependency-check` |
| --- | --- |
| `pull_request` | Full OWASP/NVD `dependencyCheckAnalyze` **does not run**. Job succeeds immediately so required-check name drift does not block PRs. PR still relies on dependency-review, yarn audit, OSV, Trivy, and exception schema. |
| `push` to `main` | Full NVD scan, fail-closed if `NVD_API_KEY` missing |
| weekly `schedule` / `workflow_dispatch` | Full NVD scan, fail-closed if `NVD_API_KEY` missing |

NVD API outage on main/schedule remains fail-closed (no silent skip). `#1383`/`#1385` keep limited retries in
Gradle only (`nvd.maxRetryCount=20` / `nvd.delay=4000`). Do not wrap the scan in a multi-hour shell retry loop —
cold NVD sync can already approach the job budget. `backend-dependency-check` timeout is 240 minutes.
Do not treat PR green as “NVD clean”; trunk/schedule evidence is the full-scan gate.

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

Frontend OSV/yarn audit and Trivy use public vulnerability DBs; no extra secrets.

## Container image gate

- Backend: final `FROM` in `back/Dockerfile` (GHCR deploy base)
- Frontend homeserver: `node:20-alpine` (`NODE_RUNTIME_IMAGE` default) — not `front/Dockerfile`
- Trivy scope: `--pkg-types os` + `--ignore-unfixed` High/Critical (app/library vulns are covered by NVD/yarn/OSV)
- Temporary OS exceptions live in `.github/security/vulnerability-exceptions.yml`

## Exception allowlist

- File: `.github/security/vulnerability-exceptions.yml`
- Validator: `node tools/guards/check-vulnerability-exceptions.mjs`
- Required fields per entry: `package`, `cve`, `issue` (`#N` or GitHub issue URL), `owner` (`@handle`), `expiry` (`YYYY-MM-DD`), `reason`
- Expired or schema-invalid entries fail CI
- Applied to Trivy image findings, OSV High/Critical, and yarn audit High/Critical (`tools/guards/check-yarn-audit-high.mjs`)

## Frontend audit notes

- Do **not** pass yarn classic `--groups dependencies,devDependencies` — it can audit 0 packages and exit 0 (false pass).
- Yarn gate parses `yarn audit --json`, fails if `totalDependencies <= 0`, then fails on High/Critical after allowlist.

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
