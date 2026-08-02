# 홈서버 front 도메인 전환 순서 (#1538 · #1575 · #1605)

> **상태: 블로그 표면 전환 완료.** `blog.aquilaxk.site`는 홈서버가 서빙한다. 아래 본문의
> "착수 시점"은 전환 착수 당시의 상태이며, 실행 기록으로 남긴다. 이전 호스팅 provider로 되돌리는
> 경로는 #1542로 닫혔다.
>
> **`www`는 폐기되지 않았다.** 폐기 결정(Locked Decision 6)은 2026-08-02 오너 결정으로 번복돼
> `www.aquilaxk.site`는 회사 표면이자 사이트 canonical이 됐다 (#1605). 이전 provider 계약 제거와
> 양립한다 — 계약은 저장소에서 사라졌고, `www`는 홈서버 Caddy의 회사 vhost가 서빙한다.

`blog.aquilaxk.site`를 Cloudflare Tunnel → Caddy → 홈서버 컨테이너로 개통하는 절차다.
front와 공개 API가 **같은 호스트**를 쓴다 — API는 별도 호스트가 아니라 이 호스트의 경로다
(#1575). 착수 시점의 `blog.aquilaxk.site`는 **Vercel**을 가리켰고, `www.aquilaxk.site`(Vercel)와
`api.aquilaxk.site`(홈서버)가 구 공개 경로로 살아 있었다.

그 다음 단계로 **같은 front 이미지가 회사·제품 표면과 apex redirect까지 서빙한다** (#1605).
`www`는 폐기 대상에서 회사 표면으로 바뀌었다 — 아래 Locked decision 절의 번복 기록을 먼저 읽는다.

- 저장소 쪽 변경(#1538): compose front 서비스, Caddy `{$WEB_DOMAIN}` vhost, env 계약.
- 회사·제품·apex vhost와 그 env 키(#1605): 6단계와 "표면 세 개와 vhost 네 개" 절.
- 경로 기반 공개 API·쿠키 위상·env 스위치(#1575): 이 문서가 그 결과다.
- blue/green 전환 로직과 `FRONT_*_IMAGE`·`BACKEND_INTERNAL_URL` 주입(#1539).
- Cloudflare Tunnel public hostname과 DNS 레코드는 **콘솔 전용 작업(오너)** 이다. 이 저장소에
  tunnel ingress 설정 파일은 없다 — compose의 `cloudflared`는
  `tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}`으로 원격 관리 tunnel을 실행한다.

## Locked decision

- **블로그** 공개 web 호스트는 `blog.aquilaxk.site` 하나다 (Epic #1535 Locked Decision 5).
- ~~`www.aquilaxk.site`는 **301 redirect 없이 완전 폐기**한다 (Locked Decision 6).~~
  **2026-08-02 오너 결정으로 번복 (#1605).** `www.aquilaxk.site`는 폐기되지 않고 **회사 소개
  표면**으로 살아나며 **사이트 canonical**이다. apex `aquilaxk.site`는 경로·query를 보존한 **308**로
  `www`에 넘긴다. 제품 소개 표면은 `easysubway.aquilaxk.site`다.

  번복 사유: 폐기 결정은 "www가 타 서비스로 넘어간다"는 전제 위에 있었다. 그 전제가 바뀌었다 —
  오너가 세 호스트(apex/www/제품)를 회수해 이 저장소의 단일 front 이미지로 서빙하기로 했다.
  그래서 `www`는 지울 대상이 아니라 만들 대상이 됐고, redirect를 금지할 이유도 사라졌다.

  이 결정이 취소한 것과 남긴 것:

  | 항목 | 폐기 결정 시절 | 현재 |
  | --- | --- | --- |
  | `www` Tunnel hostname/DNS | 6단계에서 **제거** | **유지·신설** (회사 표면) |
  | Caddy `redir` | 이 파일에 어떤 형태로도 없음 | **apex vhost 하나**가 308로 소유 |
  | front 이미지의 `https://www.aquilaxk.site` 문자열 | 산출물 게이트가 **부재를 요구** | 요구 **폐기** (아래 게이트 절) |
  | 블로그 canonical | `blog.aquilaxk.site` | 변동 없음 |
  | 인증 쿠키 스코프 | `blog.aquilaxk.site` | 변동 없음 (회사·제품 표면은 front 전용) |
- **공개 API는 별도 호스트가 아니라 `blog.aquilaxk.site`의 경로다** (2026-08-02 오너 결정,
  Locked Decision 8 대체 · #1575). `api.blog.aquilaxk.site`는 **만들 수 없다** — 2단계
  서브도메인은 Cloudflare Universal SSL 커버 밖이라 TLS handshake failure(alert 40)가 난다.
  실측:

  ```
  api.blog.aquilaxk.site  → SSL alert number 40 (handshake failure)
  blog.aquilaxk.site      → CN=blog.aquilaxk.site (정상)
  ```

  해결책은 Advanced Certificate Manager 구독뿐이고, 오너가 경로 기반을 선택했다. 경로 기반이
  보안 목표를 **더 강하게** 달성한다: front와 API가 같은 origin이라 ① 쿠키 Domain이 web 호스트
  자신이라 apex로 넓어질 경로가 사라지고 ② 공개 경로의 CORS가 통째로 없어진다.

## 경로 분리 (실측)

`blog.aquilaxk.site`에서 아래 prefix만 백엔드로 가고, 나머지는 전부 front다.

| prefix | 대상 |
| --- | --- |
| `/member/*` `/post/*` `/system/*` | 백엔드 (edge에서 read/admin upstream 분리 적용) |
| `/oauth2/*` `/login/oauth2/*` | 백엔드 (Spring OAuth2 authorization·callback) |
| `/actuator/health` `/actuator/health/*` | 백엔드 (health만 — 집계 엔드포인트와 개별 probe 둘 다. `/actuator/prometheus`는 edge에서 403) |
| 그 외 전부 | front (`/`, `/posts/*`, `/admin/*`, `/api/*` Next API routes, `/_next/*`, `/robots.txt`, `/sitemap.xml`) |

충돌 없음을 실측으로 확인했다.

- front의 `/api/*`(revalidate·backend proxy·rum)는 백엔드에 bare `/api` prefix가 없어 겹치지
  않는다.
- front 페이지 `/login`과 백엔드 callback `/login/oauth2/*`는 경로 깊이로 갈린다.
- 백엔드 `GET /`(placeholder)와 `GET /session`은 front가 쓰지 않으므로(front는
  `/member/api/v1/auth/session` 사용) 공개 라우팅에서 제외하고 내부 전용으로 남긴다.

### 내부 진입점 `http://caddy`

front 서버 사이드(SSR helper와 `/api/backend/*` proxy)는 `BACKEND_INTERNAL_URL=http://caddy`로
백엔드를 부른다(#1539). 그 주소는 **공개 web vhost가 아니라 backend 전용 vhost**에 있다 — 같은
site block이 `{$LEGACY_API_DOMAIN:legacy-api.localhost}`(host 이전 창 전용 슬롯, #1596으로 구
API 호스트 주소가 빠진 뒤 남은 유일한 host 기반 주소)와 `http://caddy`를 함께 갖고, 그 안에는
front upstream이 없다.
그래서 `Host: caddy` 요청이 front로 되돌아가는 무한 루프(front → caddy → front)가 구조적으로
불가능하다. 실측(`caddy run` + stub upstream):

```
Host: caddy  /post/api/v1/posts/tags     → back_read   (front cutover 게이트가 쓰는 경로)
Host: caddy  /member/api/v1/auth/me      → back_admin
Host: caddy  /system/api/v1/adm/health   → back_admin
Host: caddy  /actuator/prometheus        → 403
Host: caddy  /  ·  /_next/static/*       → backend (front로 떨어지는 경로 없음)
```

front blue/green cutover 게이트의 프록시 probe가 이 경로를 그대로 탄다:
`front_<colour>:3000/api/backend/post/api/v1/posts/tags` → front proxy → `http://caddy` →
`@publicReadFallback` → `{$READ_API_UPSTREAM}`. 이 경로가 끊기면 front 배포가 막힌다(의도된
게이트다).

**`CF-Connecting-IP`는 이 주소에서 신뢰하지 않는다.** compose 네트워크의 아무 컨테이너나
`http://caddy`에 도달할 수 있어 헤더가 호출자 통제 하에 있고, 그대로 믿으면 audit log와
rate-limit 버킷의 client IP가 위조된다. `(edge_client_ip_capture)` snippet이 그 주소에서만
peer 주소로 대체한다. 실측: `Host: caddy`로 `CF-Connecting-IP: 203.0.113.9`를 위조해 보내면
upstream은 peer 주소를 받고, 같은 위조를 공개 호스트로 보내면 기존대로 전달된다.

### slug 예약어

**백엔드 slug 검증은 추가하지 않는다. 추가할 대상이 없기 때문이다.**

이 블로그의 글에는 slug 필드가 없다. 공개 URL은 `/posts/<numeric id>`이고
(`front/src/libs/utils/postPath.ts`의 `toCanonicalPostPath`), 루트의 `[slug]` catch-all은
레거시 URL 리다이렉트 전용이다 — `extractPostIdFromLegacySlug`가 `-`로 끊은 마지막 토큰을
양의 정수로 파싱하지 못하면 그대로 404다. 따라서 `member`·`post`·`system`·`session`·
`actuator`·`oauth2` 같은 값은 애초에 도달 가능한 콘텐츠 경로가 아니고, 거부할 입력이 존재하지
않는다. 나중에 사용자 지정 slug를 도입하면 그때 위 표의 prefix를 예약어로 막아야 한다.

## 선행 조건

### 1. 카카오 콘솔 callback 등록 (오너, 콘솔)

`https://blog.aquilaxk.site/login/oauth2/code/kakao`를 **추가**한다.

> ⚠️ **교체가 아니라 추가다.** 콘솔 저장이 기존 항목을 대체해 버린 사고 이력이 있다. 기존
> 항목(`https://api.aquilaxk.site/login/oauth2/code/kakao` 등)을 지우지 말고 새 항목을 함께
> 남긴다. 구 항목 정리는 전환이 끝난 뒤 별도로 한다.

`back/src/main/resources/application.yaml`의 `redirect-uri`가 `${custom.site.backUrl}` 파생이라
`CUSTOM_PROD_BACKURL`을 바꾸는 순간 애플리케이션은 새 URI를 보낸다. 콘솔 등록을 확인하기 전에는
아래 전환 순서 3단계를 시작하지 않는다.

### 2. front 이미지 산출물 게이트

`NEXT_PUBLIC_*`는 **빌드 시점에 번들로 인라인**된다. `ENV`는 builder 스테이지를 넘지 않아
런타임 컨테이너에서 `printenv`로는 좋은 이미지와 나쁜 이미지를 구분할 수 없다(둘 다 빈 출력 +
`exit 1`). **산출물을 봐야 한다.**

```bash
docker run --rm --entrypoint sh ghcr.io/aquilaxk/aquila-blog-front@sha256:<digest> -c '
  fail=0
  grep -rq "https://blog\.aquilaxk\.site" /app/.next || { echo "FAIL: public site URL is not inlined"; fail=1; }
  if grep -rq "https://api\.blog\.aquilaxk\.site" /app/.next; then echo "FAIL: cross-host API URL is inlined"; fail=1; fi
  exit "$fail"
'; echo "gate exit=$?"   # 0이어야 쓸 수 있다
```

> **`https://www.aquilaxk.site` **부재** 조건은 2026-08-02에 제거했다 (#1605).** www는 이제 폐기
> 대상이 아니라 회사 표면이자 사이트 canonical이고, 그 문자열은 `front/site.config.js`의 표면
> 표에 있어 **정상 이미지에도 반드시 인라인된다.** 조건을 그대로 두면 모든 새 이미지가 반려된다.
>
> 그 조건이 걸러내던 위험(폐기 호스트를 광고하는 이미지)은 이제 존재하지 않는다. 대신 회사·제품
> 표면의 canonical은 빌드 시점 값이 아니라 **요청 호스트**로 계산되므로
> (`front/src/libs/publicSurfaceUrl.ts`), 이미지 문자열 검사로 확인할 대상이 애초에 아니다.

> ⚠️ **`set -e` + `! grep ...` 형태로 쓰지 마라. 부정 조건이 둘 이상이면 통과 판정이 거짓이 된다.**
> POSIX `set -e`는 `!`로 시작하는 pipeline에 적용되지 않고, 스크립트 종료 코드는 마지막 명령의
> 것이다. 따라서 부정 조건이 여러 개면 **마지막 하나만** 실제로 게이트로 동작한다.
>
> 이 함정은 #1575가 게이트를 고쳐 쓰면서 부정 조건이 둘이 되는 순간 처음 드러났다. `if` 형태로
> 쓰면 개수와 무관하게 성립하므로 그 형태를 유지한다. 실측(stub `.next`):
>
> ```
> 이미지                          이전 형태   부정 2개로 단순 치환   이 문서의 if 형태
> pre-#1540 (www만 광고)           반려        반려                   반려
> #1555~#1575 (api.blog 포함)      통과(당시 정상)  통과 ← 새 결함      반려
> #1575 이후 (same-origin)         반려(당시 정상)  반려                통과
> ```
>
> 부정 조건은 #1605에서 하나(`api.blog` 부재)로 줄었지만, 조건을 다시 늘릴 때 같은 함정을 밟지
> 않도록 `if` 형태를 그대로 둔다.

두 조건이 각각 무엇을 걸러내는지:

| 조건 | 반려되는 이미지 |
| --- | --- |
| `https://blog.aquilaxk.site` **존재** | ARG 기본값이 빈 문자열이던 시절 빌드 — `site.config.js`의 `isProd`가 false로 굳고 블로그 canonical/OG URL이 틀린다 |
| `https://api.blog.aquilaxk.site` **부재** | #1555~#1575 사이 빌드 — 브라우저가 **존재할 수 없는 호스트**(TLS alert 40)로 XHR한다. #1575 이전 게이트는 이 문자열을 반대로 *요구*했으므로, 그 시절 게이트를 그대로 쓰면 새 이미지가 전부 반려된다 |
| ~~`https://www.aquilaxk.site` **부재**~~ | **폐기 (#1605).** www는 회사 표면이자 사이트 canonical이므로 정상 이미지에도 들어 있다 |

실측(같은 트리에서 `front/Dockerfile.runtime`을 두 번 빌드):

```
좋은 이미지 = ARG 기본값 그대로            → gate exit=0
나쁜 이미지 = --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.blog.aquilaxk.site
                                          → FAIL: cross-host API URL is inlined / gate exit=1

번들이 실제로 광고하는 호스트
  좋은 이미지: https://blog.aquilaxk.site
  나쁜 이미지: https://blog.aquilaxk.site, https://api.blog.aquilaxk.site
```

`NEXT_PUBLIC_BACKEND_URL`과 `NEXT_PUBLIC_SITE_URL`은 둘 다 `https://blog.aquilaxk.site`이며,
두 값이 갈라지면 브라우저 요청이 다시 cross-origin이 되고 edge에는 그 origin을 허용하는 CORS가
더 이상 없다. 계약 테스트가 이 등식을 고정한다(`tools/test/env-contract.test.mjs`,
`front/scripts/env/env-contract.test.mjs`).

**이 등식은 #1605 이후에도 그대로다.** 한 이미지가 세 호스트를 서빙하지만 `NEXT_PUBLIC_*`은 빌드
시점 값 하나뿐이고, 그 값은 **블로그 표면**의 것이다. 회사·제품 표면은 브라우저에서 백엔드를 부르지
않으므로 `NEXT_PUBLIC_BACKEND_URL`이 블로그 호스트를 가리키는 것이 문제가 되지 않고, 두 표면의
canonical/OG는 SSR에서 **요청 호스트**로 계산된다(`front/src/libs/publicSurfaceUrl.ts`). 그래서
빌드 인자를 호스트별로 갈라야 할 이유가 없다 — 갈랐다면 호스트마다 다른 이미지가 필요해지고
blue/green 전환이 호스트 수만큼 늘어난다.

`isProd`(GA·web-vitals 게이트)도 같은 이유로 바꾸지 않았다. 판정 기준은 주입된 SITE_URL이 블로그
정본과 같은지이며, 세 호스트가 한 이미지를 공유하므로 판정 결과도 하나다. GA는 현재
`CONFIG.googleAnalytics.enable=false`로 꺼져 있어 어느 호스트에서도 전송이 없다.

## 표면 세 개와 vhost 네 개 (#1605)

| 호스트 | env 키 | vhost가 하는 일 | 백엔드 경로 |
| --- | --- | --- | --- |
| `blog.aquilaxk.site` | `WEB_DOMAIN` | 블로그 표면 + 경로 기반 공개 API | **있음** (`backend_edge_gates`) |
| `www.aquilaxk.site` | `COMPANY_DOMAIN` | front 전용. `/` → `/company` rewrite | 없음 |
| `easysubway.aquilaxk.site` | `PRODUCT_DOMAIN` | front 전용. `/` → `/easysubway` rewrite | 없음 |
| `aquilaxk.site` | `APEX_DOMAIN` | 경로·query 보존 **308** → `{$COMPANY_DOMAIN}` | 없음 |

- 회사·제품 vhost는 **`(front_surface_vhost)` snippet 하나**를 route 인자만 바꿔 import한다. 두
  호스트에 몸통을 복사하면 캐시 floor나 robots 정책이 한쪽에서만 조용히 사라진다.
- **백엔드 경로는 blog vhost에만 둔다.** 공개 API는 그 호스트의 경로이고 인증 쿠키도 그 호스트에
  스코프돼 있다(#1575). 회사·제품 호스트에 백엔드 prefix를 실으면 쿠키를 apex까지 넓히거나, 그
  호스트에서 쓸 수 없는 세션을 발급하게 된다.
- **robots.txt는 각 표면의 vhost가 응답한다.** `front/public/robots.txt`는 블로그 호스트의 파일이고
  블로그 sitemap을 광고하므로, 그대로 나가면 회사·제품 표면이 남의 URL 목록을 자기 것으로 광고한다.
  표면 vhost는 `Allow: /$` + `Disallow: /`로 루트만 색인 대상에 둔다 — 같은 컨테이너가 그 호스트에서
  블로그 라우트도 200으로 응답하기 때문에, 열어 두면 블로그가 두 번째 호스트로 중복 색인된다.
  같은 이유로 `/sitemap.xml`은 표면 호스트에서 404다(`front/src/pages/sitemap.xml.tsx`).
- 세 키는 모두 **optional + `.localhost` 기본값**이다. Tunnel hostname을 열기 전까지 어떤 신규
  호스트도 공개되지 않는다. 대신 **빈 값은 계약이 거부한다** — Caddy의 `{$VAR:default}`는 변수가
  unset일 때만 기본값을 쓰므로, `KEY=`는 주소를 `http://`로 붕괴시켜 host matcher 없는 :80
  catch-all을 만든다.
- 세 키는 서로, 그리고 나머지 Caddy site address 키(`WEB_DOMAIN`, 전환 창 전용
  `LEGACY_API_DOMAIN`, 모니터링 세 호스트)와 **달라야 한다.** site address가 겹치면 404가
  아니라 caddy가 기동하지 못하고 edge 전체가 내려간다. 계약의 `allDistinct` crossCheck가 집합으로
  막는다(`mustDifferFrom`은 쌍 비교라 집합을 닫지 못한다).
- `APEX_DOMAIN`만 있고 `COMPANY_DOMAIN`이 없으면 apex가 `company.localhost`로 308한다 — 설정은
  통과하는데 방문자에게는 죽은 사이트다. 계약의 `requiresKey`가 짝을 강제한다.

커밋 대조가 필요하면 같은 방식으로 본다(`NEXT_PUBLIC_AQUILA_BUILD_SHA`도 인라인된다):

```bash
docker run --rm --entrypoint sh ghcr.io/aquilaxk/aquila-blog-front@sha256:<digest> \
  -c 'grep -rhoE "aquila-build-sha[^0-9a-f]+[0-9a-f]{40}" /app/.next | head -1'
```

## 전환 순서

구 hostname 제거는 **항상 마지막**이다. `blog.aquilaxk.site`는 이 블로그의 신규 공개 호스트이므로
**cutover는 그 DNS 전환 한 번뿐**이고, 구 `www`·`api` 호스트는 그때까지 그대로 둔다.

1. **선행 조건 두 가지를 끝낸다** (카카오 콘솔 등록, 쓸 digest의 산출물 게이트 통과).

2. **홈서버 env에 front 키를 넣고 front를 기동한다.** `HOME_SERVER_ENV`에 추가한다.

   - `FRONT_BLUE_IMAGE=ghcr.io/aquilaxk/aquila-blog-front@sha256:...` (digest 전용)
   - `FRONT_GREEN_IMAGE=...` — **`FRONT_BLUE_IMAGE`와 같은 digest를 그대로 적는다.** 프로필을
     켜면 두 색깔이 모두 필요하고, compose는 image가 빈 서비스를
     `neither an image nor a build context`로 거부한다. 두 digest가 갈라지는 것은 cutover
     시점(#1539가 새 색깔에만 새 digest를 넣는다)이며 `BACK_*_IMAGE`가 이미 같은 방식이다.
   - `BACKEND_INTERNAL_URL` — front 서버 사이드(SSR helper와 `/api/backend/*` proxy)가 쓰는
     compose 내부 진입점이다. **없으면 front가 모든 SSR 경로에서 500이면서 컨테이너는 healthy로
     보고된다**(healthcheck가 정적 파일만 서빙한다). 값과 그 근거는 #1539 소관이다.
   - `COMPOSE_PROFILES`에 `front` 추가 (기존 값이 `runtime-split`이면 `runtime-split,front`)

   **`WEB_DOMAIN`과 `CUSTOM_PROD_BACKURL`은 여기서 건드리지 않는다.** 두 값은 3단계에서
   **함께** 들어간다. env 계약의 `urlHostEquals(CUSTOM_PROD_FRONTURL, WEB_DOMAIN)`은 두 값이
   모두 있고 서로 다르면 error이고, 이 검증은 `deploy.yml`의 `Validate HOME_SERVER_ENV contract`
   단계에서 돈다 — 먼저 넣으면 **백엔드 핫픽스를 포함한 모든 배포가 잠긴다.** 이 단계에서 web
   vhost 주소는 `web.localhost` 기본값이라 `blog.aquilaxk.site`를 매치하지 않는다.

   기동 검증 (Tunnel hostname이 아직 없어 공개 트래픽은 오지 않는다):

   ```bash
   docker compose ps
   docker inspect --format '{{.State.Health.Status}}' <front 컨테이너>   # healthy
   # healthy는 정적 서빙만 증명한다. SSR이 실제로 도는지는 여기서 직접 본다.
   docker compose exec -T front_blue wget -qS -O /dev/null http://127.0.0.1:3000/ 2>&1 | head -3
   docker compose exec -T front_blue printenv BACKEND_INTERNAL_URL
   ```

   `/`가 200이 아니거나 `BACKEND_INTERNAL_URL`이 비어 있으면 **3단계로 넘어가지 않는다.**

3. **env 스위치를 한 배포로 넘긴다.** `HOME_SERVER_ENV`에서 아래 **네 값을 함께** 바꾼다.
   **하나라도 빠지면 배포가 `validate-env`에서 멈춘다** (아래 실측 참고).

   - `CUSTOM_PROD_BACKURL=https://blog.aquilaxk.site` — **topology 스위치다.** `deploy.yml`이 이
     값의 **host**에서 `WEB_DOMAIN`·`ADMIN_EMBED_ORIGINS`·`PUBLIC_EDGE_PROBE_BASE_URL`·
     `CUSTOM__REVALIDATE__URL`을 파생해 `.env.prod`에 핀한다.
   - `CUSTOM_PROD_FRONTURL=https://blog.aquilaxk.site`
   - `CUSTOM_PROD_COOKIEDOMAIN=blog.aquilaxk.site`

     이 둘은 **오너가 스위치와 한 세트로 직접 갱신한다.** 계약이 이 둘만은 `pinnedByDeploy`가
     아니라 **error**로 대조한다 — 인증 쿠키 스코프를 정하는 값이라, deploy가 조용히 덮어쓰는
     대신 오너가 명시적으로 옮기게 두는 쪽을 택했다.
   - `WEB_DOMAIN=blog.aquilaxk.site` — 스위치가 same-origin 위상에 닿는 순간 계약이 이 키를
     필수로 만든다(`requiredWhen`은 **host 비교**라 후행 슬래시·대문자로 게이트가 조용히 닫히지
     않는다). 빠뜨리면 공개 도메인만 404가 되는 대신 배포가 멈춘다.

   실측(`validate-env`를 전환 전 시크릿 형태에 적용):

   ```
   전환 전 그대로                                        → ok=true  (전환 안내 warning 1건)
   스위치 + WEB_DOMAIN 둘만                              → ok=false
       CUSTOM_PROD_FRONTURL: WEB_DOMAIN must match CUSTOM_PROD_FRONTURL host
       CUSTOM_PROD_COOKIEDOMAIN: must be the cookie domain declared for ...
       CUSTOM_PROD_FRONTURL: host must be the web host declared for ...
   위 네 값 전부                                          → ok=true  (교체 예정 warning 2건)
   ```

   `API_DOMAIN`은 이 단계에서 **그대로 `api.aquilaxk.site`로 둔다.** 구 web origin이 아직 그
   호스트로 백엔드를 부르는 동안 살아 있어야 하기 때문이다. 이 키는 7단계에서 저장소 계약과 함께
   사라진다(#1596).

   나머지 front 파생 키는 **오너가 만질 필요가 없다.** 단 `ADMIN_EMBED_ORIGINS`는 이 배포에서
   `https://blog.aquilaxk.site` 하나로 좁혀진다 — 배포 전 `validate-env`가 제거되는 origin을
   이름으로 경고한다.

   > ⚠️ **이 배포 직후부터 4단계까지, 구 `www` origin과 (아직 Vercel을 가리키는) `blog`
   > origin의 로그인이 둘 다 성립하지 않는다.**
   > 백엔드는 요청 호스트와 무관하게 `Domain=blog.aquilaxk.site`로 쿠키를 굽고
   > (`back/.../Rq.kt`의 `builder.domain(cookieDomain)`에 호스트 조건이 없다), 브라우저는
   > RFC 6265 §5.3으로 그 쿠키를 거부한다. `blog`도 마찬가지다 — 이 시점의 blog는 아직 Vercel이
   > 서빙하고 그 프론트는 구 API 호스트를 부르므로, 쿠키 Domain이 blog로 바뀌어도 그 응답은
   > 구 호스트에서 오기 때문에 브라우저가 거부한다. OAuth redirect-uri도 이미 blog(=Vercel)로
   > 바뀌어 콜백이 홈서버에 닿지 않는다. 두 origin 모두 남는 것은 **공개 GET뿐**이다.
   > 그래서 3단계와 4단계는 **연달아** 수행한다.

4. **`blog.aquilaxk.site` DNS/Tunnel public hostname을 만든다 (오너, 콘솔).**

   - `blog.aquilaxk.site` → `http://caddy:80`

   > ⚠️ **3단계보다 먼저 하지 마라.** `WEB_DOMAIN`이 아직 없으면 web vhost 주소는
   > `web.localhost`라 `blog.aquilaxk.site`를 매치하는 vhost가 하나도 없고, 그때 Caddy는 404가
   > 아니라 **`200` + 빈 본문**을 준다(실측). 방문자에게는 "빈 페이지"가 나가고 Cloudflare가
   > 그 200을 캐시할 수도 있다 — 에러로 드러나지 않는다.

   기존 레코드가 Vercel을 가리키고 있으므로 이 작업이 곧 cutover다. 구
   hostname(`www.aquilaxk.site`, `api.aquilaxk.site`)은 이 단계에서 **그대로 둔다.**

5. **확인.** 아래 "개통 확인"이 전부 green이어야 한다. 신 호스트 기준으로 판정한다 — 구 호스트는
   라우팅만 살아 있으므로 인증 경로를 여기서 기대하지 않는다.

6. **(5)가 green인 뒤에** 회사·제품·apex 표면을 연다 (#1605). **`www.aquilaxk.site` 제거 단계는
   폐기됐다** — Locked Decision 6 번복으로 그 호스트는 지울 대상이 아니라 회사 표면이 됐다.

   순서는 **env 먼저, hostname 나중이다.** hostname을 먼저 열면 그 Host를 매치하는 vhost가 없어
   Caddy가 404가 아니라 **`200` + 빈 본문**을 주고, Cloudflare가 그 200을 캐시할 수도 있다(4단계의
   같은 경고).

   1. `HOME_SERVER_ENV`에 세 값을 넣고 배포한다. 세 값은 서로, 그리고 나머지 site address
      키(`WEB_DOMAIN`, 전환 창 전용 `LEGACY_API_DOMAIN`, 모니터링 세 호스트)와 달라야 하며,
      `APEX_DOMAIN`은 `COMPANY_DOMAIN` 없이 넣을 수 없다(계약이 둘 다 막는다).

      - `COMPANY_DOMAIN=www.aquilaxk.site`
      - `PRODUCT_DOMAIN=easysubway.aquilaxk.site`
      - `APEX_DOMAIN=aquilaxk.site`

   2. 배포가 green이면 Tunnel public hostname 셋을 만든다 (오너, 콘솔). 셋 다 `http://caddy:80`이다.
   3. 아래 "표면 개통 확인"을 실행한다.

   > ⚠️ 이 단계는 블로그 표면의 라우팅·쿠키·API 경로를 **하나도 건드리지 않는다.** 신규 vhost는
   > 자기 Host만 매치하고 front upstream만 갖는다. 그래서 롤백도 블로그와 무관하게, 세 env 줄을
   > **지우고**(비우지 말고) 재배포하는 것으로 끝난다.

7. 구 API 호스트를 접는다. **순서가 런북의 다른 단계와 반대다 — 저장소가 먼저다** (#1596).

   **6단계와 서로 독립이다.** "(6)이 green인 뒤에"라는 원래 제약은 6단계가 `www` 제거였을 때
   나온 것이고, Locked Decision 6 번복으로 6단계가 표면 개통으로 바뀌면서 그 의존은 사라졌다 —
   구 API 호스트와 회사·제품·apex 표면은 겹치는 호스트도 vhost도 없다. 실제로 아래 1의 저장소
   변경은 6단계보다 먼저 병합됐다.

   1. 저장소 PR(#1596)을 먼저 병합한다 — **완료.** 그 변경이 `deploy.yml`의 배포 후 공개 검증을 `WEB_DOMAIN` 기준으로
      옮기고, Caddyfile의 `{$API_DOMAIN}` 주소와 `API_DOMAIN` 키·파생(materialize allowlist,
      doctor, blue/green·steady-state·status probe, env 계약)을 제거한다.
   2. 그 커밋으로 배포가 green인지 확인한다.
   3. **그 다음** `api.aquilaxk.site`의 Tunnel public hostname과 DNS 레코드를 제거한다(오너/코디네이터,
      콘솔). 마지막으로 `HOME_SERVER_ENV`에서 `API_DOMAIN` 줄을 지운다 — 이 시점에는 아무도 읽지
      않는 값이다.

   반대 순서로 하면 콘솔에서 hostname을 지운 직후의 배포가 여전히 구 호스트를 때리는 게이트에서
   깨진다. 두 단계를 다 미루면 검증이 구 호스트에 남아, 아무도 안 보는 사이 배포가 green으로
   통과한다.

   > ⚠️ **지우는 것은 주소이지 vhost가 아니다.** 그 site block은 `http://caddy` 내부 진입점을
   > 함께 갖고 있고(#1539), front 서버 사이드(SSR·`/api/backend/*` proxy)가 백엔드에 닿는 유일한
   > 경로다. vhost를 통째로 지우면 front가 모든 SSR 경로에서 죽는다.

   **1과 3 사이(전환 창)에 구 호스트는 "매치되는 vhost 없음" 상태가 된다.** Caddy는 그때 404가
   아니라 **`200` + 빈 본문**을 준다. 실측(`caddy run` + #1596 이후의 Caddyfile, `WEB_DOMAIN` 설정):

   ```text
   Host: api.aquilaxk.site   /actuator/health/readiness  → 200, 0 bytes  (매치 vhost 없음)
   Host: api.aquilaxk.site   /post/api/v1/posts/feed     → 200, 0 bytes, CORS 헤더 없음
   Host: caddy               /actuator/health/readiness  → 502           (내부 진입점 → 백엔드)
   Host: blog.aquilaxk.site  /actuator/health/readiness  → 502           (web vhost → 백엔드)
   ```

   502는 이 실측이 upstream 없이 Caddy만 띄운 결과다 — 중요한 것은 **구 호스트만 빈 200으로
   갈라진다**는 점이다. blog cutover가 이미 끝나 구 호스트를 부르는 정상 소비자는 없으므로 이
   상태를 수용하고, 3단계에서 hostname 자체를 없앤다.

   `LEGACY_API_DOMAIN`은 **이 전환의 공개 DNS/Tunnel 작업에는 쓰지 않는다** — 떠나는 구 API
   호스트가 `API_DOMAIN`이고 두 번째 주소로 남길 대상이 없기 때문이다. 그러나 **키 자체는
   계약(`deploy/env/env.contract.json`), Caddyfile의 site address 슬롯, `materialize_service_env.sh`
   의 caddy allowlist에 그대로 유지한다.** 다음 host 이전 때 구·신 주소를 동시에 살려 두는 수단이
   그것뿐이므로, 지우면 안 된다. 운영값(`HOME_SERVER_ENV`)에서 unset인 것이 정상 상태다.

   > ⚠️ 전환 창 키를 닫을 때는 **줄을 비우지 말고 지운다.** `KEY=`(빈 값)은 unset이 아니라 빈
   > 문자열로 보간돼 vhost 주소가 `http://`가 되고, `caddy adapt` 실측 결과 그 site의 host
   > matcher가 통째로 사라져 :80 catch-all이 된다. env 계약이
   > `must be removed entirely rather than set to an empty value`로 막지만, 그 전에 알고 있어야
   > 한다.
   >
   > ⚠️ #1596 이후 **`WEB_DOMAIN`이 없는 위상은 배포되지 않는다.** `blue_green_deploy.sh`의
   > `require_nonempty_env_key "WEB_DOMAIN"`이 먼저 막고, `deploy.yml`도 `missing_web_domain`으로
   > 멈춘다. 배포 후 공개 검증이 때릴 호스트가 그 값 하나뿐이라, 없으면 검증 없이 green이 된다.
   > 아래 Rollback 표의 "3단계 되돌리기" 행은 그래서 현재 성립하지 않는다.

## 개통 확인

```bash
# front: 보안 헤더 7종이 next.config.js 정의 그대로 관측되는지
curl -sSI https://blog.aquilaxk.site/ \
  | sed -n '1p;/^[Xx]-/p;/^[Ss]trict/p;/^[Cc]ontent-[Ss]ecurity/p;/^[Rr]eferrer/p;/^[Pp]ermissions/p'

# 정적 자산 장기 캐시
curl -sSI "https://blog.aquilaxk.site/_next/static/<실제 asset 경로>" | grep -i cache-control

# SEO 진입점. front/public/robots.txt는 tracked 정적 파일이고 postbuild가 next-sitemap을 스킵하므로
# 빌드가 이 값을 갱신하지 않는다. 아래 응답은 front가 서빙한 그 파일이어야 한다: `Allow: /`와
# `Sitemap: https://blog.aquilaxk.site/sitemap.xml` 줄이 보여야 하고, backend vhost가 쓰는
# `Disallow: /`가 보이면 라우팅이 backend로 샌 것이라 블로그 전체가 색인에서 빠진다.
# doctor.sh의 robots 점검이 같은 기준으로 WARN을 낸다.
curl -sS https://blog.aquilaxk.site/robots.txt
curl -sS -o /dev/null -w "sitemap=%{http_code}\n" https://blog.aquilaxk.site/sitemap.xml

# 경로 라우팅: 같은 호스트에서 front와 백엔드가 갈리는지
curl -sS https://blog.aquilaxk.site/actuator/health/readiness
curl -sS -o /dev/null -w "feed=%{http_code}\n" \
  "https://blog.aquilaxk.site/post/api/v1/posts/feed?page=1&pageSize=1&sort=CREATED_AT"
# /actuator/prometheus는 백엔드로 가지 않는다 (web에서는 front 404)
curl -sS -o /dev/null -w "prom_web=%{http_code}\n" https://blog.aquilaxk.site/actuator/prometheus

# 백엔드 응답에 API 보안 헤더가 붙는지 (front 응답 헤더와 섞이지 않아야 한다)
curl -sSI https://blog.aquilaxk.site/actuator/health/readiness \
  | sed -n '/^[Ss]trict/p;/^[Xx]-[FfCc]/p;/^[Rr]eferrer/p;/^[Pp]ermissions/p'

# same-origin이므로 공개 경로에 CORS 헤더가 필요 없다. 있으면 설정이 남아 있는 것이다.
# `grep ... || echo` 형태로 쓰지 마라 - 헤더가 있든 없든 최종 종료 코드가 0이라, 자동 검증에
# 넣으면 CORS 회귀가 게이트를 그대로 통과한다.
if curl -sSI -H 'Origin: https://blog.aquilaxk.site' \
  "https://blog.aquilaxk.site/post/api/v1/posts/feed?page=1&pageSize=1&sort=CREATED_AT" \
  | grep -qi '^access-control-allow-origin:'; then
  echo "FAIL: same-origin 경로에 CORS 헤더가 남아 있다"; false
else
  echo "no CORS (expected)"
fi

# OAuth 시작 URL이 같은 호스트로 나가는지 (redirect_uri 파라미터 확인)
curl -sSI https://blog.aquilaxk.site/oauth2/authorization/kakao | grep -i '^location'

# 로그인 왕복: Set-Cookie 스코프를 **실제 로그인 응답에서** 본다. 아래처럼 미인증 GET을 찔러
# 보는 것으로는 Set-Cookie 자체가 안 나와 `|| true`로 조용히 통과한다 - 검사가 아니라 소음이다.
# 브라우저로 카카오 로그인을 완료한 뒤 DevTools > Network에서 콜백 응답의 Set-Cookie를 읽거나,
# 아래처럼 관리자 로그인 왕복으로 받는다.
# 비밀번호를 명령행 인자로 넘기지 않는다: 셸 history와 프로세스 목록에 그대로 남는다.
# read -s로 받아 stdin으로만 전달하고, 끝나면 변수를 지운다.
read -rp 'admin email: ' ADMIN_EMAIL
read -rsp 'admin password: ' ADMIN_PASSWORD; echo
printf '{"email":"%s","password":"%s"}' "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" \
  | curl -sS -i -X POST https://blog.aquilaxk.site/member/api/v1/auth/login \
      -H 'Content-Type: application/json' --data-binary @- \
  | grep -i '^set-cookie' \
  || { echo "FAIL: no Set-Cookie in the login response"; false; }
unset ADMIN_PASSWORD ADMIN_EMAIL
# 판정: Domain 속성이 없거나 Domain=blog.aquilaxk.site 여야 한다.
#       aquilaxk.site 또는 www가 보이면 즉시 롤백한다 (Rollback 표 3단계 행).

# 구 API hostname 폐기 확인 (7번 이후)
dig +short api.aquilaxk.site
# 7단계 1(저장소 병합)과 3(콘솔 제거) 사이에는 이 호스트가 200 + 빈 본문을 준다. 매치되는
# vhost가 없을 때 Caddy가 주는 응답이며, 404가 아니라는 점을 알고 봐야 한다.
#
# `curl -I`(HEAD)로 보지 마라 - HEAD 응답에는 원래 본문이 없어서 "빈 200"과 정상 응답을
# 구분할 수 없다. GET으로 보내고 내려받은 바이트 수를 함께 읽는다.
curl -sS --max-time 10 -o /dev/null -w 'status=%{http_code} bytes=%{size_download}\n' \
  https://api.aquilaxk.site/actuator/health/readiness
# 판정: status=200 bytes=0 이면 아직 우리 Caddy에 도달하지만 어떤 vhost도 매치하지 않는
#       전환 창 상태다. 3단계(hostname·DNS 제거)가 끝나면 이 호스트는 아예 해석되지 않는다.
```

## 표면 개통 확인 (6번 이후 · #1605)

```bash
# 회사·제품 표면은 각자 호스트의 루트에서 200이어야 한다 (Caddy가 rewrite한다).
curl -sS -o /dev/null -w "company=%{http_code}\n" https://www.aquilaxk.site/
curl -sS -o /dev/null -w "product=%{http_code}\n" https://easysubway.aquilaxk.site/

# canonical은 요청 호스트의 루트여야 한다. 경로(/company)가 보이면 호스트 판정이 어긋난 것이다.
curl -sS https://www.aquilaxk.site/ | grep -o '<link rel="canonical"[^>]*>'
curl -sS https://easysubway.aquilaxk.site/ | grep -o '<link rel="canonical"[^>]*>'

# apex는 경로와 query를 보존한 308이어야 한다. Location이 루트로 붕괴하면 {uri}가 빠진 것이다.
curl -sSI "https://aquilaxk.site/posts/1?utm_source=x" | sed -n '1p;/^[Ll]ocation/p'

# 표면 robots는 루트만 열고 블로그 sitemap을 광고하지 않는다.
curl -sS https://www.aquilaxk.site/robots.txt
curl -sS https://easysubway.aquilaxk.site/robots.txt

# 표면 호스트의 sitemap은 404다. 200이면 그 호스트가 블로그 URL 목록을 자기 것으로 광고한다.
curl -sS -o /dev/null -w "company_sitemap=%{http_code}\n" https://www.aquilaxk.site/sitemap.xml

# RSS도 블로그 호스트의 자산이다. 표면 호스트에서 차단되지 않으면 블로그 아이템이 이 호스트의
# 피드로 두 번째 색인된다. 상태 코드를 출력만 하면 그 열화가 "성공"으로 보고되므로 판정까지 한다.
# 계약된 차단 코드는 404다 (Caddyfile `(front_surface_vhost)`의 `@surfaceFeedDenied` → `respond 404`).
# `-L`은 최종 응답을 보기 위한 것이다 - 리다이렉트가 블로그 피드로 이어지면 그것도 차단이 아니다.
# alternate 링크는 두 호스트 모두에서 확인한다(한쪽만 보면 다른 호스트의 누출을 놓친다).
# no-match가 정상이므로 `grep`은 `if` 안에서 판정한다 - 그 exit 1은 실패가 아니다.
rss_isolation=0
for surface in https://www.aquilaxk.site https://easysubway.aquilaxk.site; do
  feed_code="$(curl -sSL -o /dev/null -w '%{http_code}' "${surface}/feed")"
  echo "${surface}/feed=${feed_code}"
  [ "${feed_code}" = "404" ] || { echo "FAIL: feed not blocked"; rss_isolation=1; }
  if curl -sSL "${surface}/" | grep -o '<link rel="alternate"[^>]*rss[^>]*>'; then
    echo "FAIL: RSS alternate still advertised on ${surface}"
    rss_isolation=1
  fi
done
[ "${rss_isolation}" -eq 0 ] && echo "rss isolation ok" || echo "rss isolation FAILED"
# 판정 결과를 블록의 종료 코드로 남긴다. `(exit N)`은 셸을 죽이지 않고 마지막 상태만 N으로 만든다.
(exit "${rss_isolation}")

# 표면 호스트에는 백엔드 표면이 없다. 실제로 닫아야 하는 것은 Next의 백엔드 프록시 라우트
# (`front/src/pages/api/backend/[...path].ts`)이고, 그것을 닫는 것은 Caddyfile
# `(front_surface_vhost)`의 `@frontApiDenied`(`/api/*` 중 `/api/rum/*`만 허용) → `respond 404`다.
# `/member/...`는 이 vhost가 애초에 백엔드로 프록시하지 않는 경로라서 그것만 보면 `@frontApiDenied`가
# 제거되거나 catch-all 뒤로 밀려도 통과한다 - 그래서 프록시 표면을 직접 찌른다. `/member/...`도
# 함께 남긴다: 그 경로가 404가 아니면 이 vhost에 백엔드 prefix가 붙은 것이다.
# 계약된 차단 코드는 404다. 상태 코드를 출력만 하면 그 열화가 "성공"으로 보고되므로 판정까지 한다.
# `-L`을 쓰지 않는다 - 리다이렉트로 백엔드에 닿는 것도 차단이 아니므로 3xx는 그대로 실패다.
backend_isolation=0
for surface in https://www.aquilaxk.site https://easysubway.aquilaxk.site; do
  for probe in /api/backend/member/api/v1/auth/session /member/api/v1/auth/session; do
    backend_code="$(curl -sS -o /dev/null -w '%{http_code}' "${surface}${probe}")"
    echo "${surface}${probe}=${backend_code}"
    [ "${backend_code}" = "404" ] || { echo "FAIL: backend surface reachable"; backend_isolation=1; }
  done
done
[ "${backend_isolation}" -eq 0 ] && echo "backend isolation ok" || echo "backend isolation FAILED"
(exit "${backend_isolation}")

# 블로그 표면 무회귀: robots/sitemap이 그대로 블로그 값이어야 한다.
curl -sS https://blog.aquilaxk.site/robots.txt
curl -sS -o /dev/null -w "blog_sitemap=%{http_code}\n" https://blog.aquilaxk.site/sitemap.xml
```

## 렌더 게이트 (#1541)

위 명령들은 상태 코드와 헤더까지 본다. 그 위 계층 — **응답 내용이 실제로 SSR·ISR·최적화 결과인가** —
는 `deploy/homeserver/front-render-gate.mjs`가 한 번에 검증한다. 하나라도 실패하면 exit 1이다.

DNS 전환이 끝난 뒤에는 Node가 있는 어디서든 공개 URL로 돌린다. 토큰은 **인자로도, 명령 앞 변수
할당으로도 넣지 않는다** — 앞 할당은 프로세스 목록(argv)에는 안 남지만 셸 history에는 값이 그대로
남는다. 가려진 입력으로 받아 환경변수로만 넘기고, 끝나면 지운다. 게이트는 토큰이 없으면 revalidate
검사를 건너뛰지 않고 **실패**한다.

```bash
read -r -s -p "TOKEN_FOR_REVALIDATE: " TOKEN_FOR_REVALIDATE
printf '\n'
export TOKEN_FOR_REVALIDATE
node deploy/homeserver/front-render-gate.mjs --base-url https://blog.aquilaxk.site
status=$?
unset TOKEN_FOR_REVALIDATE
# 종료 코드를 보존한다. `echo "exit=$?"`로 끝내면 그 echo의 0이 블록의 결과가 되어 게이트 실패가
# 성공으로 보고된다(스크립트에서 이 블록을 호출하면 특히). `(exit N)`은 셸을 죽이지 않고 마지막
# 상태만 N으로 되돌린다.
echo "exit=${status}"
(exit "${status}")
```

DNS 전환 전에는 공개 URL이 아직 홈서버를 가리키지 않으므로 edge 네트워크에서 Host 헤더로
같은 검증을 한다. Host 값은 Caddy web vhost가 실제로 매치하는 이름이다 — `WEB_DOMAIN`이 아직
없으면 Caddyfile 기본값 `web.localhost`, 설정한 뒤에는 `blog.aquilaxk.site`다.
홈서버 호스트에는 Node가 설치돼 있지 않으므로(실측) 컨테이너로 돌린다.

```bash
cd ~/app
# .env.prod 값은 따옴표로 감싸여 있을 수 있다. 그대로 넘기면 게이트가 401을 받고, 실패 사유가
# "토큰 형식"이라는 사실이 드러나지 않는다. `tr -d` 로 양끝 따옴표를 떼고 넘긴다.
env_value() { grep -E "^$1=" deploy/homeserver/.env.prod | tail -n 1 | cut -d= -f2- | tr -d "\"'"; }
export TOKEN_FOR_REVALIDATE="$(env_value CUSTOM__REVALIDATE__TOKEN)"
NODE_RUNTIME_IMAGE="$(env_value NODE_RUNTIME_IMAGE)"
docker run --rm --network blog_home_edge \
  -e TOKEN_FOR_REVALIDATE \
  -v "$PWD/deploy/homeserver/front-render-gate.mjs:/app/front-render-gate.mjs:ro" \
  "${NODE_RUNTIME_IMAGE}" \
  node /app/front-render-gate.mjs --base-url http://caddy:80 --host-header web.localhost
status=$?
unset TOKEN_FOR_REVALIDATE
# 위 블록과 같은 이유로 종료 코드를 보존한다. `unset`을 먼저 하고 상태를 마지막에 되돌린다.
echo "exit=${status}"
(exit "${status}")
```

게이트가 보는 것과, 각 항목이 잡는 "성공으로 보고되는 열화":

| 검사 | 실패로 잡는 상태 |
| --- | --- |
| `ssr-backend-data` | `/feed`·`/sitemap.xml`이 200인데 backend가 가진 글이 하나도 렌더되지 않는다 (SSR이 껍데기를 그린다) |
| `static-immutable-cache` | `/_next/static/*`에 장기 immutable 캐시가 빠진다 (페이지는 정상, 대역폭만 는다) |
| `image-optimization` | `/_next/image`가 원본 바이트를 그대로 돌려준다 (화면상 차이 없음) |
| `isr-cache-state-header` | `x-nextjs-cache`가 사라진다 (`public_edge_probe`의 캐시 관측이 죽는다) |
| `isr-timed-regeneration` | revalidate 주기가 지나도 stale 200만 계속 나간다 |
| `isr-on-demand-revalidate` | `/api/revalidate`가 200을 반환하는데 페이지가 안 바뀐다 / 토큰 없이도 통과한다 |

**상시 게이트가 아니다.** 시간 기반 ISR 검증이 대상 라우트의 `revalidate`(홈 60s) 이상 대기하므로
스크레이프 루프에 넣을 수 없다. 전환·front 배포 직후 1회 실행하고, 상시 관측은
`public_edge_probe`(캐시 상태·라우트 up)와 `docker_runtime_probe`(front 컨테이너·readiness)가 맡는다.

### 게이트에 넣지 않은 것과 그 이유

- **구 API 호스트 폐기 확인(`api.aquilaxk.site` 무응답)**: 전환 7단계 이후에만 유효하다.
  그 전에 상시 게이트에 넣으면 정상 상태가 실패로 보고된다. 위 "개통 확인"의 1회 수동 확인으로 남긴다.
  `www` 부재는 판정 항목이 **아니다** — Locked Decision 6 번복(#1605)으로 그 호스트는 우리 회사
  표면이고, 확인 기준은 부재가 아니라 위 "표면 개통 확인"의 200·canonical이다.
- **로그인 응답 `Set-Cookie`의 `Domain`**: 익명 프로브로는 관측되지 않는다. 위 로그인 왕복 절차가
  유일한 관측 지점이며 게이트에 억지로 넣지 않는다. 쿠키 **값은 어디에도 기록하지 않는다** —
  `Domain` 속성만 본다.
- **`.next/cache` 보존**: 이 앱에서 그 볼륨이 보존하는 것은 **이미지 최적화 캐시뿐**이다. Pages
  Router의 ISR 산출물은 `.next/server/pages`(이미지 레이어 안)에 쓰이고 `fetch-cache`는 App Router
  전용이라 채워지지 않는다(#1538 실측). 컨테이너 교체 후 ISR HTML은 보존되지 않으며 blue/green의
  새 색깔은 **항상 cold ISR로 시작한다**. 보존을 요구사항으로 되살리려면 `next.config.js`의 공유
  `cacheHandler`가 선행돼야 하고 그것은 애플리케이션 변경이다. 그때까지 게이트는 보존을 전제하지
  않고, "교체 후 첫 요청이 정상 재생성되는가"를 위 `isr-timed-regeneration`으로 본다.
  마운트·소유권(보존이 가능한 상태인지)은 `doctor.sh`의 `Front .next/cache Volume` 섹션이 상시 보고한다.
  실제 보존 여부를 눈으로 확인해야 하면 교체 전후를 직접 비교한다.

  ```bash
  cd ~/app
  # 목록 수집이 실패해도 빈 파일이 남으면 두 빈 파일의 diff가 성공한다 - "보존됐다"는 잘못된 판정이다.
  # 그래서 수집 실패를 컨테이너 안에서 전부 실패로 만든다. 두 경로가 있다: 디렉터리 부재는 `test -d`가
  # 잡고, 디렉터리는 있는데 `ls` 자체가 실패하는 경우는 `ls`의 종료 코드를 직접 본다.
  #
  # `ls | sort`로 쓰면 안 된다 - 그 파이프라인은 컨테이너 sh의 것이라 호스트에서 `set -o pipefail`을
  # 켜도 걸리지 않고(그 sh에는 pipefail이 없을 수 있다) 파이프라인의 종료 코드는 sort의 0이 된다.
  # 그래서 `ls`를 먼저 파일로 받아 그 종료 코드를 확인한 뒤 `sort`한다.
  snapshot_image_cache() {
    docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml \
      exec -T front_blue sh -lc \
      'test -d /app/.next/cache/images || { echo "missing /app/.next/cache/images" >&2; exit 1; }
       list_file="/tmp/image-cache-list.$$"
       ls /app/.next/cache/images >"$list_file" || { rm -f "$list_file"; exit 1; }
       sort "$list_file"
       status=$?
       rm -f "$list_file"
       exit "$status"' > "$1"
  }
  if snapshot_image_cache /tmp/next-cache-before.txt \
    && docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml \
      up -d --force-recreate front_blue \
    && snapshot_image_cache /tmp/next-cache-after.txt \
    && diff /tmp/next-cache-before.txt /tmp/next-cache-after.txt
  then
    echo "image cache preserved"
  else
    echo "image cache NOT preserved 또는 목록 수집 실패 - 위 출력이 판정 근거다"
    (exit 1)
  fi
  # ISR HTML은 여기서 비교 대상이 아니다. 보존되지 않는 것이 현재 사실이다.
  ```

## Rollback

> **Historical record — current execution prohibited**, except the `#1605` surface row, which is a
> live procedure. The other rows preserve the cutover-era facts only. Do not restore the retired
> `api.aquilaxk.site` topology, DNS, or Tunnel hostnames, and do not restore the cutover-era
> `www.aquilaxk.site` **blog** origin — that host is the company surface now (#1605), not a front
> origin to fall back to. Current front rollback uses `deploy/homeserver/rollback_last_deploy.sh`
> and the front blue/green procedure while keeping the same-origin `blog.aquilaxk.site` edge.

| 상황 | 되돌리는 방법 |
| --- | --- |
| front 기동 검증 실패 (2단계) | 당시에는 `COMPOSE_PROFILES`에서 `front`를 빼고 재배포했다. |
| 3단계 배포 후 백엔드·인증 장애 (DNS 전환 전) | **3단계에서 바꾼 네 값을 전부 되돌린다** — `CUSTOM_PROD_BACKURL=https://api.aquilaxk.site`, `CUSTOM_PROD_FRONTURL=https://www.aquilaxk.site`, `CUSTOM_PROD_COOKIEDOMAIN=aquilaxk.site`, 그리고 `WEB_DOMAIN` 줄 **삭제**. 그 뒤 재배포한다. 구 topology가 복원되고 `www` origin 로그인이 살아난다. `API_DOMAIN`은 내내 그대로였으므로 구 API 경로는 끊긴 적이 없다. **스위치만 되돌리면 `validate-env`가 `ok=false`로 배포를 막는다**(실측: `CUSTOM_PROD_COOKIEDOMAIN`·`CUSTOM_PROD_FRONTURL` 두 error) — 장애 중 롤백이 게이트에서 멈추는 경로라 네 값을 한 번에 되돌린다. **이 행은 현재 성립하지 않는다** — `www.aquilaxk.site`는 #1605로 회사 표면이 됐으므로 블로그 front origin으로 되돌릴 대상이 아니고, #1596 이후 `WEB_DOMAIN`을 지운 위상은 `blue_green_deploy.sh`의 `require_nonempty_env_key "WEB_DOMAIN"`에서 배포가 멈춘다. |
| 4단계 직후 `blog.aquilaxk.site` 장애 | 당시에는 Cloudflare public hostname과 DNS를 Vercel로 되돌리고 네 env 값을 함께 복원하는 절차였다. #1542 이후 이 경로는 닫혔다. |
| front 컨테이너만 문제 | 현재는 `rollback_last_deploy.sh`와 front blue/green rollback으로 마지막 검증된 front를 같은 `blog.aquilaxk.site` edge에 복원한다. 프로필을 끄거나 DNS를 되돌리지 않는다. |
| 6단계 표면 개통 후 문제 발견 (#1605) | `HOME_SERVER_ENV`에서 `COMPANY_DOMAIN`·`PRODUCT_DOMAIN`·`APEX_DOMAIN` 줄을 **삭제**하고(비우지 말고 — 빈 값은 vhost 주소를 :80 catch-all로 만든다) 재배포한다. 세 vhost가 `.localhost` 기본값으로 내려앉아 그 호스트를 매치하지 않는다. **공개 노출을 즉시 끊어야 하면 Tunnel public hostname을 먼저 삭제한다** — env만 되돌리면 hostname은 살아 있는데 매치하는 vhost가 없어 Caddy가 404가 아니라 `200` + 빈 본문을 준다. 블로그 표면은 이 롤백에 영향받지 않는다(신규 vhost는 자기 Host만 매치하고 blog vhost를 건드리지 않는다). |
| 7단계까지 끝난 뒤 문제 발견 (구 API hostname 제거 후) | 구 API hostname의 DNS/Tunnel 재생성은 현재 rollback 절차가 아니다. same-origin front rollback만 수행한다. |

## 저장소 쪽 fail-safe

- `WEB_DOMAIN`이 비면 Caddy web vhost는 `http://{$WEB_DOMAIN:web.localhost}`의 기본값으로
  내려앉아 공개 호스트를 매치하지 않는다. 기본값이 없으면 주소가 `http://`가 되어 **host matcher
  없는 :80 catch-all**이 되므로(caddy adapt로 실측) 반드시 기본값을 유지한다.
  > ⚠️ **이것을 "fail-closed"라고 부르지 마라.** 어떤 vhost도 매치하지 않는 Host에 Caddy가 주는
  > 응답은 404가 아니라 **`200` + 빈 본문**이다(실측: `Host: unmatched.example.test` → `200`,
  > 본문 없음). 즉 "아무 일도 안 일어나는" 상태가 아니라 "빈 200을 내보내는" 상태다.
- **present-but-empty는 absent와 다르다.** Caddy의 `{$VAR:default}`는 변수가 unset일 때만 기본값을
  쓴다. `KEY=`로 비워 두면 빈 문자열이 그대로 보간돼 `WEB_DOMAIN`은 :80 catch-all을,
  `WEB_UPSTREAM`은 `reverse_proxy :3000`을 만든다. 두 층이 막는다: env 계약이
  `must be removed entirely rather than set to an empty value`로 실패시키고,
  `materialize_service_env.sh`가 빈 값 caddy 키를 아예 내보내지 않는다.
- `WEB_DOMAIN`·`LEGACY_API_DOMAIN`·`COMPANY_DOMAIN`·`PRODUCT_DOMAIN`·`APEX_DOMAIN`은
  `materialize_service_env.sh`의 caddy 키 allowlist에 있어야 `.env.caddy.prod`로 전달된다. 빠지면
  vhost가 조용히 기본값으로 내려앉는다.
- **배포 후 공개 검증은 `WEB_DOMAIN` 하나에 걸려 있다**(#1596). 그래서 그 값이 비면 검증을 건너뛰는
  대신 배포가 멈춘다: `blue_green_deploy.sh`의 `require_nonempty_env_key "WEB_DOMAIN"`이 첫 층,
  `deploy.yml`의 `missing_web_domain`이 둘째 층이다. 내부 edge 스모크(Host 헤더 + edge network)와
  공개 HTTPS 스모크는 역할이 다르다 — 앞의 것은 DNS·Cloudflare·터널이 고장 나도 "Caddy 라우팅이
  맞는가"를 답하고, 뒤의 것은 실제 방문자 경로가 살아 있는가를 답한다. 둘 중 하나만 남기면 한쪽
  실패가 다른 쪽 장애로 오인된다.
- `FRONT_*_IMAGE`가 비면 compose `front` 프로필이 꺼진 채로 `docker compose config`가 통과하고,
  프로필을 켠 채 키가 비면 compose가 `neither an image nor a build context`로 실패한다.
  `${FRONT_BLUE_IMAGE:?}` 형태를 쓰면 프로필과 무관하게 보간 단계에서 죽어 기존 배포·백업·doctor의
  compose 평가가 전부 깨지므로 쓰지 않는다.
- 공개 API 게이트(요청 body 상한, 보안 헤더, 민감 경로 `log_skip`, `/actuator/prometheus` 403,
  read/admin upstream 분리)는 **`(backend_edge_gates)` snippet 하나**에 있고 backend 전용 vhost와
  web vhost가 그것을 import한다. vhost마다 복사하면 한쪽 문에서만 게이트가 조용히 사라지므로,
  계약 테스트가 "정의는 snippet 안에 하나뿐"임을 고정한다. web vhost의 import는 backend prefix
  handle **안**에 있어야 한다 — site level로 올라가면 공유 보안 헤더가 front 응답까지 덮어
  `next.config.js`가 소유한 헤더와 충돌한다(HR-56).
- `/actuator/prometheus` 차단은 `respond`가 아니라 `handle`이어야 한다. Caddy 지시자 순서는
  `respond`를 `handle`보다 **뒤에** 두므로, 최상위 `respond @denyPrometheus 403`은 catch-all
  backend proxy 뒤로 컴파일돼 실행되지 않는다(변경 전 설정에서 실측: 403이 아니라 백엔드 응답).
- `CF-Connecting-IP`는 **Cloudflare Tunnel이 쓴 주소에서만** 신뢰한다. 같은 vhost가 컨테이너 내부
  진입점(`http://caddy`)을 함께 가질 때 그 주소에서는 호출자가 헤더를 임의로 넣을 수 있어, 그대로
  믿으면 audit log와 rate-limit 버킷의 client IP가 위조된다. `(edge_client_ip_capture)` snippet이
  내부 진입점에서는 peer 주소로 대체한다.
