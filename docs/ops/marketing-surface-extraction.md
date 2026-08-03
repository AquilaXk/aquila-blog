# 마케팅 표면 추출 런북

회사(www)·제품(easysubway) 마케팅 표면은 블로그 앱 안에 있지만, 별도 저장소로 옮겨야 할 이유가 생기면 그날 결정으로 옮길 수 있어야 한다. 이 문서는 그 이동의 범위·경계·검증 순서를 적는다. 리포 정체성은 블로그로 유지하고, 이 문서가 요구되기 전까지 추출은 하지 않는다.

경계를 사람의 기억이 아니라 게이트가 지킨다.

- `front/.eslintrc.json`: 마케팅 모듈은 블로그 내부(`src/apis`, `src/hooks`, 다른 `src/routes`, `src/components` — `src/components/branding`만 예외)를 import할 수 없고, 블로그 코드는 마케팅 모듈을 import할 수 없다(진입점 두 파일만 예외).
- `front/scripts/check-refactor-boundaries.mjs`: 마케팅 핵심 파일의 required/forbidden import를 검사한다. eslint 규칙은 `src/...` 형태의 import만 보므로 상대 경로 우회는 이 스크립트가 막는다. `prebuild`에서 자동 실행된다.

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
- 블로그에 남는 게이트 규칙은 삭제한다: `front/.eslintrc.json`의 마케팅 override(역방향 금지 규칙, `src/routes/Company`, `src/routes/EasySubway`)와 `src/routes/**` override에 들어간 마케팅 금지 group, 그리고 `front/scripts/check-refactor-boundaries.mjs`의 마케팅 `ownershipRules`와 상수. 파일이 사라진 채 ownership 규칙이 남으면 `readSource`가 던져 `prebuild`가 멈춘다.

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

지금은 `front/src/pages/company/index.tsx`가 같은 프로세스에서 `front/src/apis/backend/posts`의 `getPostsBootstrap`을 호출해 최신 글 3건을 SSR로 채우고, 짧은 deadline을 넘기면 섹션을 비운 채 렌더한다. 추출하면 이 호출이 네트워크 경계를 넘는다. 필요한 계약은 다음과 같다.

- 공개 읽기 엔드포인트: 제목, 요약, 날짜, 절대 URL. 인증 없음, 캐시 가능. `contracts/public-api`의 공개 계약 동기화 대상에 넣는다.
- 실패·지연 정책 유지: 소식은 선택 섹션이다. 응답이 늦으면 섹션을 비우고 페이지를 낸다. 새 앱이 이 deadline을 자기 쪽에서 다시 구현해야 하며, 값과 근거를 코드 주석으로 남긴다.
- 캐시 헤더: 현재 표면 응답은 `s-maxage`/`stale-while-revalidate`로 나간다. 새 앱도 같은 계열로 맞춰 백엔드에 요청이 몰리지 않게 한다.

제품 표면은 백엔드 데이터가 없다(`site.config` 파생 값과 정적 자산뿐). 계약화 대상이 아니다.

### robots · sitemap 호스트 분리

현재 상태는 이렇다.

- `front/public/robots.txt`는 블로그 호스트 전용이고 블로그 sitemap을 광고한다.
- 표면 호스트의 `robots.txt`는 Caddy vhost가 직접 응답하고, 루트만 색인 허용이다(`Allow: /$` + `Disallow: /`). 같은 컨테이너가 그 호스트에서 블로그 라우트도 답하기 때문에 나머지를 막는 것이다.
- `front/src/pages/sitemap.xml.tsx`는 표면 호스트에서 404다 — 한 사이트가 다른 호스트의 URL 목록을 자기 sitemap으로 광고하지 않게 하려는 것이다.

추출 후에는 새 앱이 자기 `robots.txt`와 sitemap을 소유하는 것이 정상이다. 그 앱은 자기 페이지만 서빙하므로 `Disallow: /`의 근거가 사라지고, 색인 정책을 새로 정해야 한다. 그러면 Caddy vhost의 robots 응답은 중복이 되므로 제거 여부를 함께 결정한다. 블로그 쪽 표면 호스트 404 분기는 표면 호스트가 더 이상 블로그 컨테이너로 오지 않으므로 자연히 사라진다.

## 4. 추출 후 검증 순서

앞 단계가 초록이 아니면 다음 단계로 가지 않는다.

1. **새 저장소** — `yarn lint`, 색 게이트(`check-design-colors` 계열), `yarn build`. 팔레트 정본 주석과 색 게이트 allowlist 경로가 함께 옮겨졌는지 확인한다.
2. **블로그 저장소 정적 게이트** — `yarn --cwd front lint`, `yarn --cwd front check:refactor-boundaries`, `yarn --cwd front build`, `yarn --cwd front check:bundle-size`. 마케팅 파일과 그 게이트 규칙이 함께 사라졌는지가 여기서 드러난다(규칙만 남으면 boundary 검사가 즉시 실패한다).
3. **계약·정책 게이트** — `node --test tools/test/env-contract.test.mjs`(표면 도메인 키 정본 대조가 새 기준을 가리키는지), `bash tools/guards/check-forbidden-tracked-files.sh`.
4. **E2E** — `yarn --cwd front test:e2e:smoke`. 표면 스펙 이동/삭제가 반영되어 블로그 스모크가 표면 라우트를 더 이상 기대하지 않는지 확인한다.
5. **배포 후 실측** — 표면 vhost upstream을 새 컨테이너로 바꾼 뒤 실제 URL에서 확인한다. 표면 호스트 루트 200과 canonical이 그 호스트를 가리키는지, 표면 호스트 `robots.txt`가 의도한 정책 하나만 응답하는지, apex가 회사 호스트로 308인지, 블로그 호스트의 `/company`·`/easysubway`가 404인지, 블로그 `sitemap.xml`이 200이며 표면 URL을 담지 않는지.

5번을 통과하기 전에는 추출을 완료로 보지 않는다. 마케팅 표면의 실패 양상은 대부분 "서빙은 되는데 메타가 다른 호스트를 가리킨다"처럼 조용하다.
