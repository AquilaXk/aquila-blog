# Canonical Post Summary Pipeline Implementation Plan

Parent: #1493  
Execution: #1495 → #1496 → #1497 → #1498

## 목표

현재 frontend/backend에 중복된 read-time Lead-N 발췌를 backend-owned canonical summary로 전환하고, 충돌 가능한 preview cache와 미구현 AI/Gemini summary 계약을 제거한다.

## 공통 실행 게이트

1. 회귀/계약 테스트를 먼저 추가한다.
2. 로컬 실행이 불가능하면 GitHub Actions에서 의도한 실패를 확인한다.
3. 실패 원인을 해결하는 최소 production 변경만 추가한다.
4. focused test 후 repository required checks를 실행한다.
5. PR 전체 diff, CodeRabbit, unresolved thread, CI 상태를 검토한다.
6. CodeRabbit quota/limit이면 `## Manual Code Review` 코멘트로 대체하고 이를 명확히 표시한다.
7. blocking finding이 없을 때만 squash merge한다.
8. 다음 브랜치는 병합된 최신 `main`에서 시작한다.

## #1495 — Preview cache collision hotfix

수정 파일:

- `back/src/test/kotlin/com/back/boundedContexts/post/dto/PostPreviewExtractorTest.kt`
- `back/src/main/kotlin/com/back/boundedContexts/post/dto/PostPreviewExtractor.kt`

TDD:

- `FB` / `Ea` summary collision fixture
- 동일 collision segment를 포함한 서로 다른 image URL thumbnail fixture
- 현 구현의 두 번째 호출이 첫 cached Preview를 반환하는 RED 확인

구현:

- `LinkedHashMap<Long, Preview>`, `CACHE_MAX_ENTRIES`, `contentKey`, `synchronized` 제거
- `extract(content)`가 `buildPreview(content)`를 직접 호출

검증:

```bash
./gradlew -p back test --tests 'com.back.boundedContexts.post.dto.PostPreviewExtractorTest' --no-daemon
./gradlew -p back ktlintCheck --no-daemon
./gradlew -p back ciFastCheck --no-daemon
```

## #1496 — Backend canonical summary

저장 모델:

```text
summaryText
summarySource: MANUAL | LEADING_BLOCK | EXTRACTED | MIGRATED | NONE
summaryContentHash
summaryAlgorithmVersion
summaryGeneratedAt
```

우선순위:

1. non-blank manual summary
2. leading `> **요약:**` / `> Summary:` block
3. 첫 의미 문단의 완전한 1~2문장
4. 의미 있는 자연어가 없으면 NONE

정책:

- frontmatter, 제목 중복 H1, code, image, table, HTML, 일반 blockquote, math/footnote 제외
- link label 유지, URL 제거
- `stale-if-error`, `Cache-Control`, `--dry-run` 보존
- 문장 경계를 우선하고 grapheme 경계에서만 절단
- `…` 포함 150 grapheme 이하
- raw Markdown/error placeholder fallback 금지

변경:

- Post entity와 versioned Flyway migration
- create/update request에 nullable summary
- write/modify 시 canonical resolve/persist
- PostDto/FeedPostDto/detail cache가 stored summary 사용
- legacy frontmatter summary idempotent backfill
- OpenAPI/public contract snapshot 갱신

검증:

```bash
./gradlew -p back test --tests '*PostSummary*' --no-daemon
./gradlew -p back test --tests '*ApiV1PostControllerTest*' --no-daemon
./gradlew -p back ktlintCheck --no-daemon
./gradlew -p back ciFastCheck --no-daemon
node tools/contracts/sync-public-contracts.mjs
git diff --exit-code -- contracts/public-api
```

## #1497 — Web canonical contract

UX:

- `자동 생성` → `본문 자동 발췌`
- `본문 기준으로 채우기` → `본문에서 요약 가져오기`
- 명시적 버튼으로 backend deterministic preview 호출
- 결과는 editable field에 복사하고 manual 수정 허용
- manual summary의 lead-in을 임의 제거하지 않음
- 빈 summary 영역 숨김

표면:

- editor create/update/load
- feed card
- detail header/body duplicate removal
- SEO meta description
- BlogPosting JSON-LD
- RSS description

검증:

```bash
yarn --cwd front contracts:check
yarn --cwd front test:unit
yarn --cwd front build
yarn --cwd front check:bundle-size
yarn --cwd front test:e2e:authoring
yarn --cwd front test:e2e:smoke
```

Vercel Preview READY와 browser smoke 후 merge한다.

## #1498 — AI/Gemini summary residue removal

제거:

- `CUSTOM__AI__SUMMARY__*`
- Gemini summary key/model/rate/cache/retry/circuit 설정
- backend binding/guard
- deploy env injection/freeze
- homeserver precheck/doctor
- active legal/data-map/processor의 current external AI summary 처리 표현

보강:

- deprecated AI summary key 재도입 guard와 실패 fixture
- #1256 freeze 목록 정합화
- active legal manifest/Web lock 재생성
- 과거 immutable policy 이력은 runtime 비참조 상태로 유지

검증:

```bash
rg 'CUSTOM__AI__SUMMARY|AI Summary|AI 요약|Gemini.*summary|summary.*Gemini' .
node tools/legal/validate-privacy-data-map.mjs
node tools/test/env-contract.test.mjs
bash tools/test/homeserver-doctor.test.sh
bash tools/test/check-forbidden-tracked-files.test.sh
./gradlew -p back ciFastCheck --no-daemon
yarn --cwd front legal:check
yarn --cwd front build
```

## 최종 CD 검증

#1498 merge 후:

1. latest main required CI와 main-triggered workflow 확인
2. homeserver backend blue-green deployment가 expected SHA로 healthy인지 확인
3. Vercel production deployment가 READY이고 expected Web artifact인지 확인
4. production logs에서 summary 관련 오류 확인
5. feed/detail/SEO/JSON-LD/RSS/editor smoke
6. 증거 링크를 #1493에 첨부하고 checklist 완료 후 close
