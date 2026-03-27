# Block Editor 전환 계획서

## 0. 현재 적용 상태

- 2026-03-27 기준 `/admin/posts/new`에는 block editor 3차 범위가 feature flag 병행 방식으로 도입되었다.
- flag:
  - `NEXT_PUBLIC_EDITOR_V2_ENABLED=false`: 기존 `textarea + preview`
  - 미설정 또는 `true`: `TipTap + ProseMirror` 기반 block editor
  - `NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED=true`: Mermaid node view + lazy preview 활성화
- 현재 v2는 `paragraph / heading / list / blockquote / link / divider / code block(language) / table / image / callout / toggle`를 직접 편집한다.
- 표는 본문 내 context toolbar로 `행/열 추가`, `헤더 토글`, `행/열/표 삭제`를 직접 지원한다.
- 콜아웃은 큰 설정 패널 대신 compact 카드 편집기로 유지하고, 종류/제목/본문/미니 preview만 노출한다.
- Mermaid는 별도 flag가 꺼져 있으면 `raw markdown block`으로 유지하고, 켜져 있으면 node view로 승격한다.
- 미지원 커스텀 문법은 문서 전체 fallback이 아니라 block-level `raw markdown block` 카드로 보존한다.
- canonical 저장 포맷은 계속 markdown string이며, 공개 상세 렌더러와 저장 API는 변경하지 않았다.
- 기본 작성 surface는 block editor이고, `고급 markdown 직접 편집`과 `공개 결과 미리보기`는 보조 disclosure로 축소되었다.
- block editor 기본 경로는 bubble toolbar, keyboard shortcut, block-level 붙여넣기 정규화, clipboard 이미지 업로드를 제공한다.

## 1. 목적

현재 `/admin/posts/new`는 `textarea + markdown preview` 구조를 사용한다. 이 구조는 다음 장점이 있다.

- markdown 원문을 그대로 저장하고 diff/복구가 쉽다
- 기존 상세 페이지 렌더 파이프라인과 잘 맞는다
- 머메이드/콜아웃/토글/테이블/코드블록을 그대로 작성할 수 있다

반면 다음 한계가 반복적으로 드러났다.

- 이미지가 본문 안에서 실제 블록처럼 보이지 않는다
- 이미지 크기/정렬/배치를 입력 surface 안에서 직접 다루기 어렵다
- preview와 editor가 분리되어 있어 사용자가 "실제 결과"를 바로 조작하는 느낌이 약하다
- 장기적으로 글 작성 경험이 기술 블로그 운영 수준을 넘기 어렵다

이번 전환의 목적은 다음 4가지를 동시에 만족하는 것이다.

- 작성 경험을 block editor 수준으로 끌어올린다
- canonical 저장 포맷은 markdown을 유지한다
- 기존 공개 렌더링(`/posts/[id]`)과 자산/캐시 체계를 최대한 재사용한다
- 머메이드/콜아웃/토글/코드블록 같은 기술 문서 문법을 잃지 않는다

## 2. 현재 구조와 제약

### 현재 구조

- 작성 입력: `front/src/pages/admin/posts/new.tsx`
- 공개/미리보기 렌더러: `front/src/libs/markdown/*`
- canonical 저장 포맷: markdown string
- 이미지 업로드: `/post/api/v1/posts/images`
- 썸네일/요약/태그/발행 설정은 작성 surface 외부 modal/surface에서 처리

### 깨면 안 되는 제약

- 저장 포맷을 HTML로 바꾸지 않는다
- 기존 게시글 markdown과 완전 호환되어야 한다
- 머메이드 fenced block, GitHub 스타일 code block, callout, toggle, table syntax를 유지한다
- 이미지 업로드 URL/보안 정책/allowlist를 그대로 재사용한다
- 상세 페이지 렌더와 작성 미리보기 결과가 최대한 동일해야 한다

## 3. 후보 비교

### 3.1 TipTap (ProseMirror 기반)

장점

- 실무 채택이 많고 ecosystem이 가장 안정적이다
- custom node/view 확장이 강하다
- 이미지 resize, drag handle, slash menu, table, code block, placeholder 등 구현 경로가 명확하다
- 장기적으로 협업/멘션/인라인 comment 같은 고급 기능 확장도 가능하다

단점

- markdown이 1급 저장 포맷은 아니다
- custom markdown parse/serialize 계층을 직접 관리해야 한다

판단

