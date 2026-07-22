# Security scan merge gate (#1124)

PR → `main` merge-blocking vulnerability gates live in `.github/workflows/security.yml` and
`.github/workflows/reusable-backend-quality.yml` (dependency review).

## Required secrets / vars (names only — never commit values)

| Name | Kind | Purpose |
| --- | --- | --- |
| `NVD_API_KEY` | repository secret | OWASP dependency-check NVD API for backend scans |
| GitHub Dependency graph | repository Security setting | PR dependency review compare API |
| `GITHUB_TOKEN` | Actions default | GHCR read (if needed) and API auth for dependency review |

Frontend OSV/yarn audit and Trivy use public vulnerability DBs; no extra secrets.

## Exception allowlist

- File: `.github/security/vulnerability-exceptions.yml`
- Validator: `node tools/guards/check-vulnerability-exceptions.mjs`
- Required fields per entry: `package`, `cve`, `issue` (`#N` or GitHub issue URL), `owner` (`@handle`), `expiry` (`YYYY-MM-DD`), `reason`
- Expired or schema-invalid entries fail CI
