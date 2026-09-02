# Aquila Blog repository boundaries

## Final decision

The final topology is exactly two repositories.

| Repository | Role | Ownership |
| --- | --- | --- |
| [AquilaXk/aquila-blog](https://github.com/AquilaXk/aquila-blog) | Platform | API, data, home-server operations, and Platform contracts |
| [AquilaXk/aquila-blog-web](https://github.com/AquilaXk/aquila-blog-web) | Web | Web source, Web contracts, and Web container image production |

No API, Ops, Worker, Shared, Contracts, domain, or other repository is created.
`AquilaXk/aquila-blog` remains the Platform repository; its existing history is not
rewritten.

Platform consumes the Web image only by immutable digest and source SHA. It does not
check out, build, scan, or retain a fallback copy of Web source.

## Stable runtime ownership

The Web URL is `https://blog.aquilaxk.site`, and the public API is served from that
same host by path rather than from a separate API host (#1575). The pre-transition
hosts `www.aquilaxk.site` and `api.aquilaxk.site` are retired (#1555, #1596).
Platform retains DB, Redis, MinIO, administrator cookies, and backend runtime
ownership. The GHCR image family remains unchanged, including
`ghcr.io/aquilaxk/aquila-blog-back`.

This split does not include a DB migration, data movement, or cookie-domain change.

## Repository contract direction

Platform publishes its canonical API bundle at `contracts/public-api/**`. Web
imports a SHA-pinned snapshot into `contracts/platform/**`.

The imported API lock fails closed unless it identifies its source repository, a
40-character source SHA, lower-case artifact SHA-256 values, and bytes matching those
hashes. Normal CI does not check out the other repository's source tree. A potentially
breaking API change is treated as breaking: deploy compatible Web first, then merge
Platform.

## Baseline and rollback

Before a repository-boundary operation, fetch intentionally and record the immutable base:

```bash
git fetch origin main --prune
bash tools/repo-split/capture-baseline.sh --expected-sha <current-platform-main-sha>
```

`capture-baseline.sh` never fetches. It stops if already-fetched `origin/main` differs
from the expected SHA and writes the base SHA, tracked source counts, plus the Git
`size-pack` value. Attach only this non-secret output to the migration issue.

Every source-boundary change must be independently reversible with a normal revert.
Do not rewrite Platform history. The final Web-source removal is one delete/config
commit, so reverting that commit restores the pre-cutover copy without changing data
or administrator cookie contracts. Runtime rollback selects the last verified
immutable Web image digest rather than rebuilding Web source in Platform.
