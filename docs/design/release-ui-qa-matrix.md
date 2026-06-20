# Release UI QA Matrix

이 문서는 출시 승인 전 UI QA gate의 단일 산출물이다. 실패 항목은 같은 PR에서 임시로 덮지 않고 별도 GitHub issue로 연결한다.

## 자동화 계약

- Playwright spec: `front/e2e/release-ui-qa-matrix.spec.ts`
- Fixture: `front/e2e/helpers/releaseUiQaFixtures.ts`
- 실행 명령: `yarn --cwd front test:e2e:release-ui-qa`
- smoke 회귀: `yarn --cwd front test:e2e:smoke`

## Viewport Matrix

| Viewport | Device class | Required checks |
| --- | --- | --- |
| 320x740 | narrow mobile | 홈/상세/검색/태그에서 horizontal overflow 없음 |
| 360x800 | Android mobile | 긴 제목, 긴 summary, tag rail, 공유/댓글 액션 줄바꿈 안정 |
| 390x844 | iPhone class | table/code/image/comment flow가 viewport 안에 유지 |
| 768x1024 | tablet | editor preview와 detail content가 중간 폭에서 겹치지 않음 |
| 1024x768 | desktop | home rail과 detail side affordance가 content를 가리지 않음 |
| 1440x900 | wide desktop | tag 20개와 긴 URL fixture가 orphan column이나 overflow를 만들지 않음 |

## Content Fixture Matrix

| Fixture | Required count | Automated source |
| --- | ---: | --- |
| 긴 제목 | 1 | `RELEASE_UI_QA_DETAIL_POST.title` |
| 긴 summary | 1 | `RELEASE_UI_QA_DETAIL_POST.summary` |
| Tags | 20 | `RELEASE_UI_QA_TAGS` |
| 긴 URL | 1 | `RELEASE_UI_QA_LONG_URL` |
| 넓은 table | 1 | `RELEASE_UI_QA_DETAIL_CONTENT` |
| Mermaid | 1 | `RELEASE_UI_QA_DETAIL_CONTENT` |
| 수식 | 1 | `RELEASE_UI_QA_DETAIL_CONTENT` |
| 이미지 | 20 | `RELEASE_UI_QA_IMAGE_PATHS` |
| 댓글 | 100 | `RELEASE_UI_QA_COMMENTS` |

## Flow Matrix

| Flow | Scope | Gate |
| --- | --- | --- |
| 비로그인 public navigation | 홈, 상세, 검색, 태그, 댓글 anchor, 공유, 뒤로가기 | release QA spec와 smoke e2e에서 viewport overflow, 핵심 element visibility 확인 |
| 작성자 flow | 새 글, 자동저장, 새로고침 draft 복구, 이미지 업로드, preview, 발행, 수정, 캐시 반영 | `editor-authoring-markdown-editor.spec.ts`와 수동 실제 기기 QA 결과를 함께 기록 |
| 장애 UX | timeout, 401, 409, 413, 429, 500, offline, slow 3G, upload 중 network disconnect | 실패 UX별 재현 결과와 연결 issue를 기록 |

## Failure Issue Rule

- 실패가 release blocker면 `[Fix]` 또는 `[Test]` issue로 분리하고 이 문서의 해당 row에 issue 번호를 남긴다.
- 같은 PR에서 matrix 문서만 통과 처리하지 않는다.
- browser emulation과 실제 기기 결과가 다르면 실제 기기 결과를 우선한다.

## Current Run

| Date | Target | Command or device | Result | Linked issue |
| --- | --- | --- | --- | --- |
| 2026-06-20 | browser emulation matrix | `yarn --cwd front test:e2e:release-ui-qa` | pass, 7 tests | none |
| 2026-06-20 | existing smoke matrix | `yarn --cwd front test:e2e:smoke` | pass, 60 tests | none |
