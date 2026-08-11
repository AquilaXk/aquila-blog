# 마케팅 표면 추출 런북

> 이 문서의 `front/**` 경로는 분리 전 이력입니다. 현재 Web source 정본은
> https://github.com/AquilaXk/aquila-blog-web 이며, 아래 Web 명령은 그 저장소 루트에서 실행합니다.

회사(www)·제품(easysubway) 마케팅 표면은 블로그 앱 안에 있지만, 별도 저장소로 옮겨야 할 이유가 생기면 그날 결정으로 옮길 수 있어야 한다. 이 문서는 그 이동의 범위·경계·검증 순서를 적는다. 리포 정체성은 블로그로 유지하고, 이 문서가 요구되기 전까지 추출은 하지 않는다.

경계를 사람의 기억이 아니라 게이트가 지킨다.

- `front/.eslintrc.json`: 마케팅 모듈은 블로그 내부(`src/apis`, `src/hooks`, 다른 `src/routes`, `src/components` — `src/components/branding`만 예외)를 import할 수 없고, 블로그 코드는 마케팅 모듈을 import할 수 없다(진입점 두 파일만 예외).
- `front/scripts/check-refactor-boundaries.mjs`: 마케팅 모듈 두 디렉터리의 모든 파일과 진입점 두 개에서 모듈 지정자를 TypeScript AST로 뽑아 front 루트 기준 경로로 정규화한 뒤, 모듈이 쓸 수 있는 것만 적은 allowlist(자기 모듈, `src/design-system`, `src/styles`, `src/components/branding`, `site.config`, react·emotion 런타임)와 대조한다. 블로그 코드가 마케팅 모듈을 가져가는 역방향도 같은 정규화로 확인한다. eslint 규칙은 정적 `import` 선언만 보고 그중 `src/...` 형태만 group에 걸리므로, 상대 경로·동적 `import()`·`require()`·`src/routes/Company/../Blog` 같은 위장 경로는 이 스크립트가 막는다. 핵심 파일의 required import와 `styled.` 금지도 함께 검사하고 `prebuild`에서 자동 실행된다.

두 게이트가 초록이면 아래 "가져갈 것" 목록이 곧 추출 단위다.

## 1. 새 저장소로 가져갈 것

| 대상 | 경로 |
| --- | --- |
| 회사 표면 모듈 | `front/src/routes/Company/` |
| 제품 표면 모듈 | `front/src/routes/EasySubway/` |
| 진입점(조립 지점) | `front/src/pages/company/index.tsx`, `front/src/pages/easysubway/index.tsx` |
| 마케팅 팔레트 | `front/src/design-system/marketingPalette.ts` |
| 공개 자산 | `front/public/company/`, `front/public/easysubway/` |
| 표면 E2E | `front/e2e/smoke-site-surfaces.spec.ts`, `front/e2e/accessibility.spec.ts`의 표면 케이스 |

같이 옮겨야 하는 부수 사항.

- `marketingPalette.ts`의 정본(provenance) 주석을 그대로 가져간다. 값의 원천은 `AquilaXk/easysubway`의 `tools/design/easysubway-color-system.json`이고, 색 변경은 그 파일을 다시 받아 갱신하는 것이지 손으로 고치는 것이 아니다.
- `front/scripts/check-design-colors.mjs`가 마케팅 경로의 새 hex/rgb 리터럴을 막고 `marketingPalette.ts`만 색 정의 지점으로 허용한다. 새 저장소에서 같은 게이트를 세우지 않으면 팔레트가 곧 흩어진다.
- 마케팅 모듈이 참조하는 공유 디자인 코드(`front/src/design-system/tokens`, `front/src/design-system/focusRing`, `front/src/styles`의 `variables`)와 `front/site.config.js`의 표면 값은 블로그 소유다. 새 저장소는 필요한 부분만 복사해 자기 소유로 만든다 — 두 리포가 같은 파일을 공유하려 하면 추출의 이유가 사라진다.
- 블로그에 남는 게이트 규칙은 삭제한다: `front/.eslintrc.json`의 마케팅 override(역방향 금지 규칙, `src/routes/Company`, `src/routes/EasySubway`)와 `src/routes/**` override에 들어간 마케팅 금지 group, 그리고 `front/scripts/check-refactor-boundaries.mjs`의 마케팅 `ownershipRules`와 모듈 경계 검사(`MARKETING_MODULES`·allowlist 상수·AST 헬퍼). 파일이나 모듈 디렉터리가 사라진 채 규칙이 남으면 `readSource`/`walk`가 던져 `prebuild`가 멈춘다.