- 이 프로젝트처럼 기술 블로그용 custom block이 많은 경우 가장 현실적이다

### 3.2 Lexical

장점

- 입력 성능이 좋고 Facebook 계열 대규모 사용 사례가 있다
- custom node 구조가 유연하다

단점

- markdown/기술 문법 중심 블로그에 필요한 확장 자산이 TipTap보다 적다
- 테이블/커스텀 블록/직렬화 체계를 실무형으로 다듬는 비용이 더 크다

판단

- 일반 문서형 에디터에는 좋지만, 현재 블로그의 markdown 호환 요구에는 불리하다

### 3.3 Milkdown

장점

- markdown-first 성격이 강하다
- ProseMirror 기반이라 문서 모델이 탄탄하다

단점

- 실무 운영 관점에서 TipTap보다 ecosystem/예제가 작다
- 이미지 리사이즈, block UX, 관리자 커스텀 작업흐름까지 끌고 가기엔 확장 사례가 제한적이다

판단

- markdown 친화성은 좋지만 운영 도구/커스텀 block editor로는 TipTap보다 불리하다

## 4. 최종 권장안

### 권장 스택

- **TipTap + ProseMirror**
- 저장 포맷은 **markdown canonical 유지**
- 에디터 내부 문서 모델은 ProseMirror JSON을 사용하되, 저장/불러오기 시 markdown으로 변환

### 이유

- 사용자가 원하는 "실제 이미지를 본문 안에서 보고 드래그/리사이즈" UX를 만들기 가장 쉽다
- 기존 markdown 중심 렌더링 파이프라인을 버리지 않아도 된다
- 기술 블로그 특화 노드(mermaid/callout/toggle/code/table/image)를 custom extension으로 단계적으로 옮길 수 있다
- 운영 중 문제가 생겨도 markdown 원문 fallback이 가능하다

## 5. 문서 모델 원칙

### 5.1 저장 원칙

- DB 저장: markdown 원문
- 편집 중 메모리 상태: ProseMirror JSON
- 변환 경로:
  - `markdown -> editor document`
  - `editor document -> markdown`

### 5.2 호환 원칙

- 기존 markdown을 열었을 때 정보 손실이 없어야 한다
- editor에서 지원하지 않는 문법은 파괴하지 않고 raw markdown block으로 보존해야 한다
- 최종 저장 후 다시 불러와도 같은 의미와 레이아웃이 유지되어야 한다

## 6. 기능 범위 정의

### Phase 1에서 반드시 지원

- 제목/문단/리스트/인용
- 코드블록(language label 포함)
- 테이블
- 이미지 업로드 + 본문 inline block 렌더
- 이미지 드래그 리사이즈 + 정렬(left/center/full)
- divider
- 링크

### Phase 2에서 지원(현재 반영)

- callout (`TIP`, `INFO`, `WARNING`, `OUTLINE`, `EXAMPLE`, `SUMMARY`)
- toggle
- mermaid block
- slash command
- drag handle / block move

### Phase 3에서 지원

- keyboard shortcut 정교화
- 복붙 정규화
- block toolbar / floating toolbar
- undo/redo history 안정화

## 7. 프로젝트 맞춤 설계

### 7.1 이미지 노드

이미지 노드는 다음 메타를 가져야 한다.

- `src`
- `alt`
- `title`
- `widthPx`
- `align` (`left | center | wide | full`)

저장 markdown 예시

```md
![설명](/post/api/v1/images/posts/abc.png "캡션") {width=640 align=center}
```

규칙

- 현재 구현 중인 `{width=...}` 메타를 그대로 확장한다
- preview 리사이즈와 공개 상세 렌더가 같은 width 메타를 사용해야 한다

### 7.2 Mermaid 노드

- editor 내부에서는 진짜 diagram preview를 보여준다
- 저장은 fenced block 유지

```md
```mermaid
flowchart TD
  A --> B
```
```

규칙

- 무거운 렌더는 viewport 근처에서만 활성화
- 긴 문서는 editor에서도 collapse/placeholder fallback이 가능해야 한다

### 7.3 Callout / Toggle 노드

- 내부 문서 모델은 block node로 표현
- 저장은 기존 markdown 문법 유지

callout 예시

```md
> [!TIP]
> 핵심 포인트
```

toggle 예시

```md
:::toggle 제목
본문
:::
```

## 8. 전환 전략

### Phase 0. 준비

목표

