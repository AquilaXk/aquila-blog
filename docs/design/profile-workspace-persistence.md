# Profile Workspace Persistence

## 목적

관리자 프로필 workspace의 draft/published/legacy attr 저장 규칙, retry 기준, idempotency key, 장애 후 복구 절차를 정의한다.

## 구현 근거

| 책임 | 구현 |
| --- | --- |
| Workspace model | `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberProfileWorkspace.kt` |
| Legacy/profile attr bridge | `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberHasProfileCard.kt` |
| Persistence service | `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberProfilePersistenceService.kt` |
| Application boundary | `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberApplicationService.kt` |
| Query boundary | `back/src/main/kotlin/com/back/boundedContexts/member/application/service/CurrentMemberProfileQueryService.kt` |
| Admin API | `back/src/main/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberController.kt` |
| Public profile change event | `back/src/main/kotlin/com/back/boundedContexts/member/application/event/MemberPublicProfileChangedEvent.kt` |

## 저장 슬롯

| 슬롯 | attr name | 역할 |
| --- | --- | --- |
| legacy attrs | `profileRole`, `profileBio`, `aboutRole`, `aboutBio`, `aboutDetails`, `blogTitle`, `homeIntroTitle`, `homeIntroDescription`, `blogDesign`, `legacyBlogScheme`, `profileServiceLinks`, `profileContactLinks`, `profileImgUrl` | 기존 공개/관리자 경로와 호환되는 필드 저장소 |
| draft workspace | `profileWorkspaceDraft` | 관리자 workspace에서 편집 중인 normalized JSON snapshot |
| published workspace | `profileWorkspacePublished` | 공개 프로필 read path가 우선 사용하는 normalized JSON snapshot |

## Persistence contract

- `ensureWorkspaceSnapshotsInitialized`는 workspace attr이 없으면 현재 legacy attrs에서 published와 draft snapshot을 만든다.
- `modifyProfileCard`는 legacy attrs를 갱신하고 draft workspace를 legacy 기준으로 동기화한다. published workspace는 바꾸지 않는다.
- `saveProfileWorkspaceDraft`는 request content를 normalize한 뒤 legacy attrs와 draft workspace를 함께 저장한다. published workspace는 바꾸지 않는다.
- `publishProfileWorkspace`는 draft workspace를 published workspace로 복사한다. legacy attrs는 draft save 시점에 이미 동기화된다.
- 공개 profile query는 `getProfileWorkspacePublishedContent()`와 published modifiedAt을 사용한다.
- workspace JSON decode가 실패하거나 비어 있으면 legacy attrs에서 `currentProfileWorkspaceContent`를 만들어 fallback한다.

## Retry 조건

- profile workspace 저장은 HTTP transaction 안에서 처리되며 별도 async task retry 대상이 아니다.
- DB transaction 실패 또는 optimistic conflict가 발생하면 client가 같은 payload로 다시 요청해야 한다.
- image URL이 바뀌면 `UploadedFileRetentionService.syncProfileImage`가 이전/현재 profile image 참조를 동기화한다. 이 호출은 같은 transaction boundary 안에서 수행된다.
- nickname/profile image가 바뀌면 `MemberPublicProfileChangedEvent`가 발행되어 post author representation cache invalidation을 유도한다.

## Idempotency key

- Workspace identity: member ID + attr name.
- Draft save idempotency: 같은 member ID에 같은 normalized content를 다시 저장하면 draft JSON과 legacy attrs가 같은 값으로 덮인다.
- Publish idempotency: draft와 published가 같으면 다시 publish해도 공개 content는 변하지 않는다.
- Profile image retention identity: member ID + previous/current profile image URL.

## 실패 후 수동 복구

1. 관리자 API `GET /member/api/v1/adm/members/{id}/profileWorkspace`로 draft/published와 `dirtyFromPublished`를 확인한다.
2. draft JSON이 깨졌거나 비어 있고 legacy attrs가 정상이라면 `PUT /member/api/v1/adm/members/{id}/profileWorkspace/draft`로 legacy 기준 content를 다시 저장한다.
3. published가 오래됐으면 draft 내용을 확인한 뒤 `POST /member/api/v1/adm/members/{id}/profileWorkspace/publish`를 다시 호출한다.
4. profile image 참조가 맞지 않으면 member의 legacy `profileImgUrl`, draft/published `profileImageUrl`, uploaded file retention 상태를 함께 확인한다.
5. author 표시가 post public read path에 stale로 보이면 `MemberPublicProfileChangedEvent` 이후 post cache invalidation metric과 `docs/design/cache-consistency-contract.md`의 author recovery 절차를 따른다.

## 금지 사항

- published workspace를 거치지 않고 공개 profile DTO에 draft content를 사용하지 않는다.
- `profileWorkspaceDraft` 또는 `profileWorkspacePublished` JSON을 수동 편집할 때 normalize 규칙을 우회하지 않는다.
- legacy attrs와 draft workspace를 따로 고치지 않는다. draft save 경로는 두 저장소를 함께 동기화한다.
