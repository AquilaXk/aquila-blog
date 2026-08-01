# Canonical Post Summary Pipeline Implementation Plan

> Parent: #1493  
> Execution issues: #1495 → #1496 → #1497 → #1498  
> Baseline: `main` at execution start; every phase starts from the preceding squash-merged `main`.

## Goal

Replace the current duplicated read-time Lead-N summary behavior with a deterministic backend-owned canonical summary pipeline, remove the unsafe preview cache, align every Web surface to the same stored value, and delete all unused external AI/Gemini summary contracts.

## Non-goals

- No LLM, Gemini, embedding, TextRank, TF-IDF, or external processor.
- No cross-repository source checkout after the Web/Platform split.
- No silent rewrite of author-provided manual summaries.
- No raw Markdown, code, image URL, or error placeholder fallback.

## Delivery contract

Each task follows this gate:

1. Add a regression or contract test first.
2. Observe the focused GitHub Actions check fail for the intended reason when local execution is unavailable.
3. Add the smallest production change that makes the test pass.
4. Run focused checks, then repository-required checks.
5. Inspect the full PR diff, CodeRabbit review, unresolved threads, and CI statuses.
6. If CodeRabbit cannot review because of quota/limit, post a clearly labelled `## Manual Code Review` comment using the repository review format.
7. Merge only when required checks are green and no blocking review item remains.
8. Start the next branch from the newly merged `main`.

---

## Task 1 — #1495 Preview cache collision hotfix

### Files

- Modify: `back/src/test/kotlin/com/back/boundedContexts/post/dto/PostPreviewExtractorTest.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/post/dto/PostPreviewExtractor.kt`

### Test first

Add collision fixtures proving that equal `hashCode` + equal length inputs do not share either summary or thumbnail.

```kotlin
@Test
fun `same hash and length contents never share a summary`() {
    assertThat("FB".hashCode()).isEqualTo("Ea".hashCode())
    assertThat(PostPreviewExtractor.makeSummary("FB")).isEqualTo("FB")
    assertThat(PostPreviewExtractor.makeSummary("Ea")).isEqualTo("Ea")
}
```

Use the same collision segment in image URLs to prove thumbnail isolation.

### Expected red

The second call returns the first cached `Preview` because the key is `(hashCode << 32) xor length`.

### Implementation

Delete the in-memory `LinkedHashMap`, `CACHE_MAX_ENTRIES`, synchronization, and `contentKey`. `extract(content)` delegates directly to `buildPreview(content)`.

### Verification

```bash
./gradlew -p back test --tests 'com.back.boundedContexts.post.dto.PostPreviewExtractorTest' --no-daemon
./gradlew -p back ktlintCheck --no-daemon
./gradlew -p back ciFastCheck --no-daemon
```

### Commit sequence

1. `test(summary): Preview hash collision 회귀 추가`
2. `fix(summary): Preview cache 충돌 정합성 복구`

---

## Task 2 — #1496 Backend canonical summary

### Architecture

Create a pure deterministic summary component owned by the post application/domain boundary. It returns text plus provenance:

```kotlin
enum class PostSummarySource {
    MANUAL,
    LEADING_BLOCK,
    EXTRACTED,
    MIGRATED,
    NONE,
}

data class ResolvedPostSummary(
    val text: String,
    val source: PostSummarySource,
    val contentHash: String?,
    val algorithmVersion: String?,
    val generatedAt: Instant?,
)
```

Persist equivalent fields on `Post`:

- `summaryText`
- `summarySource`
- `summaryContentHash`
- `summaryAlgorithmVersion`
- `summaryGeneratedAt`

### Schema and migration

Add a versioned Flyway migration that:

1. Adds nullable text/hash/version/timestamp columns and a non-null source column with `NONE` default.
2. Does not use repeatable migration DDL.
3. Leaves existing rows valid during rolling deployment.
4. Supports rollback by application compatibility rather than destructive down migration.

