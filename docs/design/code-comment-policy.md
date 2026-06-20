# Code Comment Policy

## 목적

코드 주석은 코드가 이미 말하는 동작을 다시 설명하지 않는다. 이 저장소의 주석은 코드만으로는 바로 드러나지 않는 결정 이유, 불변조건, 운영 영향, 호환성 제약을 남기는 용도로만 사용한다.

## 남겨야 하는 주석

- 정책 선택 이유: 같은 결과를 낼 수 있는 구현이 여러 개일 때 왜 현재 방식을 선택했는지 설명한다.
- 불변조건: 깨지면 데이터 정합성, 권한, 캐시, 배포 안전성이 흔들리는 조건을 명시한다.
- 실패 시 운영 영향: 재시도, fallback, rollback, alert, SLO에 영향을 주는 실패 모드를 설명한다.
- 호환성 임시 경로: legacy API, 구버전 데이터, 배포 순서 때문에 남긴 우회 경로와 제거 조건을 적는다.
- 보안 경계: 인증, 권한, CSP, secret, 외부 입력 검증처럼 실수하면 공격면이 되는 경계를 설명한다.

## 금지하는 주석

- 메서드명이나 코드 한 줄을 자연어로 반복하는 주석
- `처리합니다`, `조회합니다`, `설정합니다`처럼 정보가 늘지 않는 템플릿형 KDoc/JSDoc
- 실제 코드와 쉽게 드리프트나는 구현 절차 복붙
- TODO만 남기고 issue, 제거 조건, 검증 방법이 없는 임시 주석
- 리뷰 지적을 피하기 위해 의도를 포장하지만 불변조건이나 운영 영향이 없는 주석

## 좋은 예시

```kotlin
// Blue/green cutover 직후에는 old backend가 같은 digest를 계속 serving할 수 있다.
// digest가 다르면 rollback 후보를 보존하고 burn-in이 끝날 때까지 green scrape를 유지한다.
```

```ts
// Anonymous empty state must not link to /admin.
// Admin auth resolves asynchronously, so the public CTA is the safe initial state.
```

```ts
// Keep this legacy slug route until all indexed /page/* URLs return sitemap-free 404s.
// Removal requires a Search Console crawl check after deployment.
```

## 나쁜 예시

```kotlin
/** 게시글을 조회합니다. */
fun getPost(id: Long): Post
```

```ts
// 버튼을 클릭하면 필터를 초기화한다.
clearButton.onClick = resetFilter
```

```ts
// TODO: 나중에 제거
const fallbackUrl = "/admin"
```

## 리뷰 체크

코드리뷰에서 새 주석을 보면 다음 질문을 확인한다.

1. 이 주석이 없으면 정책 선택 이유나 운영 위험을 놓치는가?
2. 코드 변경 없이 주석만 틀릴 가능성이 큰 구현 설명인가?
3. 임시 경로라면 제거 조건과 검증 방법이 있는가?
4. 보안/권한/배포/캐시 경계를 설명한다면 실패 시 영향이 구체적인가?

질문 1이 아니고 질문 2에 해당하면 주석을 삭제한다. 질문 3 또는 4의 정보가 부족하면 주석을 보강하거나 issue로 추적한다.
