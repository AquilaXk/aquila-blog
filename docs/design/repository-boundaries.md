# Aquila Blog repository boundaries

## Final decision

The final topology is exactly two repositories.

| Repository | Role | Ownership |
| --- | --- | --- |
| `AquilaXk/aquila-blog` | Platform | API, data, home-server operations, and Platform contracts |
| `AquilaXk/aquila-blog-web` | Web | Web source, Web contracts, and (after the split) the Web container image build |

No API, Ops, Worker, Shared, Contracts, domain, or other repository is created.
`AquilaXk/aquila-blog` remains the Platform repository; its existing history is not
rewritten.

The table states the target ownership. Today the Web container image is still built by
Platform (`.github/workflows/frontend-image.yml`); moving that workflow to Web is part
of the split execution, not a state this document already describes.

## Stable runtime ownership

The Web URL is `https://blog.aquilaxk.site`, and the public API is served from that
same host by path rather than from a separate API host (#1575). The pre-transition
hosts `www.aquilaxk.site` and `api.aquilaxk.site` are retired (#1555, #1596).
Platform retains DB, Redis, MinIO, cookie, OAuth callback, and backend runtime
ownership. The GHCR image family remains unchanged, including
`ghcr.io/aquilaxk/aquila-blog-back`.

This split does not include a DB migration, data movement, cookie-domain change, or
OAuth callback change.

## Repository contract direction

Platform publishes its canonical API bundle at `contracts/public-api/**`. Web
imports a SHA-pinned snapshot into `contracts/platform/**`. Web publishes the
canonical legal manifest at `contracts/export/legal-policy-manifest.json`; Platform
imports its lock at `contracts/web/legal-policy-manifest.lock.json`.

Each imported lock fails closed unless it identifies its source repository, a
40-character source SHA, lower-case artifact SHA-256 values, and bytes matching those
hashes. Normal CI does not check out the other repository's source tree. A potentially
breaking API change is treated as breaking: deploy compatible Web first, then merge
Platform. Platform does not merge active legal metadata until Web custom-domain
validation succeeds.

## Baseline and rollback

Before every split-stage operation, fetch intentionally and record the immutable base:

```bash
git fetch origin main --prune
bash tools/repo-split/capture-baseline.sh \
  --expected-sha 6545c06296edf05759199718cf712e9c0e1af108
```

`capture-baseline.sh` never fetches. It stops if already-fetched `origin/main` differs
from the expected SHA and writes the base SHA, tracked `front`, `back`, and `deploy`
file counts, plus the Git `size-pack` value. Attach only this non-secret output to the
migration issue.

Every source-boundary change must be independently reversible with a normal revert.
Do not rewrite Platform history. Do not delete Platform `front/**` until two Web
production deployments, rollback evidence, and their required evidence are complete.
Rollback restores the last verified repository commit and its SHA-pinned contract
snapshots; it does not move data or alter cookie and OAuth runtime contracts.