Backfill existing posts using an idempotent application task or migration-safe SQL only where exact legacy metadata extraction is possible. Existing non-placeholder `summary:` metadata becomes `MIGRATED`; placeholders are ignored. Existing canonical values are never overwritten.

### Extraction priority

1. Non-blank manual summary.
2. Leading `> **요약:**` / `> Summary:` block.
3. First meaningful prose paragraph, at most two complete sentences.
4. `NONE` when meaningful prose is absent.

### Parser contract

The extractor must exclude:

- YAML/frontmatter
- H1 equal to the title
- fenced code with backtick or tilde fences, including longer and unclosed fences
- indented code
- images
- tables
- HTML blocks/details
- blockquotes other than the explicit leading summary block
- math, footnotes, task markers, GitHub alert markers

It preserves link labels and technical punctuation such as `stale-if-error`, `Cache-Control`, and `--dry-run`.

### Unicode and length

- Normalize whitespace without rewriting author wording.
- Prefer sentence boundaries.
- Truncate only at grapheme boundaries.
- Include the final ellipsis within the 150-grapheme limit.

### API contract

Modify:

- `PostWriteRequest.summary: String?`
- `PostModifyRequest.summary: String?`
- `PostWriteResultDto` to return the canonical summary where needed
- `PostDto`, `FeedPostDto`, public detail/cache DTOs to read `post.summaryText`
- authenticated deterministic preview endpoint, if the Web workflow requires one

The backend recomputes according to source policy; it does not trust a client-side “generated” provenance flag.

### Test first

Add focused tests for:

- manual / leading block / extracted / none / migrated
- manual value surviving content edits
- explicit blank causing deterministic recomputation
- code/image/table/HTML-only content
- LF/CRLF and escaped frontmatter values
- Korean, English, mixed language, Japanese
- emoji, combining marks, ZWJ sequences
- 149/150/151 grapheme boundaries
- public/admin DTOs reading persisted summary without summary body parsing
- migration/backfill idempotency and placeholder rejection

### Verification

```bash
./gradlew -p back test --tests '*PostSummary*' --no-daemon
./gradlew -p back test --tests '*ApiV1PostControllerTest*' --no-daemon
./gradlew -p back test --tests '*PostPreviewExtractorTest*' --no-daemon
./gradlew -p back ktlintCheck --no-daemon
./gradlew -p back ciFastCheck --no-daemon
node tools/contracts/sync-public-contracts.mjs
git diff --exit-code -- contracts/public-api
```

### Suggested commit sequence

1. `test(summary): canonical provenance 계약 추가`
2. `feat(summary): deterministic extractor 구현`
3. `test(summary): Post write persistence 회귀 추가`
4. `feat(summary): canonical fields와 Flyway migration 추가`
5. `refactor(summary): read DTO를 stored summary로 전환`
6. `test(summary): legacy backfill idempotency 검증`
7. `feat(summary): legacy summary backfill 추가`
8. `chore(contract): summary API snapshot 갱신`

---

## Task 3 — #1497 Web canonical contract

### Files and surfaces

- Admin editor state/controller/persistence
- `front/src/libs/postSummary.ts`
- Post API DTOs/mappers/generated contracts
- Feed card
- Detail header/body summary handling
- SEO metadata and BlogPosting JSON-LD
- RSS feed
- Authoring/unit/smoke tests

### UX contract

- Rename `자동 생성` to `본문 자동 발췌`.
- Rename `본문 기준으로 채우기` to `본문에서 요약 가져오기`.
- Fetch the authenticated backend deterministic preview and copy the result into the editable summary field.
- Preserve manual summary exactly except whitespace and backend length validation.
- Do not mutate manual copy with lead-in stripping.
- Hide summary regions when canonical summary is empty.
- Never expose AI/Gemini UI or state.

### Data flow

```text
Editor input
  → backend preview (explicit user action)
  → editable summary field
  → create/update payload summary
  → backend canonical response
  → editor re-sync
  → feed/detail/SEO/JSON-LD/RSS
```