- 현재 markdown parser/serializer를 editor 친화적으로 정리
- image width 메타, callout/toggle parsing 규칙을 공식화

작업

- `src/libs/markdown/rendering.ts`를 editor serializer 기준으로 재구성
- markdown AST test fixture 추가
- `textarea + preview` 경로를 기능 기준으로 쪼개기

종료 조건

- markdown round-trip 테스트 확보

### Phase 1. Hybrid Editor 도입

목표

- `/admin/posts/new`에 block editor를 feature flag 뒤에서 병행 도입

작업

- `front/src/components/editor/` 신규 모듈 생성
- TipTap editor shell 도입
- paragraph/heading/list/code/table/link/image/divider 우선 구현
- 이미지 업로드/리사이즈를 block editor 안으로 이동
- 저장은 markdown serializer를 통해 기존 API 재사용

종료 조건

- 일반 글 작성/수정/발행이 textarea 없이 가능

### Phase 2. 기술 문법 블록 이식

목표

- 기술 블로그 핵심 block을 모두 editor node로 이식

작업

- Mermaid node
- Callout node
- Toggle node
- code block toolbar/language picker
- slash command

종료 조건

- callout/toggle/code language picker/slash command가 block editor 기본 surface에서 직접 동작
- Mermaid는 별도 flag on 시 node view + lazy preview로 동작

### Phase 3. 기본값 전환

목표

- `textarea + preview`를 fallback 모드로 내리고 block editor를 기본 작성 surface로 전환

작업

- feature flag default 변경
- 데이터 round-trip 오류 로그 모니터링
- textarea 모드는 `고급 markdown 직접 편집`으로 축소

종료 조건

- 운영 작성 흐름의 90% 이상을 block editor 경로로 처리

## 9. feature flag 전략

권장 flag

- `NEXT_PUBLIC_EDITOR_V2_ENABLED`
- `NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED`

규칙

- 첫 배포는 관리자 본인 계정 또는 dev/staging에서만 활성화
- production default-on은 최소 2주 관찰 후 전환

## 10. 테스트 전략

### 단위 테스트

- markdown -> doc -> markdown round-trip
- image width/align serialize
- callout/toggle/mermaid serialize

### E2E

- 이미지 업로드 후 본문에 block 삽입
- 이미지 드래그 리사이즈 후 저장/재진입 유지
- mermaid/callout/toggle 작성 후 상세 페이지 동일 렌더
- iPhone 15 Pro / iPad mini / desktop에서 editor toolbar와 block interaction 정상 동작

### 성능 테스트

- `/admin/posts/new` first load JS
- editor idle memory
- 긴 글(이미지 10+, mermaid 3+, table 5+) 입력 지연

## 11. 리스크와 대응

### 리스크 1. markdown round-trip 손실

대응

- serializer snapshot test
- 저장 직전 raw diff 비교 로그
- unsupported 문법은 raw block으로 보존

### 리스크 2. 번들 증가

대응

- editor는 `/admin/posts/new` 전용 dynamic import
- Mermaid / table / slash menu도 lazy extension 분리

### 리스크 3. 모바일 interaction 불안정

대응

- iPhone 15 Pro / iPad mini E2E를 기본 회귀로 포함
- resize/pan은 pointer + touch 공통 계층으로 구현

## 12. 현재 권장 운영 범위

현재 기준으로 운영에 권장하는 범위는 다음이다.

1. `NEXT_PUBLIC_EDITOR_V2_ENABLED`는 기본 on(미설정/true)으로 운영하고, `false`를 kill-switch로 유지
2. callout/toggle/code language picker/slash command는 기본 block editor surface에 포함한다
3. Mermaid node는 `NEXT_PUBLIC_EDITOR_V2_MERMAID_ENABLED`로 별도 관찰한다
4. textarea 모드는 `고급 markdown 직접 편집` 및 kill-switch fallback 경로로만 유지한다

## 13. 결론

이 프로젝트에 가장 적합한 전환 방향은 다음이다.

- **TipTap 기반 hybrid block editor**
- **markdown canonical 저장 유지**
- **기술 블록은 custom node로 단계적 이식**
- **textarea + preview는 즉시 제거하지 않고 fallback로 유지**

즉, "CMS형 HTML 에디터로 갈아타는 것"이 아니라  
"markdown 기술 블로그를 위한 block editor를 ProseMirror 위에 올리는 것"이 가장 적절하다.
