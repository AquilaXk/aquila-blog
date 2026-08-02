# 홈서버 front 도메인 전환 순서 (#1538)

`blog.aquilaxk.site`와 `api.blog.aquilaxk.site`를 Cloudflare Tunnel → Caddy → 홈서버 컨테이너로
개통하는 절차다. 현재 `blog.aquilaxk.site`는 **Vercel**을 가리키고 있고, `api.aquilaxk.site`는
이미 홈서버를 가리킨다. 이 문서는 그 두 호스트를 홈서버 front/back으로 옮기는 순서와 되돌리는
경로만 다룬다.

- 저장소 쪽 변경(#1538): compose front 서비스, Caddy `{$WEB_DOMAIN}` vhost, env 계약.
- env 값 전환(#1540): `API_DOMAIN`, `CUSTOM_PROD_BACKURL`, `CUSTOM_PROD_FRONTURL`,
  `CUSTOM_PROD_COOKIEDOMAIN`.
- blue/green 전환 로직과 `FRONT_*_IMAGE` 주입(#1539) — 아래 "front 배포 동작(#1539)" 참조.
- Cloudflare Tunnel public hostname과 DNS 레코드는 **콘솔 전용 작업(오너)** 이다. 이 저장소에
  tunnel ingress 설정 파일은 없다 — compose의 `cloudflared`는
  `tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}`으로 원격 관리 tunnel을 실행한다.

## Locked decision

- 공개 web 호스트는 `blog.aquilaxk.site` 하나다 (Epic #1535 Locked Decision 5).
- `www.aquilaxk.site`는 **301 redirect 없이 완전 폐기**한다 (Locked Decision 6). Caddy `redir`,
  Cloudflare Redirect Rule, `www` vhost 유지 어느 형태도 만들지 않는다.
- 공개 API 호스트는 `api.blog.aquilaxk.site`로 내린다 (Locked Decision 8). 쿠키 `Domain`이
  front/back 공통 접미사로 계산되므로 API가 `api.aquilaxk.site`에 남으면 인증 쿠키가 타 서비스
  소유인 apex로도 전송된다.

## 전환 순서

구 hostname 제거는 **항상 마지막**이다.

1. **OAuth 제공자 콘솔 선행 등록 (오너).** `https://api.blog.aquilaxk.site/login/oauth2/code/kakao`
   callback과 `https://blog.aquilaxk.site` 승인 원본을 미리 등록한다. `application.yaml`의
   `redirect-uri`가 `${custom.site.backUrl}` 파생이라 env를 바꾸는 순간 애플리케이션은 새 URI를
   보낸다. 등록 확인 전에는 3번을 시작하지 않는다.
2. **홈서버 env에 front 키를 넣고 front를 기동한다.** `HOME_SERVER_ENV`에 다음을 추가한다.

   > ⚠️ **쓸 수 있는 front digest는 #1540(PR #1555) 병합 이후 빌드된 것뿐이다.**
   > `frontend-image.yml`은 `build-args`를 주입하지 않고 `front/Dockerfile.runtime`의 ARG
   > 기본값에 의존한다(`.github/workflows/frontend-image.yml:98-106`). 그 기본값이 빈 문자열이던
   > 동안 빌드된 이미지는 (a) `site.config.js`가 `https://www.aquilaxk.site`로 폴백해 canonical·
   > OG·sitemap URL이 **폐기 대상이자 타 서비스 소유가 될 호스트**를 가리키고, (b) `isProd`가
   > `VERCEL_ENV === "production"` 판정이라 홈서버에서 영원히 false다. #1540이 셋 다 고친다.
   > **GHCR에 이미 있는 digest(`sha-7364318ef`·`sha-86e5547a5`처럼 #1540 병합 이전 빌드)를 집어
   > 오면 안 된다.** 값은 클라이언트 번들에 **인라인**되므로 `printenv`로는 확인할 수 없다 —
   > `ENV`는 builder 스테이지를 넘지 않아 런타임 스테이지에는 존재하지 않고, 좋은 digest와 나쁜
   > digest 모두 빈 출력 + `exit 1`이다(실측). **산출물을 봐야 한다.**
   > ```bash
   > docker run --rm --entrypoint sh ghcr.io/aquilaxk/aquila-blog-front@sha256:<digest> -c '
   >   set -e
   >   grep -rq "https://blog\.aquilaxk\.site"     /app/.next
   >   grep -rq "https://api\.blog\.aquilaxk\.site" /app/.next
   >   ! grep -rq "https://www\.aquilaxk\.site"    /app/.next
   > '; echo "gate exit=$?"   # 0이어야 쓸 수 있다
   > ```
   > 실측(좋은 이미지 = 이 PR 기준 로컬 빌드 / 나쁜 이미지 = `sha-86e5547a5`):
   > ```
   > printenv NEXT_PUBLIC_SITE_URL   bad: (빈 출력) exit=1   good: (빈 출력) exit=1   ← 구분 불가
   > 산출물 gate                      bad: exit=1            good: exit=0            ← 구분됨
   > 실제 광고 호스트                  bad: https://www.aquilaxk.site
   >                                 good: https://blog.aquilaxk.site https://api.blog.aquilaxk.site
   > ```
   > 커밋 대조가 필요하면 같은 방식으로 본다(`NEXT_PUBLIC_AQUILA_BUILD_SHA`도 인라인된다):
   > ```bash
   > docker run --rm --entrypoint sh ghcr.io/aquilaxk/aquila-blog-front@sha256:<digest> \
   >   -c 'grep -rhoE "aquila-build-sha[^0-9a-f]+[0-9a-f]{40}" /app/.next | head -1'
   > ```

   - `FRONT_BLUE_IMAGE=ghcr.io/aquilaxk/aquila-blog-front@sha256:...` (digest 전용)
   - `FRONT_GREEN_IMAGE=ghcr.io/aquilaxk/aquila-blog-front@sha256:...` — **`FRONT_BLUE_IMAGE`와
     같은 digest를 그대로 적는다.** 두 색깔이 모두 정의돼 있어 프로필을 켜면 두 키가 모두 필요하고,
     compose는 image가 빈 서비스를 `neither an image nor a build context`로 거부한다. 값을 비워
     두면 안 된다. 두 digest가 갈라지는 것은 cutover 시점(#1539가 새 색깔에만 새 digest를 넣는다)
     이며, `BACK_BLUE_IMAGE`/`BACK_GREEN_IMAGE`가 이미 같은 방식으로 동작한다.

     > **이 두 키를 손으로 넣는 것은 프로필을 켜는 이 한 번뿐이다.** 이후에는 `#1539`의 front 배포가
     > 새 색깔의 digest를 `.env.prod`에 직접 쓰고, backend 배포는 값이 사라졌을 때 실행 중인
     > 컨테이너에서 복원한다. 반대로 프로필을 켜면서 이 값을 넣지 않으면 **backend 배포가 먼저
     > 실패한다** — 프로필이 켜진 채 이미지 값이 없으면 `docker compose` 평가 자체가 깨지므로,
     > `blue_green_deploy.sh`가 compose를 처음 부르기 전에 fail closed 한다.
   - `BACKEND_INTERNAL_URL=http://caddy` — **없으면 front SSR과 `/api/backend/*` 프록시가 죽는다.**
     `front/src/libs/server/backend.ts`가 production에서 이 값 없이는 throw하고, 이미지가
     `NODE_ENV=production`을 박고 있다. 실측(2026-08-02): 값이 없으면 컨테이너는 `healthy`,
     `/`는 빌드 타임 프리렌더라 200인데 `/api/backend/post/api/v1/posts/tags`만 502였다.

     **값은 이 하나뿐이고 계약(`allowedValues`)과 배포가 함께 고정한다.** 색깔 URL
     (`http://back-blue:8080`)은 backend blue/green 전환마다 깨지고, `back_read`/`back_admin`은
     `ApiRuntimeBoundaryFilter`가 자기 런타임 모드 밖 요청을 503으로 막아 각각 인증·쓰기 경로와
     공개 피드가 죽는다. 라우트 분리를 소유한 것은 Caddy이므로 front도 브라우저와 같은 경로로
     들어간다. 공개 인터넷을 왕복하지 않는다 — `caddy`는 compose 네트워크 안에서만 도달한다.
   - `COMPOSE_PROFILES`에 `front` 추가 (기존 값이 `runtime-split`이면 `runtime-split,front`)

   **`WEB_DOMAIN`은 여기서 넣지 않는다.** 이 값은 4단계에서 `CUSTOM_PROD_FRONTURL`과 **함께**
   들어가야 한다. env 계약의 `urlHostEquals(CUSTOM_PROD_FRONTURL, WEB_DOMAIN)`은 두 값이 모두
   있고 서로 다르면 error이고, 이 검증은 `deploy.yml`의 `Validate HOME_SERVER_ENV contract`
   단계에서 돈다 — 먼저 넣으면 1·3단계를 끝낼 때까지 **백엔드 핫픽스를 포함한 모든 배포가
   잠긴다.** 이 단계에서 front vhost는 `web.localhost` 기본값이라 공개 트래픽을 받지 않는다.

   기동 검증 (Tunnel hostname이 아직 없어 공개 트래픽은 오지 않는다):
   ```bash
   docker compose ps
   docker inspect --format '{{.State.Health.Status}}' <front 컨테이너>   # healthy
   # healthy는 정적 서빙만 증명한다. `/`도 부족하다 - 빌드 타임 프리렌더라
   # BACKEND_INTERNAL_URL이 비어 있어도 200이다. 실제 backend 왕복까지 본다.
   docker compose exec -T front_blue wget -qS -O /dev/null http://127.0.0.1:3000/ 2>&1 | head -3
   docker compose exec -T front_blue wget -qS -O /dev/null \
     http://127.0.0.1:3000/api/backend/post/api/v1/posts/tags 2>&1 | head -3
   docker compose exec -T front_blue printenv BACKEND_INTERNAL_URL
   ```
   `/`나 backend 프록시 경로가 200이 아니거나 `BACKEND_INTERNAL_URL`이 비어 있으면 **3단계로
   넘어가지 않는다.** (#1539의 front 배포 게이트가 같은 세 신호를 자동으로 확인한다.)
3. **`api.blog.aquilaxk.site` Tunnel public hostname만 만든다 (오너, 콘솔).**
   - `api.blog.aquilaxk.site` → `http://caddy:80`

   **`blog.aquilaxk.site`는 여기서 만들지 않는다.** Cloudflare에서 tunnel public hostname을
   만들면 DNS 레코드가 함께 생성되므로, blog를 지금 만들면 기존 Vercel 레코드를 교체하게 되고
   그 순간이 사실상 DNS 전환이다. 아직 4단계(env flip)를 하기 전이라 `WEB_DOMAIN`이 비어 있고
   web vhost는 `web.localhost` 기본값이므로, 공개 blog 트래픽이 vhost 미매치 상태로 노출된다.
   blog hostname과 DNS는 5단계에서 Vercel 레코드를 교체하며 만든다. `api.blog`는 신규 레코드라
   충돌 없이 미리 만들어도 안전하고, 4단계에서 `API_DOMAIN`이 넘어갈 때 바로 필요하다.

   구 hostname(`www.aquilaxk.site`, `api.aquilaxk.site`)은 이 단계에서 **그대로 둔다.** 4단계
   이후에도 `LEGACY_API_DOMAIN`이 구 API 호스트를 계속 Caddy vhost에 매치시킨다.
4. **#1540의 env 전환을 한 배포로 함께 적용한다.** `API_DOMAIN`·`CUSTOM_PROD_BACKURL`·
   `CUSTOM_PROD_FRONTURL`·`CUSTOM_PROD_COOKIEDOMAIN`, 그리고 **`WEB_DOMAIN=blog.aquilaxk.site`를
   같은 배포에서 함께** 넣는다. 이 다섯을 동시에 넣어야 `urlHostEquals(CUSTOM_PROD_FRONTURL,
   WEB_DOMAIN)`이 처음부터 만족되고, `API_DOMAIN`이 새 topology로 가는 순간 `WEB_DOMAIN`이
   `requiredWhen`으로 필수가 되므로 빠뜨리면 배포가 멈춘다(공개 도메인만 404가 되는 대신).
   **`LEGACY_API_DOMAIN=api.aquilaxk.site`도 같은 배포에 넣는다.** API vhost는 공개 site address가
   둘(`http://{$API_DOMAIN}, http://{$LEGACY_API_DOMAIN:legacy-api.localhost}`)이라, 이 키가 있는
   동안 구·신 API 호스트가 **동시에** 살아 있다 (세 번째 `http://caddy`는 컨테이너 내부 전용이라
   공개 호스트 수에 들어가지 않는다). 없으면 이 배포 순간 구 `api.aquilaxk.site`가 Caddy
   vhost 미매치가 되어, 아직 구 web origin에서 서빙 중인 트래픽이 백엔드를 잃는다.
   `caddy adapt` 실측: `host matcher: api.blog.aquilaxk.site , api.aquilaxk.site`.

   나머지 front 파생 키(`WEB_DOMAIN`·`ADMIN_EMBED_ORIGINS`·`PUBLIC_EDGE_PROBE_BASE_URL`·
   `CUSTOM__REVALIDATE__URL`)는 **오너가 만질 필요가 없다.** `deploy.yml`이 `API_DOMAIN` 하나에서
   파생해 `.env.prod`에 핀한다. 단 `ADMIN_EMBED_ORIGINS`는 현재 apex·www 두 개를 담고 있어 이
   배포에서 `https://blog.aquilaxk.site` 하나로 좁혀진다 — 배포 전 `validate-env`가 제거되는
   origin을 이름으로 경고한다.

   **선행 조건: edge CORS allowlist가 이미 `https://blog.aquilaxk.site`여야 한다.** #1540이
   `Caddyfile`의 `@corsAllowed`·`@corsPreflight`를 `^https://(www\.)?aquilaxk\.site$`에서
   `^https://blog\.aquilaxk\.site$`로 교체했으므로, **#1540이 병합·배포된 뒤에** 4단계를 한다.
   구 정규식인 채로 4단계를 하면 브라우저의 `blog.aquilaxk.site` → `api.blog.aquilaxk.site`
   요청이 edge에서 `Access-Control-Allow-Origin`을 받지 못한다.

   전환 창 동안 blog에서 서빙되는 프론트가 **구** API 호스트를 부를 때도 `Origin`은
   `https://blog.aquilaxk.site`라 같은 정규식을 통과한다(실측: blog ALLOW / www·apex·www.blog REJECT).
   두 site address가 한 vhost를 공유하므로 CORS 설정도 공유된다.
5. **`blog.aquilaxk.site` Tunnel public hostname을 만들고 DNS를 Vercel에서 Tunnel로 교체한다
   (오너, 콘솔).** 3단계에서 미룬 작업이 여기다 — hostname 생성이 곧 DNS 전환이므로 4단계가
   끝난 뒤에만 한다.

   ⚠️ **전환 창이 보존하는 것은 라우팅이지 세션이 아니다.** `LEGACY_API_DOMAIN`은 Caddy host
   matcher만 살린다. 4단계 이후 백엔드는 요청 호스트와 무관하게 `Domain=blog.aquilaxk.site`로
   쿠키를 굽는다(`back/.../Rq.kt`의 `builder.domain(cookieDomain)`에 호스트 조건이 없다).
   따라서 구 `api.aquilaxk.site`로 오는 요청은 **응답은 하지만 브라우저가 RFC 6265 §5.3으로
   그 쿠키를 거부해 인증이 성립하지 않는다.** 구 경로로 기대할 수 있는 것은 공개 GET뿐이다.
6. **확인.** 아래 "개통 확인"의 명령이 전부 green이어야 한다. 신 호스트 기준으로 판정한다 —
   구 호스트는 라우팅만 살아 있으므로 인증 경로를 여기서 기대하지 않는다.
7. **(6)이 green인 뒤에 `LEGACY_API_DOMAIN` 줄을 `HOME_SERVER_ENV`에서 삭제**하고 재배포한 다음,
   `api.aquilaxk.site`의 Tunnel public hostname과 DNS 레코드를 제거한다 (오너, 콘솔).

   ⚠️ **줄을 비우지 말고 지운다.** `LEGACY_API_DOMAIN=`(빈 값)은 unset이 아니라 빈 문자열로
   보간돼 vhost 주소가 `http://`가 되고, `caddy adapt` 실측 결과 **API vhost의 host matcher가
   출력에서 통째로 사라진다.** env 계약이 이 실수를 `must be removed entirely rather than set to
   an empty value`로 막지만, 그 전에 알고 있어야 한다.
8. **(7)이 green인 뒤에** `www.aquilaxk.site`의 Tunnel public hostname과 DNS 레코드를 제거한다
   (오너, 콘솔).

## front 배포 동작 (#1539)

프로필을 켠 뒤부터 front 이미지 갱신은 수동 작업이 아니다. `Deploy to Home Server` 워크플로의
`frontBlueGreenDeploy` job이 담당한다.

- **트리거**: `front/**` 또는 `.github/workflows/frontend-image.yml`이 바뀐 main 커밋. backend
  트리거(`back/`, `deploy/homeserver/`, `deploy/env/`, `tools/env/`)와 겹치지 않으므로 한쪽만
  바뀌면 다른 쪽은 재배포되지 않는다. 두 배포가 같이 도는 커밋에서는 **backend가 먼저** 끝나야
  front가 시작한다(front SSR이 `BACKEND_INTERNAL_URL`로 backend에 의존한다). backend가 실패하면
  front는 아예 실행되지 않는다.
- **이미지**: 배포 대상은 DEPLOY_SHA가 아니라 그 조상 중 마지막으로 front를 바꾼 main 커밋의
  이미지다(`Frontend Image`가 태그를 그 커밋 sha로 붙인다). 러너가 GHCR에서 그 태그의
  `Docker-Content-Digest`를 읽어 digest ref로 바꾼 뒤 홈서버에 넘긴다. 태그 ref는 홈서버에
  도달하지 않으며, 이미지가 아직 push되지 않았으면 최대 30분 기다린 뒤 실패한다.
- **cutover 게이트**: 대기 색 기동 → 컨테이너 health + `/robots.txt` + `/` 렌더 확인 →
  `WEB_UPSTREAM`과 Caddyfile 리터럴 교체 + `caddy reload` → edge(`Host: WEB_DOMAIN`)에서 200 →
  **edge가 서빙하는 `<meta name="aquila-build-sha">`가 배포한 커밋과 일치**. 마지막 단계까지
  통과해야 성공이다. "컨테이너가 떴다"는 성공 근거가 아니다.
- **rollback**: 위 단계 중 하나라도 실패하면 이전 색으로 되돌리고, 되돌린 뒤에도 edge 200과
  **cutover 직전에 관측한 build sha**가 다시 서빙되는지 확인한다. 확인에 실패하면 워크플로는
  실패로 끝난다. 이전 색은 성공한 배포 뒤에도 정지시키지 않는다 — warm rollback 대상이다.
- **증거**: `deploy/homeserver/.front-release-state.env`에 활성/이전 색, 두 색의 digest, 전환
  시각, 서빙 build sha, 결과(`deployed`/`rolled_back`)와 사유가 남는다. 같은 값이 워크플로
  Step Summary의 `## Deploy Boundary (front)` 섹션에도 나온다.
- **프로필이 꺼져 있을 때**: `WEB_DOMAIN`이 없으면 front tier가 아직 이 서버의 일부가 아니라는
  뜻이라 job은 `front_deploy_result=profile_disabled`을 남기고 성공으로 끝난다. 반대로
  `WEB_DOMAIN`이 설정된 채 프로필만 꺼져 있으면 **공개 트래픽을 받는 tier가 배포 대상 밖**이라는
  뜻이므로 job이 실패한다.

## 개통 확인

```bash
# front: 보안 헤더 7종이 next.config.js 정의 그대로 관측되는지
curl -sSI https://blog.aquilaxk.site/ \
  | sed -n '1p;/^[Xx]-/p;/^[Ss]trict/p;/^[Cc]ontent-[Ss]ecurity/p;/^[Rr]eferrer/p;/^[Pp]ermissions/p'

# 정적 자산 장기 캐시
curl -sSI "https://blog.aquilaxk.site/_next/static/<실제 asset 경로>" | grep -i cache-control

# SEO 진입점이 새 도메인을 가리키는지. front/public/robots.txt는 tracked 정적 파일이고
# package.json의 postbuild가 next-sitemap을 스킵하므로 빌드가 이 값을 갱신하지 않는다.
# 그래서 #1540이 Host/Sitemap을 https://blog.aquilaxk.site로 직접 정정했다 — 그 전까지
# https://aquilaxk.vercel.app을 광고했고, #1542로 Vercel이 내려가면 404가 될 값이었다.
curl -sS https://blog.aquilaxk.site/robots.txt
curl -sS -o /dev/null -w "sitemap=%{http_code}\n" https://blog.aquilaxk.site/sitemap.xml

# api.blog 개통
curl -sS https://api.blog.aquilaxk.site/actuator/health/readiness

# edge CORS allowlist (blog origin만 허용되어야 한다)
curl -sSI -H 'Origin: https://blog.aquilaxk.site' \
  https://api.blog.aquilaxk.site/actuator/health/readiness | grep -i access-control-allow-origin
curl -sSI -H 'Origin: https://www.aquilaxk.site' \
  https://api.blog.aquilaxk.site/actuator/health/readiness | grep -i access-control-allow-origin

# 구 hostname 폐기 확인 (7~8번 이후)
dig +short api.aquilaxk.site
curl -sSI --max-time 10 https://api.aquilaxk.site/actuator/health/readiness ; echo "exit=$?"
```

`www.aquilaxk.site`는 apex와 함께 **타 서비스가 사용**하므로 제거 후에도 응답이 올 수 있다.
확인 기준은 "우리 Tunnel public hostname 목록과 우리 Caddy 설정에 남아 있지 않은 것"이며, 응답이
오면 우리 홈서버에서 나온 것인지 `x-request-id` 등 우리 헤더 유무로 구분한다.

## Rollback

| 상황 | 되돌리는 방법 |
| --- | --- |
| `blog.aquilaxk.site`가 홈서버에서 정상 동작하지 않음 (3~5단계) | Cloudflare 콘솔에서 `blog.aquilaxk.site` public hostname을 삭제하고 DNS 레코드를 **Vercel을 가리키던 이전 값으로 되돌린다.** Vercel 프로젝트는 이 시점까지 살아 있으므로 즉시 복구된다. `front/vercel.json` 제거는 #1542 소관이며, 그 전까지 Vercel은 rollback 경로로 유지한다. |
| `api.blog.aquilaxk.site` 전환 후 백엔드 장애 (4단계 이후) | `HOME_SERVER_ENV`의 `API_DOMAIN`·`CUSTOM_PROD_BACKURL`·`CUSTOM_PROD_FRONTURL`·`CUSTOM_PROD_COOKIEDOMAIN`·`WEB_DOMAIN`을 이전 값으로 되돌려 재배포한다. `LEGACY_API_DOMAIN` 덕분에 구 API 호스트는 7단계 전까지 Caddy vhost로 계속 매치되므로, env를 되돌리는 즉시 구 경로가 살아난다. |
| 5단계 직후 blog 도메인 문제 | **blog DNS를 되돌리고 `HOME_SERVER_ENV`도 함께 되돌린다.** 구 API 호스트는 라우팅만 살아 있고 쿠키 `Domain`은 이미 `blog.aquilaxk.site`라 구 web origin에서 로그인이 성립하지 않는다. DNS만 되돌리면 "사이트는 뜨는데 로그인이 안 되는" 상태가 된다. 이중 호스트가 줄여 주는 것은 공개 GET 경로의 다운타임이지 rollback 단계 수가 아니다. |
| front 이미지 하나가 문제 (개통 후) | 되돌릴 것이 이미지뿐이면 `COMPOSE_PROFILES`를 건드리지 않는다. 직전 커밋을 revert해 main에 올리면 그 커밋의 front 이미지로 다시 cutover된다. 즉시 되돌려야 하면 `deploy/homeserver/.front-release-state.env`의 `front_previous_image`가 직전 digest이고, 그 색은 아직 떠 있다. |
| front 컨테이너만 문제 | `COMPOSE_PROFILES`에서 `front`를 빼고 재배포하면 front 서비스가 기동 대상에서 빠진다. 그 상태에서 `blog.aquilaxk.site`는 Caddy가 502를 내므로, 공개 노출 중이라면 위 첫 행의 DNS 되돌리기를 함께 한다. **`WEB_DOMAIN`도 같이 빼야 한다** — 프로필만 끄고 `WEB_DOMAIN`을 남기면 #1539의 front 배포가 "공개 트래픽을 받는 tier가 배포 대상 밖"으로 판정해 이후 front 배포마다 실패한다. |
| 7단계까지 끝난 뒤 문제 발견 (구 API hostname 제거 후) | 구 API 경로 rollback은 없다. `LEGACY_API_DOMAIN`을 다시 넣고 DNS/Tunnel hostname을 재생성해야 한다. 그래서 7단계는 (6)이 전부 green인 뒤에만 한다. |
| 8단계까지 끝난 뒤 문제 발견 | 도메인 rollback 경로는 없다. 구 hostname을 다시 만들어야 하며, 그래서 8단계는 (7)이 green인 뒤에만 한다. |

## 저장소 쪽 fail-safe

- `WEB_DOMAIN`이 비면 Caddy web vhost는 `http://{$WEB_DOMAIN:web.localhost}`의 기본값으로 내려앉아
  공개 트래픽을 받지 않는다. 기본값이 없으면 주소가 `http://`가 되어 **host matcher 없는 :80
  catch-all**이 되므로(caddy adapt로 실측) 반드시 기본값을 유지한다.
- `FRONT_*_IMAGE`가 비면 compose `front` 프로필이 꺼진 채로 `docker compose config`가 통과하고,
  프로필을 켠 채 키가 비면 compose가 `neither an image nor a build context`로 실패한다.
  `${FRONT_BLUE_IMAGE:?}` 형태를 쓰면 프로필과 무관하게 보간 단계에서 죽어 기존 배포·백업·doctor의
  compose 평가가 전부 깨지므로 쓰지 않는다.
- `WEB_DOMAIN`은 `materialize_service_env.sh`의 caddy 키 allowlist에 있어야 `.env.caddy.prod`로
  전달된다. 빠지면 vhost가 조용히 `web.localhost` 기본값으로 내려앉는다. `LEGACY_API_DOMAIN`도
  같은 allowlist에 있다.
- **present-but-empty는 absent와 다르다.** Caddy의 `{$VAR:default}`는 변수가 unset일 때만 기본값을
  쓴다. `KEY=`로 비워 두면 빈 문자열이 그대로 보간돼 `LEGACY_API_DOMAIN`은 API vhost를 지우고,
  `WEB_DOMAIN`은 :80 catch-all을, `WEB_UPSTREAM`은 `reverse_proxy :3000`을 만든다. 두 층이 막는다:
  env 계약이 `must be removed entirely rather than set to an empty value`로 실패시키고,
  `materialize_service_env.sh`가 빈 값 caddy 키를 아예 내보내지 않는다.
- 전환 창이 열려 있는 동안(`LEGACY_API_DOMAIN` 설정됨) **매 배포마다 경고가 뜬다.** 창을 닫는 것을
  잊지 않기 위한 장치다.