Local derivation may remain only as a non-persisted typing placeholder during transition; it is never canonical and must be removed when no longer needed.

### Test first

- Manual summary round trip.
- Backend extraction round trip and author edit.
- Preview failure preserves existing manual input.
- Empty summary hides public regions.
- Leading summary block is not duplicated in detail body/header.
- Feed, SEO, JSON-LD, and RSS use the same API value.
- 150-grapheme/emoji/technical-token fixtures.

### Verification

```bash
yarn --cwd front contracts:check
yarn --cwd front test:unit
yarn --cwd front build
yarn --cwd front check:bundle-size
yarn --cwd front test:e2e:authoring
yarn --cwd front test:e2e:smoke
```

A Vercel Preview must be READY and the editor plus public feed/detail flow must be browser-smoked before merge.

### Suggested commit sequence

1. `test(summary): Web canonical round-trip 계약 추가`
2. `refactor(summary): editor payload를 Platform summary로 전환`
3. `refactor(summary): feed detail SEO RSS source 통일`
4. `test(summary): authoring public surface E2E 보강`
5. `chore(contract): Web Platform snapshot 동기화`

---

## Task 4 — #1498 Remove AI/Gemini residue

### Removal scope

Delete all active runtime/config/deploy references to:

- `CUSTOM__AI__SUMMARY__ENABLED`
- `CUSTOM__AI__SUMMARY__GEMINI__API_KEY`
- `CUSTOM__AI__SUMMARY__GEMINI__MODEL`
- rate-limit/cache/retry/circuit-breaker summary keys
- AI Summary production guards and doctor checks
- deploy freeze injection/validation for the removed feature
- active legal/data-map/processor entries that imply current external AI content processing

Immutable historical policy files may remain only when required for legal history and must not be consumed as active runtime contracts.

### Guard

Add a repository guard plus negative fixture so active source/config cannot reintroduce deprecated AI summary keys unnoticed.

### Contract updates

- Update #1256 documentation/locked freeze list to remove the deleted AI key while preserving signup/OAuth/RUM freeze.
- Regenerate legal policy manifests and Web locks when active policy source changes.
- Ensure deterministic local extraction is not registered as an external processor.

### Test first

Introduce a fixture containing a deprecated AI summary key and assert the repository guard fails. Then remove active references and make the real repository pass.

### Verification

```bash
rg 'CUSTOM__AI__SUMMARY|AI Summary|AI 요약|Gemini.*summary|summary.*Gemini' .
node tools/legal/validate-privacy-data-map.mjs
node tools/test/env-contract.test.mjs
bash tools/test/homeserver-doctor.test.sh
bash tools/test/check-forbidden-tracked-files.test.sh
./gradlew -p back ktlintCheck --no-daemon
./gradlew -p back ciFastCheck --no-daemon
yarn --cwd front legal:check
yarn --cwd front build
```

### Suggested commit sequence

1. `test(config): deprecated AI summary guard 추가`
2. `chore(config): Gemini summary runtime env 제거`
3. `chore(deploy): AI summary 배포 계약 제거`
4. `docs(legal): deterministic summary 처리 계약 정정`
5. `test(config): env legal drift 회귀 갱신`

---

## Final merge and CD verification

After #1498 merges:

1. Verify latest `main` combined status and all main-triggered workflow runs.
2. Verify backend/home-server deployment identifies the merged SHA and completes blue-green health checks.
3. Verify Vercel production deployment is READY and points to the expected Web SHA/artifact.
4. Check production runtime/build logs for summary-related errors.
5. Smoke:
   - public feed renders canonical summaries or hides empty summaries
   - detail header/body has no duplicate leading summary
   - SEO description and JSON-LD contain the canonical value
   - RSS description matches canonical value or title fallback
   - editor can load, manually edit, request deterministic extraction, save, and reopen
6. Update #1493 checklist and close only after evidence links are attached.
