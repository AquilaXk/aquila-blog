# 홈서버 front 도메인 전환 순서 (#1538)

`blog.aquilaxk.site`와 `api.blog.aquilaxk.site`를 Cloudflare Tunnel → Caddy → 홈서버 컨테이너로
개통하는 절차다. 현재 `blog.aquilaxk.site`는 **Vercel**을 가리키고 있고, `api.aquilaxk.site`는
이미 홈서버를 가리킨다. 이 문서는 그 두 호스트를 홈서버 front/back으로 옮기는 순서와 되돌리는
경로만 다룬다.

- 저장소 쪽 변경(#1538): compose front 서비스, Caddy `{$WEB_DOMAIN}` vhost, env 계약.
- env 값 전환(#1540): `API_DOMAIN`, `CUSTOM_PROD_BACKURL`, `CUSTOM_PROD_FRONTURL`,
  `CUSTOM_PROD_COOKIEDOMAIN`.
- blue/green 전환 로직과 `FRONT_*_IMAGE` 주입(#1539).
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
   - `FRONT_BLUE_IMAGE=ghcr.io/aquilaxk/aquila-blog-front@sha256:...` (digest 전용)
   - `FRONT_GREEN_IMAGE=ghcr.io/aquilaxk/aquila-blog-front@sha256:...` — **`FRONT_BLUE_IMAGE`와
     같은 digest를 그대로 적는다.** 두 색깔이 모두 정의돼 있어 프로필을 켜면 두 키가 모두 필요하고,
     compose는 image가 빈 서비스를 `neither an image nor a build context`로 거부한다. 값을 비워
     두면 안 된다. 두 digest가 갈라지는 것은 cutover 시점(#1539가 새 색깔에만 새 digest를 넣는다)
     이며, `BACK_BLUE_IMAGE`/`BACK_GREEN_IMAGE`가 이미 같은 방식으로 동작한다.
   - `BACKEND_INTERNAL_URL=http://back-blue:8080` — **없으면 front가 모든 SSR 경로에서 500이다.**
     `front/src/libs/server/backend.ts`가 production에서 이 값 없이는 throw하고, 이미지가
     `NODE_ENV=production`을 박고 있다. compose 내부 주소만 쓰고 공개 인터넷을 왕복하지 않는다.
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
   # healthy는 정적 서빙만 증명한다. SSR이 실제로 도는지는 여기서 직접 본다.
   docker compose exec -T front_blue wget -qS -O /dev/null http://127.0.0.1:3000/ 2>&1 | head -3
   docker compose exec -T front_blue printenv BACKEND_INTERNAL_URL
   ```
   `/`가 200이 아니거나 `BACKEND_INTERNAL_URL`이 비어 있으면 **3단계로 넘어가지 않는다.**
3. **DNS 레코드와 Tunnel public hostname을 둘 다 만든다 (오너, 콘솔).**
   - `blog.aquilaxk.site` → `http://caddy:80`
   - `api.blog.aquilaxk.site` → `http://caddy:80`

   구 hostname(`www.aquilaxk.site`, `api.aquilaxk.site`)은 이 단계에서 **그대로 둔다.** 네 호스트가
   동시에 살아 있는 상태가 정상이다.
4. **#1540의 env 전환을 한 배포로 함께 적용한다.** `API_DOMAIN`·`CUSTOM_PROD_BACKURL`·
   `CUSTOM_PROD_FRONTURL`·`CUSTOM_PROD_COOKIEDOMAIN`, 그리고 **`WEB_DOMAIN=blog.aquilaxk.site`를
   같은 배포에서 함께** 넣는다. 셋을 동시에 넣어야 `urlHostEquals(CUSTOM_PROD_FRONTURL,
   WEB_DOMAIN)`이 처음부터 만족되고, `API_DOMAIN`이 새 topology로 가는 순간 `WEB_DOMAIN`이
   `requiredWhen`으로 필수가 되므로 빠뜨리면 배포가 멈춘다(공개 도메인만 404가 되는 대신).
   이 배포 시점부터 Caddy
   `{$API_DOMAIN}` vhost가 새 호스트로 바뀌므로 **구 `api.aquilaxk.site`는 Caddy vhost 미매치가
   된다.** 구 API hostname은 rollback 경로가 아니다 — rollback은 env 되돌리기다.

   **선행 조건: edge CORS allowlist에 `https://blog.aquilaxk.site`가 먼저 들어가 있어야 한다.**
   `Caddyfile`의 `@corsAllowed`·`@corsPreflight`는 `^https://(www\.)?aquilaxk\.site$`로
   `blog.aquilaxk.site`와 매치되지 않는다. 그 정규식 교체는 #1540(PR #1555) 소관이며, 이 PR은
   해당 라인을 건드리지 않았다. 정규식이 배포되지 않은 채로 4단계를 하면 브라우저의
   `blog.aquilaxk.site` → `api.blog.aquilaxk.site` 요청이 `Access-Control-Allow-Origin`을 받지
   못하고, 5단계의 CORS 확인도 실패한다. 같은 배포에 포함시키는 것이 가장 안전하다.
5. **확인.** 아래 "개통 확인"의 명령이 전부 green이어야 한다.
6. **(5)가 green인 뒤에** `www.aquilaxk.site`와 `api.aquilaxk.site`의 Tunnel public hostname과 DNS
   레코드를 제거한다 (오너, 콘솔). (5) 전에 6을 하면 도메인 rollback 경로가 사라진다.

## 개통 확인

```bash
# front: 보안 헤더 7종이 next.config.js 정의 그대로 관측되는지
curl -sSI https://blog.aquilaxk.site/ \
  | sed -n '1p;/^[Xx]-/p;/^[Ss]trict/p;/^[Cc]ontent-[Ss]ecurity/p;/^[Rr]eferrer/p;/^[Pp]ermissions/p'

# 정적 자산 장기 캐시
curl -sSI "https://blog.aquilaxk.site/_next/static/<실제 asset 경로>" | grep -i cache-control

# SEO 진입점이 새 도메인을 가리키는지. front/public/robots.txt는 tracked 정적 파일이고
# package.json의 postbuild가 next-sitemap을 스킵하므로 빌드가 이 값을 갱신하지 않는다.
# 현재 이 파일은 Host/Sitemap을 vercel.app으로 광고한다 — 전환 전에 정정돼야 하고,
# #1542로 Vercel이 내려가면 그 sitemap URL은 404가 된다.
curl -sS https://blog.aquilaxk.site/robots.txt
curl -sS -o /dev/null -w "sitemap=%{http_code}\n" https://blog.aquilaxk.site/sitemap.xml

# api.blog 개통
curl -sS https://api.blog.aquilaxk.site/actuator/health/readiness

# edge CORS allowlist (blog origin만 허용되어야 한다)
curl -sSI -H 'Origin: https://blog.aquilaxk.site' \
  https://api.blog.aquilaxk.site/actuator/health/readiness | grep -i access-control-allow-origin
curl -sSI -H 'Origin: https://www.aquilaxk.site' \
  https://api.blog.aquilaxk.site/actuator/health/readiness | grep -i access-control-allow-origin

# 구 hostname 폐기 확인 (6번 이후)
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
| `api.blog.aquilaxk.site` 전환 후 백엔드 장애 (4단계 이후) | `HOME_SERVER_ENV`의 `API_DOMAIN`·`CUSTOM_PROD_BACKURL`·`CUSTOM_PROD_FRONTURL`·`CUSTOM_PROD_COOKIEDOMAIN`을 이전 값으로 되돌려 재배포한다. 구 hostname은 6단계 전까지 살아 있으므로 Caddy vhost가 다시 매치된다. |
| front 컨테이너만 문제 | `COMPOSE_PROFILES`에서 `front`를 빼고 재배포하면 front 서비스가 기동 대상에서 빠진다. 그 상태에서 `blog.aquilaxk.site`는 Caddy가 502를 내므로, 공개 노출 중이라면 위 첫 행의 DNS 되돌리기를 함께 한다. |
| 6단계까지 끝난 뒤 문제 발견 | 도메인 rollback 경로는 없다. 구 hostname을 다시 만들어야 하며, 그래서 6단계는 (5)가 전부 green인 뒤에만 한다. |

## 저장소 쪽 fail-safe

- `WEB_DOMAIN`이 비면 Caddy web vhost는 `http://{$WEB_DOMAIN:web.localhost}`의 기본값으로 내려앉아
  공개 트래픽을 받지 않는다. 기본값이 없으면 주소가 `http://`가 되어 **host matcher 없는 :80
  catch-all**이 되므로(caddy adapt로 실측) 반드시 기본값을 유지한다.
- `FRONT_*_IMAGE`가 비면 compose `front` 프로필이 꺼진 채로 `docker compose config`가 통과하고,
  프로필을 켠 채 키가 비면 compose가 `neither an image nor a build context`로 실패한다.
  `${FRONT_BLUE_IMAGE:?}` 형태를 쓰면 프로필과 무관하게 보간 단계에서 죽어 기존 배포·백업·doctor의
  compose 평가가 전부 깨지므로 쓰지 않는다.
- `WEB_DOMAIN`은 `materialize_service_env.sh`의 caddy 키 allowlist에 있어야 `.env.caddy.prod`로
  전달된다. 빠지면 vhost가 조용히 `web.localhost` 기본값으로 내려앉는다.