## 2. 블로그에 남는 seam

추출해도 블로그가 계속 소유하는 접합부다. 각 항목은 "그대로 둔다"가 아니라 "추출 시 무엇을 결정해야 하는가"까지 적는다.

### `front/src/libs/publicSurfaceUrl.ts`

요청 `Host`를 표면 하나로 좁혀 canonical/OG URL을 고르고, 표면 라우트에서 블로그 chrome을 끄는 판정을 제공한다. 소비처는 `front/src/layouts/RootLayout/index.tsx`(standalone 표면 라우트 판정), `front/src/pages/_document.tsx`(RSS alternate 억제), `front/src/pages/sitemap.xml.tsx`(표면 호스트에서 404), 그리고 마케팅 진입점 두 개다.

추출하면 블로그는 더 이상 표면 라우트를 서빙하지 않는다. 그러면 `CONFIG.surfaces`의 `route` 값과 standalone 판정은 소비처가 없어진다. 지울지, 아니면 canonical 링크용으로 `url`만 남길지 결정해야 한다 — 남길 근거는 블로그 푸터·본문에서 회사·제품 호스트를 절대 URL로 가리키는 링크다.

### `front/src/components/branding/BrandMark.tsx`

전사 브랜드 마크이고 블로그 헤더(`front/src/layouts/RootLayout/Header/Logo.tsx`)와 관리자 셸(`front/src/routes/Admin/AdminShell.tsx`)이 함께 쓴다. 마케팅 모듈이 유일하게 허용된 블로그 컴포넌트 의존이다. 새 저장소는 사본을 갖는다. 사본이 갈라지는 것을 막을 방법(브랜드 자산 원천을 한 곳에 두고 두 리포가 받아쓰기)을 정하지 않으면 로고가 두 개가 된다.

### Caddy vhost — `deploy/homeserver/caddy/Caddyfile`

표면 호스트는 같은 front 컨테이너를 자기 vhost로 서빙한다: `front_surface_vhost` snippet이 루트를 표면 라우트로 rewrite하고, 그 호스트의 `robots.txt`를 vhost가 직접 응답한다. `{$COMPANY_DOMAIN}`과 `{$PRODUCT_DOMAIN}`이 각각 `/company`·`/easysubway`로 들어가고, apex는 회사 호스트로 308이다.

추출 후 바뀌는 것은 upstream 하나다: 표면 vhost의 대상이 새 컨테이너가 되고 rewrite는 필요 없어진다(새 앱의 공개 페이지가 루트다). 블로그 vhost와 apex 리다이렉트는 그대로다.

### env 계약 키

`COMPANY_DOMAIN`, `PRODUCT_DOMAIN`, `APEX_DOMAIN`이 표면 호스트를 정한다. 정의는 `deploy/env/env.contract.json`, 예시는 `deploy/homeserver/.env.prod.example`·`deploy/homeserver/.env.caddy.prod.example`, 서비스별 주입은 `deploy/homeserver/materialize_service_env.sh`다.

여기에 조용한 함정이 하나 있다. `tools/test/env-contract.test.mjs`는 `COMPANY_DOMAIN`·`PRODUCT_DOMAIN`의 허용 값이 `front/site.config.js`가 컴파일해 들고 있는 표면 canonical 호스트와 같은지 대조한다. 표면 정본이 새 저장소로 옮겨가면 이 대조의 기준 파일이 이 리포에서 사라진다. 추출 시 기준을 새 리포의 정본으로 옮기거나(그 값을 이 리포에 고정값으로 명시), 계약 테스트를 함께 이동해야 한다. 그냥 두면 대조 대상이 없어진 채로 초록이 된다.

호스트 컷오버 절차 자체는 `docs/ops/homeserver-front-domain-cutover.md`가 소유한다.

## 3. 새로 계약화할 것

### 회사 소식 섹션 (프로세스 경계를 넘는 유일한 데이터)

