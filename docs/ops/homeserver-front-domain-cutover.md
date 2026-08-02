# 홈서버 front 도메인 전환 순서 (#1538 · #1575)

`blog.aquilaxk.site` 하나를 Cloudflare Tunnel → Caddy → 홈서버 컨테이너로 개통하는 절차다.
front와 공개 API가 **같은 호스트**를 쓴다 — API는 별도 호스트가 아니라 이 호스트의 경로다
(#1575). 현재 `blog.aquilaxk.site`는 **Vercel**을 가리키고, `www.aquilaxk.site`(Vercel)와
`api.aquilaxk.site`(홈서버)가 구 공개 경로로 살아 있다.

- 저장소 쪽 변경(#1538): compose front 서비스, Caddy `{$WEB_DOMAIN}` vhost, env 계약.
- 경로 기반 공개 API·쿠키 위상·env 스위치(#1575): 이 문서가 그 결과다.
- blue/green 전환 로직과 `FRONT_*_IMAGE`·`BACKEND_INTERNAL_URL` 주입(#1539).
- Cloudflare Tunnel public hostname과 DNS 레코드는 **콘솔 전용 작업(오너)** 이다. 이 저장소에
  tunnel ingress 설정 파일은 없다 — compose의 `cloudflared`는
  `tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}`으로 원격 관리 tunnel을 실행한다.

## Locked decision

- 공개 web 호스트는 `blog.aquilaxk.site` 하나다 (Epic #1535 Locked Decision 5).
- `www.aquilaxk.site`는 **301 redirect 없이 완전 폐기**한다 (Locked Decision 6). Caddy `redir`,
  Cloudflare Redirect Rule, `www` vhost 유지 어느 형태도 만들지 않는다.
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
site block이 `{$API_DOMAIN}`과 `http://caddy`를 함께 갖고, 그 안에는 front upstream이 없다.
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
  if grep -rq "https://www\.aquilaxk\.site"      /app/.next; then echo "FAIL: retired www URL is inlined";  fail=1; fi
  exit "$fail"
'; echo "gate exit=$?"   # 0이어야 쓸 수 있다
```

> ⚠️ **`set -e` + `! grep ...` 형태로 쓰지 마라. 부정 조건이 둘 이상이면 통과 판정이 거짓이 된다.**
> POSIX `set -e`는 `!`로 시작하는 pipeline에 적용되지 않고, 스크립트 종료 코드는 마지막 명령의
> 것이다. 따라서 부정 조건이 여러 개면 **마지막 하나만** 실제로 게이트로 동작한다.
>
> 이건 **#1575가 게이트를 고쳐 쓰면서 새로 생기는** 결함이지 이전 게이트의 결함이 아니다.
> 이전 형태(긍정 2개 + 마지막에 부정 1개)는 부정이 하나뿐이라 그 시절 기준으로 정상 동작했다.
> `api.blog` 조건이 존재→부재로 뒤집히면서 부정이 둘이 되는 순간 무너진다. 실측(stub `.next`):
>
> ```
> 이미지                          이전 형태   부정 2개로 단순 치환   이 문서의 if 형태
> pre-#1540 (www만 광고)           반려        반려                   반려
> #1555~#1575 (api.blog 포함)      통과(당시 정상)  통과 ← 새 결함      반려
> #1575 이후 (same-origin)         반려(당시 정상)  반려                통과
> ```

세 조건이 각각 무엇을 걸러내는지:

| 조건 | 반려되는 이미지 |
| --- | --- |
| `https://blog.aquilaxk.site` **존재** | ARG 기본값이 빈 문자열이던 시절 빌드 — `site.config.js`의 `isProd`가 false로 굳고 canonical/OG URL이 틀린다 |
| `https://api.blog.aquilaxk.site` **부재** | #1555~#1575 사이 빌드 — 브라우저가 **존재할 수 없는 호스트**(TLS alert 40)로 XHR한다. #1575 이전 게이트는 이 문자열을 반대로 *요구*했으므로, 그 시절 게이트를 그대로 쓰면 새 이미지가 전부 반려된다 |
| `https://www.aquilaxk.site` **부재** | 폐기 대상이자 타 서비스가 가져갈 호스트를 광고하는 이미지 |

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

   `API_DOMAIN`은 **그대로 `api.aquilaxk.site`로 둔다.** 이 키는 더 이상 공개 API 호스트가
   아니라 host 기반 API vhost 주소이며, 구 web origin이 아직 그 호스트로 백엔드를 부르는 동안
   살아 있어야 한다. `WEB_DOMAIN`과 같은 값이면 Caddy site address가 중복돼 edge 전체가 기동하지
   못한다 — 계약의 `mustDifferFrom`이 막는다.

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

6. **(5)가 green인 뒤에** `www.aquilaxk.site`의 Tunnel public hostname과 DNS 레코드를 제거한다
   (오너, 콘솔).

7. **(6)이 green인 뒤에** 구 API 호스트를 접는다. `api.aquilaxk.site`의 Tunnel public hostname과
   DNS 레코드를 제거하고, **그 다음** 저장소에서 `{$API_DOMAIN}` **주소와** `API_DOMAIN` 키를
   제거하는 후속 PR을 낸다. 순서가 반대면 `API_DOMAIN`이 required인 채로 사라져 배포가 막힌다.

   > ⚠️ **지우는 것은 주소이지 vhost가 아니다.** 그 site block은 `http://caddy` 내부 진입점을
   > 함께 갖고 있고(#1539), front 서버 사이드(SSR·`/api/backend/*` proxy)가 백엔드에 닿는 유일한
   > 경로다. vhost를 통째로 지우면 front가 모든 SSR 경로에서 죽는다.

   그 후속 PR은 **`deploy.yml`의 배포 후 검증도 함께 옮겨야 한다.** 현재 post-deploy health
   probe(`Host: ${API_DOMAIN}`로 `http://caddy:80/actuator/health/readiness`)와 live 보안 헤더·
   스모크 체크(`https://${API_DOMAIN}/...`)가 그 호스트를 쓴다. 호스트를 지우고 검증을 그대로
   두면 배포가 실패하고, 검증만 먼저 지우면 아무도 안 보는 사이 배포가 green으로 통과한다.

   `LEGACY_API_DOMAIN`은 이 전환에서 **쓰지 않는다.** 이 전환이 떠나는 구 API 호스트는
   `API_DOMAIN` 자신이고 그 주소는 계속 남기 때문이다. 키는 다음 host 이전을 위해 계약에 남겨
   둔다.

   > ⚠️ 전환 창 키를 닫을 때는 **줄을 비우지 말고 지운다.** `KEY=`(빈 값)은 unset이 아니라 빈
   > 문자열로 보간돼 vhost 주소가 `http://`가 되고, `caddy adapt` 실측 결과 그 site의 host
   > matcher가 통째로 사라져 :80 catch-all이 된다. env 계약이
   > `must be removed entirely rather than set to an empty value`로 막지만, 그 전에 알고 있어야
   > 한다.

## 개통 확인

```bash
# front: 보안 헤더 7종이 next.config.js 정의 그대로 관측되는지
curl -sSI https://blog.aquilaxk.site/ \
  | sed -n '1p;/^[Xx]-/p;/^[Ss]trict/p;/^[Cc]ontent-[Ss]ecurity/p;/^[Rr]eferrer/p;/^[Pp]ermissions/p'

# 정적 자산 장기 캐시
curl -sSI "https://blog.aquilaxk.site/_next/static/<실제 asset 경로>" | grep -i cache-control

# SEO 진입점. front/public/robots.txt는 tracked 정적 파일이고 postbuild가 next-sitemap을 스킵하므로
# 빌드가 이 값을 갱신하지 않는다. web 호스트에서는 front가 robots.txt를 서빙해야 한다 —
# API vhost의 `Disallow: /`가 아니라.
curl -sS https://blog.aquilaxk.site/robots.txt
curl -sS -o /dev/null -w "sitemap=%{http_code}\n" https://blog.aquilaxk.site/sitemap.xml

# 경로 라우팅: 같은 호스트에서 front와 백엔드가 갈리는지
curl -sS https://blog.aquilaxk.site/actuator/health/readiness
curl -sS -o /dev/null -w "feed=%{http_code}\n" \
  "https://blog.aquilaxk.site/post/api/v1/posts/feed?page=1&pageSize=1&sort=CREATED_AT"
# /actuator/prometheus는 백엔드로 가지 않는다 (web에서는 front 404, API 호스트에서는 edge 403)
curl -sS -o /dev/null -w "prom_web=%{http_code}\n" https://blog.aquilaxk.site/actuator/prometheus
curl -sS -o /dev/null -w "prom_api=%{http_code}\n" https://api.aquilaxk.site/actuator/prometheus

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

# 구 hostname 폐기 확인 (6~7번 이후)
dig +short www.aquilaxk.site
dig +short api.aquilaxk.site
curl -sSI --max-time 10 https://api.aquilaxk.site/actuator/health/readiness ; echo "exit=$?"
```

`www.aquilaxk.site`는 apex와 함께 **타 서비스가 사용**하므로 제거 후에도 응답이 올 수 있다.
확인 기준은 "우리 Tunnel public hostname 목록과 우리 Caddy 설정에 남아 있지 않은 것"이며, 응답이
오면 우리 홈서버에서 나온 것인지 `x-request-id` 등 우리 헤더 유무로 구분한다.

## Rollback

| 상황 | 되돌리는 방법 |
| --- | --- |
| front 기동 검증 실패 (2단계) | `COMPOSE_PROFILES`에서 `front`를 빼고 재배포한다. 공개 노출 전이라 사용자 영향이 없다. |
| 3단계 배포 후 백엔드·인증 장애 (DNS 전환 전) | **3단계에서 바꾼 네 값을 전부 되돌린다** — `CUSTOM_PROD_BACKURL=https://api.aquilaxk.site`, `CUSTOM_PROD_FRONTURL=https://www.aquilaxk.site`, `CUSTOM_PROD_COOKIEDOMAIN=aquilaxk.site`, 그리고 `WEB_DOMAIN` 줄 **삭제**. 그 뒤 재배포한다. 구 topology가 복원되고 `www` origin 로그인이 살아난다. `API_DOMAIN`은 내내 그대로였으므로 구 API 경로는 끊긴 적이 없다. **스위치만 되돌리면 `validate-env`가 `ok=false`로 배포를 막는다**(실측: `CUSTOM_PROD_COOKIEDOMAIN`·`CUSTOM_PROD_FRONTURL` 두 error) — 장애 중 롤백이 게이트에서 멈추는 경로라 네 값을 한 번에 되돌린다. |
| 4단계 직후 `blog.aquilaxk.site` 장애 | Cloudflare 콘솔에서 `blog.aquilaxk.site` public hostname을 삭제하고 DNS 레코드를 **Vercel을 가리키던 이전 값으로 되돌린다.** Vercel 프로젝트는 이 시점까지 살아 있다(`front/vercel.json` 제거는 #1542 소관). **`HOME_SERVER_ENV`의 네 값도 위 행처럼 함께 되돌린다** — DNS만 되돌리면 쿠키 Domain이 이미 blog라 "사이트는 뜨는데 로그인이 안 되는" 상태가 된다. |
| front 컨테이너만 문제 | `COMPOSE_PROFILES`에서 `front`를 빼고 재배포하면 front 서비스가 기동 대상에서 빠진다. 그 상태에서 `blog.aquilaxk.site`는 front 경로에 502를 내고 API 경로는 계속 동작하므로, 공개 노출 중이라면 위 DNS 되돌리기를 함께 한다. |
| 6단계까지 끝난 뒤 문제 발견 (`www` 제거 후) | `www` 경로 rollback은 없다. Locked Decision 6이 www를 완전 폐기하기로 한 것이므로 되돌릴 대상 자체가 없다. |
| 7단계까지 끝난 뒤 문제 발견 (구 API hostname 제거 후) | 구 API 경로 rollback은 DNS/Tunnel hostname 재생성이다. 그래서 7단계는 (6)이 green인 뒤에만 한다. |

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
- `WEB_DOMAIN`·`API_DOMAIN`·`LEGACY_API_DOMAIN`은 `materialize_service_env.sh`의 caddy 키
  allowlist에 있어야 `.env.caddy.prod`로 전달된다. 빠지면 vhost가 조용히 기본값으로 내려앉는다.
- `FRONT_*_IMAGE`가 비면 compose `front` 프로필이 꺼진 채로 `docker compose config`가 통과하고,
  프로필을 켠 채 키가 비면 compose가 `neither an image nor a build context`로 실패한다.
  `${FRONT_BLUE_IMAGE:?}` 형태를 쓰면 프로필과 무관하게 보간 단계에서 죽어 기존 배포·백업·doctor의
  compose 평가가 전부 깨지므로 쓰지 않는다.
- 공개 API 게이트(요청 body 상한, 보안 헤더, 민감 경로 `log_skip`, `/actuator/prometheus` 403,
  read/admin upstream 분리)는 **`(backend_edge_gates)` snippet 하나**에 있고 host 기반 API vhost와
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
