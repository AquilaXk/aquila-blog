import { CONFIG } from "site.config"

/** 홈서버 단일 이미지가 전용 호스트로 함께 서빙하는 공개 표면. */
export type PublicSurface = keyof typeof CONFIG.surfaces

const HOST_PATTERN = /^[a-z0-9.-]+(?::\d{1,5})?$/
const LOCAL_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/

const hostOf = (absoluteUrl: string) => absoluteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()

/**
 * 요청 `Host`를 이 앱이 아는 표면 호스트 하나로 좁힌다. 모르는 값이면 빈 문자열이다.
 *
 * Host 헤더는 신뢰 경계 밖에 있다. 공개 경로에서는 Cloudflare Tunnel이 실제 호스트를 넣고 Caddy가
 * 그대로 올려 주지만, compose 네트워크의 컨테이너는 front를 직접 부르면서 아무 값이나 넣을 수 있다.
 * 그 값을 canonical/OG에 그대로 흘리면 우리 페이지가 남의 호스트를 정본으로 광고한다.
 */
const normalizeKnownHost = (requestHost: string | undefined) => {
  // 프록시가 헤더를 합치면 `a, b` 형태가 된다. 첫 값만 본다.
  const host = (requestHost || "").split(",")[0].trim().toLowerCase()
  return HOST_PATTERN.test(host) ? host : ""
}

/**
 * 표면의 공개 URL을 요청 호스트 기준으로 고른다.
 *
 * 전용 호스트로 들어온 요청은 Caddy가 루트를 그 표면 라우트로 rewrite한 것이므로 공개 URL은
 * 호스트 루트다. 블로그 호스트나 로컬(dev/e2e)로 들어온 요청은 라우트 경로 자신이 공개 URL이다.
 * 그 밖의 값은 전용 호스트 정본으로 떨어진다 — 알 수 없는 호스트를 canonical로 승격시키지 않는다.
 */
export const resolvePublicSurfaceUrl = (surface: PublicSurface, requestHost: string | undefined) => {
  const { url, route } = CONFIG.surfaces[surface]
  const host = normalizeKnownHost(requestHost)

  if (host === hostOf(url)) return url
  if (host === hostOf(CONFIG.link)) return `${CONFIG.link}${route}`
  if (LOCAL_HOST_PATTERN.test(host)) return `http://${host}${route}`
  return url
}

/** 이 표면의 전용 호스트로 들어온 요청인지. 블로그 전용 라우트(sitemap 등)의 분기에 쓴다. */
export const isPublicSurfaceHost = (surface: PublicSurface, requestHost: string | undefined) =>
  normalizeKnownHost(requestHost) === hostOf(CONFIG.surfaces[surface].url)
