# Profile Workspace Persistence

## Purpose

This contract defines canonical administrator profile draft and published persistence,
synchronous failure behavior, idempotency, and the recovery boundary.

## Implementation evidence

| Concern | Owner |
| --- | --- |
| Workspace model and canonical codec | `MemberProfileWorkspace.kt` |
| Member and post hydration | `MemberProfileHydrator.kt`, `PostHydrationService.kt` |
| Persistence | `MemberProfilePersistenceService.kt` |
| Application flow | `MemberApplicationService.kt` |
| Current profile queries | `CurrentMemberProfileQueryService.kt` |
| Administrator API | `ApiV1AdmMemberController.kt` |
| Public cache event and listener | `MemberPublicProfileChangedEvent.kt`, `PostAuthorPublicReadCacheInvalidationListener.kt` |

## Storage

| Attr name | Meaning |
| --- | --- |
| `profileWorkspaceDraft` | Normalized administrator editing snapshot |
| `profileWorkspacePublished` | Normalized public-read snapshot |

`MemberProfileWorkspaceContent` owns the fixed 16-field JSON content contract. Current
field names are part of that contract. Stored envelope bytes must decode, normalize, and
re-encode to the exact same value.

Member creation calls `initializeWorkspaceSnapshots` and stores the same normalized
initial content in both attrs within the member transaction. Direct member and
administrator reads require both attrs. Missing, malformed, or noncanonical bytes fail
closed with `IllegalStateException`.

## Read and write behavior

- `PUT /member/api/v1/adm/members/{id}/profileWorkspace/draft` normalizes and saves the
  complete draft only. Published state is unchanged.
- `POST /member/api/v1/adm/members/{id}/profileWorkspace/publish` copies canonical draft
  content to published. Equal snapshots produce no write.
- Public member and profile reads use published content and its modified time only.
- Active post authors require a valid canonical published snapshot. A blank canonical
  image URL uses the configured default image; a missing or invalid snapshot fails.
- Deleted authors use the default image without reconstructing profile state.
- `POST /member/api/v1/adm/members/{id}/profileImageFile` registers a TEMP upload and
  returns only `profileImageUrl`. It does not mutate a member, workspace, or cache. The
  client persists the selected URL through the complete draft PUT.
- Draft and published image URLs together protect referenced uploads from deletion.

Draft save and publish are synchronous HTTP-transaction operations, not durable-task
retries. A changed draft or published image invokes
`UploadedFileRetentionService.syncProfileImage` in the same transaction. Draft save does
not emit a public event. Publish emits `MemberPublicProfileChangedEvent` only when the
published image changes, while nickname modification emits it only when the nickname
changes. `PostAuthorPublicReadCacheInvalidationListener` invalidates author
representations after commit.

## Idempotency

- Snapshot identity is the member ID and canonical attr name.
- Re-saving equal normalized draft content performs no write.
- Publishing an equal draft and published pair performs no write or event.
- Image retention identity is the member ID plus previous and current canonical image
  URLs.

## Retirement and recovery

After backend, public canary, and MinIO gates succeed, the automatic deployment runs the
profile attr retirement in one `SERIALIZABLE` transaction. It verifies every active
member's canonical pair, deletes only the 13 retired standalone attrs, and records the
one-time `profile-workspace-legacy-attrs` source marker. Reintroduction fails before
deletion. Future deploys, backups, and rollbacks require a marker-compatible exact source.

The verified baseline is staged before retirement and published after the marker commits.
An interrupted publish may recover only that complete pending baseline with the same
marker and a source at or above the cutover. Marker query failure is never treated as a
pre-cutover state.

For application recovery:

1. Read `GET /member/api/v1/adm/members/{id}/profileWorkspace` and use
   `dirtyFromPublished` only after both snapshots decode.
2. Stop direct profile reads, profile writes, and publication when either canonical attr
   is missing, malformed, or noncanonical. Public post-author reads continue only when
   the published snapshot is valid. No reconstruction endpoint or standalone-attr source
   exists.
3. Restore both snapshots only from verified canonical data through the approved data
   recovery path, validate both, and retry the complete original request.
4. Diagnose image-reference mismatch using only the canonical draft and published URLs
   plus uploaded-file retention state.
5. Diagnose a stale post-author image with `cache-consistency-contract.md`; do not
   republish or reconstruct profile state as a fallback.

## Forbidden

- Exposing draft content in public DTOs.
- Bypassing normalization or writing a partial workspace envelope.
- Adding standalone-attr reads, dual writes, decode fallback, or reconstruction.
- Treating an upload response as a persisted profile mutation.