지금은 `front/src/pages/company/index.tsx`가 같은 프로세스에서 `front/src/apis/backend/posts`의 `getPostsBootstrap({ pageSize: 3 })`을 호출해 최신 글 3건을 SSR로 채우고, 짧은 deadline을 넘기면 섹션을 비운 채 렌더한다. 추출하면 이 호출이 네트워크 경계를 넘는다. 계약은 "글 목록"이 아니라 지금 실제로 소비하는 필드와 변환에 맞춰야 한다. 아래가 그 실측이다.

- 응답 스키마: 글 하나가 `id`, `title`, `summary`, `createdTime`, `modifiedTime`, `thumbnail`을 준다. `id`는 카드 key이자 URL 조립 값이고, `summary`·`thumbnail`은 없을 수 있다. 인증 없음, 캐시 가능한 공개 읽기 엔드포인트로 내고 `contracts/public-api`의 공개 계약 동기화 대상에 넣는다.
- 정렬·개수: `order=desc`(최신순) `pageSize=3`으로 받아 앞 3건만 쓴다. 카드 번호(`01`·`02`·`03`)가 응답 순서에서 파생되므로 순서 자체가 계약이다.
- 변환 책임은 표면이 갖는다(`front/src/routes/Company/CompanyPageModel.ts`). 요약은 공백을 접고 96자에서 `…`로 자르고(`toCompanyNewsSummary`), 날짜는 `modifiedTime || createdTime`을 UTC `YYYY.MM.DD`로 찍고(`toCompanyNewsDate`, 파싱 실패는 빈 문자열), 번호는 위치+1을 두 자리로 채운다(`toCompanyNewsIndex`). 썸네일이 없으면 빈 문자열로 내려 카드가 이미지 대신 글 번호를 쓴다. 백엔드가 이 서식을 대신 만들어 주는 계약으로 바꾸지 않는다 — 새 앱이 이 변환을 그대로 가져간다.
- 카드 URL 호스트: `href`는 `${CONFIG.link}/posts/${id}`(=`BLOG_URL`)로 조립한 절대 URL이다. 소식 카드는 블로그 호스트로 나가는 이탈 링크이고, 새 앱은 그 호스트 값을 자기 설정으로 들고 있어야 한다.
- 실패·지연 정책: 소식은 선택 섹션이다. 페이지가 1.5초 deadline(`NEWS_DEADLINE_MS`)을 걸고 넘기면 빈 목록으로 렌더하며, 예외는 `loadCompanyNews`가 빈 목록으로 흡수한다. 다만 이 호출은 `signal`을 넘기지 않아 서버 SSR 스냅샷 경로를 타고, 그 경로는 요청이 실패해도 TTL 안의 스냅샷이 있으면 그 값을 돌려준다(`front/src/apis/backend/posts/PostApiRequests.ts`의 `getPostsBootstrap`). 그래서 현재 동작은 "실패=항상 빈 섹션"이 아니라 "빈 섹션 또는 직전 스냅샷"이다. 새 앱은 deadline과 스냅샷 재사용 중 무엇을 옮길지 정하고, 값과 근거를 코드 주석으로 남긴다.
- 캐시 헤더 소유자: 표면 응답 헤더는 진입점의 `getServerSideProps`가 직접 세운다 — `public, max-age=0, s-maxage=300, stale-while-revalidate=600`. 백엔드 응답 헤더가 아니다. 새 앱이 자기 표면 응답에서 같은 값을 세우고, 공개 엔드포인트 쪽 캐시 정책은 백엔드가 따로 소유한다.
- 이 계약을 실행하는 테스트: `front/tests/unit/company-news-deadline.spec.ts`(백엔드가 멈춰도 deadline 안에 빈 소식으로 렌더되고 canonical·`s-maxage=300`이 그대로 나가는지)와 `front/e2e/smoke-site-surfaces.spec.ts`의 "백엔드가 응답하지 않으면 소식 섹션은 자리를 채우지 않고 사라진다". 새 앱은 같은 두 판정을 자기 쪽 테스트로 갖는다. 없으면 카드 필드와 실패 동작은 다음 리팩토링에서 조용히 바뀐다.

제품 표면은 백엔드 데이터가 없다(`site.config` 파생 값과 정적 자산뿐). 계약화 대상이 아니다.

### robots · sitemap 호스트 분리

