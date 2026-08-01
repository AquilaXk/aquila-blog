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
6. CodeRabbit이 실제 review를 남기지 못하면 저장소 review gate의 격리된 Codex Review fallback을 사용한다.
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

1. `summaryMode=MANUAL`의 non-blank manual summary
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

- Post entity와 prod/test profile versioned Flyway migration
- create/update request에 `summaryMode=AUTO | MANUAL`과 nullable summary
- write/modify 시 canonical resolve/persist
- PostDto/FeedPostDto/detail cache가 stored summary 사용
- legacy frontmatter summary explicit batch backfill
- OpenAPI/public contract snapshot 갱신

확정 API 의미:

- create의 mode 누락은 legacy 호환을 위해 non-blank summary면 `MANUAL`, 그 외 `AUTO`로 해석한다.
- 신규 create/modify/preview의 `AUTO`는 legacy frontmatter `summary:`를 정본으로 채택하지 않는다. legacy frontmatter 해석은 explicit backfill에만 한정한다.
- modify의 mode 누락은 기존 mode를 보존하고, legacy `summary=""`는 `AUTO` 재계산으로 해석한다. 이 호환은 #1497 Web 전환 완료 후 제거한다.
- `MANUAL + blank`는 400이고 `AUTO`는 기존 manual/migrated 값을 명시적으로 해제하고 재계산한다.
- 동일 `Idempotency-Key` 재시도는 최초 생성 결과를 반환하며 다른 summary payload로 기존 post를 바꾸지 않는다.

Backfill 안전성:

- startup runner를 두지 않고 인증된 explicit admin task에서만 실행한다.
- dry-run, 최대 batch size, 마지막 처리 id checkpoint를 입력으로 받고 다음 checkpoint를 응답한다.
- update는 id/nullable version/content/visibility/deleted 상태/canonical 미설정 조건을 함께 확인하며 concurrent edit나 restore는 skip한다.
- `modified_at`과 post version은 변경하지 않고 summary/content 원문은 log·event·metric label에 남기지 않는다.
- summary 변경과 공개 글 backfill 반영 후 공개 feed/search/tag/detail cache와 CDN tag를 무효화한다. 비공개·삭제 글은 raw tag를 task에 넣지 않고 관리자 목록 cache만 무효화한다.

Backfill/rollback 절차:

1. `afterId=0`, bounded `limit`, `dryRun=true`로 대상 수만 확인한다.
2. 같은 `afterId`/`limit`에 `dryRun=false`를 보내고 응답의 `nextAfterId`로 다음 batch를 재개한다.
3. `skipped > 0`이면 반환된 checkpoint부터 재시도하며 concurrent edit가 끝나기 전에는 건너뛰지 않는다.
4. 배포 rollback은 application을 이전 버전으로 되돌리고 expand-only 컬럼은 보존한다. versioned migration을 되감거나 컬럼을 즉시 drop하지 않는다.
5. backfill 결과를 되돌려야 하면 application rollback 후 canonical 컬럼을 그대로 두고 후속 migration에서만 정리한다.

완료 조건:

- canonical fields가 write transaction 안에서 event 생성 전에 확정된다.
- preview 응답은 `contentHash`, `algorithmVersion`을 포함한다.
- read DTO/cache는 저장 canonical summary만 사용하고 본문을 다시 파싱하지 않는다.
- 관리자 preview/backfill endpoint는 WebMvc slice에서 constructor wiring과 ADMIN 경계를 검증한다.
- 관리자 controller는 기존 `PostUseCase` 입력 포트를 통해 preview/backfill을 호출하고 application service 구현체를 직접 참조하지 않는다.
- migration rollback과 backfill dry-run/resume evidence를 PR에 남긴다.

Commit plan:

1. `7edba71f6` canonical provenance 계약 테스트
2. `c613ebd2b` summary source 모델
3. `7f8fde641` deterministic resolver
4. `f2ff11ed4` write persistence 회귀 테스트
5. `dcc4fe60f` canonical fields migration
6. `4ce65bf0b` Post canonical state
7. `297604519` legacy backfill 초안
8. `28b77f81b` write port contract
9. `a79affa69` write-time resolve/persist
10. `c4ab72159` API DTO 초안
11. 강화된 API mode·explicit backfill·read/preview 계약과 CI compile 보정

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