현재 상태는 이렇다.

- `front/public/robots.txt`는 블로그 호스트 전용이고 블로그 sitemap을 광고한다.
- 표면 호스트의 `robots.txt`는 Caddy vhost가 직접 응답하고, 루트만 색인 허용이다(`Allow: /$` + `Disallow: /`). 같은 컨테이너가 그 호스트에서 블로그 라우트도 답하기 때문에 나머지를 막는 것이다.
- `front/src/pages/sitemap.xml.tsx`는 표면 호스트에서 404다 — 한 사이트가 다른 호스트의 URL 목록을 자기 sitemap으로 광고하지 않게 하려는 것이다.

추출 후에는 새 앱이 자기 `robots.txt`와 sitemap을 소유하는 것이 정상이다. 그 앱은 자기 페이지만 서빙하므로 `Disallow: /`의 근거가 사라지고, 색인 정책을 새로 정해야 한다. 그러면 Caddy vhost의 robots 응답은 중복이 되므로 제거 여부를 함께 결정한다. 블로그 쪽 표면 호스트 404 분기는 표면 호스트가 더 이상 블로그 컨테이너로 오지 않으므로 자연히 사라진다.

## 4. 추출 후 검증 순서

앞 단계가 초록이 아니면 다음 단계로 가지 않는다.

1. **새 저장소 정적 게이트** — `yarn lint`, 색 게이트(`check-design-colors` 계열), `yarn build`. 팔레트 정본 주석과 색 게이트 allowlist 경로가 함께 옮겨졌는지 확인한다.
2. **새 저장소 표면 E2E·접근성** — 옮겨온 `smoke-site-surfaces.spec.ts`와 `accessibility.spec.ts`의 표면 케이스(회사 표면 데스크톱·모바일, 제품 표면 라이트 쿠키 포함)를 새 저장소에서 실행한다. 새 앱은 표면이 루트이므로 `/company`·`/easysubway` 경로와 canonical 기대값을 새 호스트 기준으로 고친 뒤 돌린다. 이 단계가 없으면 표면 라우트·접근성 회귀가 lint/build 초록 뒤에 그대로 남는다.
3. **Web 저장소 정적 게이트** — `yarn lint`, `yarn check:refactor-boundaries`, `yarn build`, `yarn check:bundle-size`. 마케팅 파일과 그 게이트 규칙이 함께 사라졌는지가 여기서 드러난다(규칙만 남으면 boundary 검사가 즉시 실패한다).
4. **계약·정책 게이트** — `node --test tools/test/env-contract.test.mjs`(표면 도메인 키 정본 대조가 새 기준을 가리키는지), 소식 엔드포인트를 만들었으면 백엔드 openapi 산출물로 `node tools/contracts/check-public-contracts.mjs`(공개 계약 사본이 새 엔드포인트를 담고 tracked 산출물과 일치하는지), `bash tools/guards/check-forbidden-tracked-files.sh`.
5. **Web E2E** — `yarn test:e2e:smoke`로 표면 스펙 이동/삭제가 반영되어 블로그 스모크가 표면 라우트를 더 이상 기대하지 않는지 확인하고, `yarn test:e2e:a11y`로 표면 케이스를 뺀 나머지 접근성 케이스가 그대로 초록인지 확인한다(이 명령이 `accessibility.spec.ts`를 통째로 돌리므로, 표면 케이스만 빠지고 블로그 케이스는 남았다는 것이 여기서 실측된다). 소식 계약 판정이 블로그에 남는 동안은 `yarn test:unit`도 같이 돌린다.
6. **배포 후 실측** — 표면 vhost upstream을 새 컨테이너로 바꾼 뒤 실제 URL에서 확인한다. 표면 호스트 루트 200과 canonical이 그 호스트를 가리키는지, 표면 호스트 `robots.txt`가 의도한 정책 하나만 응답하는지, apex가 회사 호스트로 308인지, 블로그 호스트의 `/company`·`/easysubway`가 404인지, 블로그 `sitemap.xml`이 200이며 표면 URL을 담지 않는지.

6번을 통과하기 전에는 추출을 완료로 보지 않는다. 마케팅 표면의 실패 양상은 대부분 "서빙은 되는데 메타가 다른 호스트를 가리킨다"처럼 조용하다.
