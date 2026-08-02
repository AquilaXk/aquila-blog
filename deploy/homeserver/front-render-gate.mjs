#!/usr/bin/env node

// front-render-gate.mjs (#1541)
//
// 홈서버 front가 "200을 돌려준다"가 아니라 "실제로 렌더/재생성/최적화한다"를 확인하는 게이트다.
// 이 저장소의 알려진 결함 클래스는 "성공으로 보고되는 열화"이고, front 이전에서 그 형태는 전부
// 상태 코드가 정상인 채로 나타난다: SSR이 백엔드 데이터 없이 껍데기를 렌더해도 200, ISR 재생성이
// 실패해 stale이 영원히 나가도 200, 이미지 최적화가 꺼져 원본이 그대로 나가도 200이다.
//
// 이 게이트의 계층은 앞선 두 게이트 **위**다. 중복하지 않는다:
//   - blue_green_deploy.sh의 front cutover 게이트(#1539)는 liveness/render/backend-proxy 상태
//     코드와 served build sha까지 본다. "그 컨테이너가 떴고 edge가 그 빌드를 서빙한다"까지다.
//   - deploy.yml의 web-host API route 스모크(#1575)는 same-origin 라우팅이 2xx인지 본다.
//   - 여기서 보는 것은 그 위, **응답 내용**이다.
//
// 실행 위치: 홈서버(공개 URL 또는 edge 네트워크 + Host 헤더). 상시 프로브가 아니라 전환/배포 후
// 1회 실행하는 게이트다 - ISR 시간 기반 검증이 revalidate 주기만큼 대기하므로 스크레이프 루프에
// 넣을 수 없다. 상시 관측은 public_edge_probe와 docker_runtime_probe가 담당한다.
//
// 어떤 검사도 실패를 warning으로 낮추거나 조용히 skip하지 않는다. 하나라도 실패하면 exit 1이다.

import http from "node:http"
import https from "node:https"
import { realpathSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

const DEFAULT_ISR_ROUTE = "/"
// front/src/pages/index.tsx의 HOME_ISR_REVALIDATE_SECONDS와 같은 값이다. 홈이 이 앱에서 가장 짧은
// 정상 경로 revalidate라 시간 기반 검증 대상이다(상세는 3600s, degraded/recovery 경로는 30s이지만
// 그 경로는 장애 상태에서만 선택된다). 드리프트는 tools/test/front-render-gate.test.mjs가 잡는다.
const DEFAULT_ISR_REVALIDATE_SECONDS = 60
const DEFAULT_API_FEED_PATH = "/post/api/v1/posts/feed?page=1&pageSize=5&sort=CREATED_AT"
// front/public/brand-mascot.png. tracked 정적 파일이라 원본 바이트가 고정돼 있고, 상대 URL이라
// next/image remotePatterns와 무관하게 최적화 파이프라인만 검증한다.
const DEFAULT_ORIGIN_IMAGE_PATH = "/brand-mascot.png"
const DEFAULT_IMAGE_WIDTH = 640
const DEFAULT_IMAGE_QUALITY = 75
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_POLL_INTERVAL_MS = 3_000
// STALE -> HIT 전이 실측(2026-08-02 홈서버): 재생성 트리거 후 3초 안에 HIT. 60s는 그 20배이고,
// 이 시간을 넘겨도 STALE이면 "재생성이 끝나지 않은 채 stale만 계속 나간다"가 관측된 사실이다.
const DEFAULT_REGENERATION_DEADLINE_MS = 60_000
const REVALIDATE_ENDPOINT = "/api/revalidate"

// Next.js가 ISR 응답에 붙이는 값. public-edge-probe.mjs가 캐시 관측 소스로 쓰는 것과 같은 헤더다.
const CACHE_STATE_HEADER = "x-nextjs-cache"
const CACHE_STATE_HIT = "HIT"
const CACHE_STATE_STALE = "STALE"
const KNOWN_CACHE_STATES = new Set([CACHE_STATE_HIT, CACHE_STATE_STALE, "MISS", "REVALIDATED"])

const OPTIMIZED_IMAGE_TYPES = ["image/webp", "image/avif"]

const HELP_TEXT = `front-render-gate.mjs

홈서버 front의 SSR 내용, ISR 재생성, on-demand revalidate, 캐시 헤더, 이미지 최적화를 검증한다.
어떤 검사든 실패하면 exit 1이다.

Usage:
  node deploy/homeserver/front-render-gate.mjs --base-url <url> [options]

Options:
  --base-url <url>                 검증 대상 base URL (필수). 예: https://blog.aquilaxk.site
  --host-header <host>             Host 헤더 override. DNS 전환 전 edge 네트워크에서
                                   --base-url http://caddy:80 과 함께 쓴다.
  --isr-route <path>               시간 기반 ISR 검증 대상 (default: ${DEFAULT_ISR_ROUTE})
  --isr-revalidate-seconds <n>     대상 라우트의 revalidate 값 (default: ${DEFAULT_ISR_REVALIDATE_SECONDS})
  --api-feed-path <path>           SSR 대조용 backend feed 경로
                                   (default: ${DEFAULT_API_FEED_PATH})
  --origin-image-path <path>       이미지 최적화 원본 (default: ${DEFAULT_ORIGIN_IMAGE_PATH})
  --image-width <n>                /_next/image 요청 폭 (default: ${DEFAULT_IMAGE_WIDTH})
  --timeout-ms <ms>                요청 타임아웃 (default: ${DEFAULT_TIMEOUT_MS})
  --poll-interval-ms <ms>          ISR 폴링 간격 (default: ${DEFAULT_POLL_INTERVAL_MS})
  --regeneration-deadline-ms <ms>  STALE -> HIT 대기 상한 (default: ${DEFAULT_REGENERATION_DEADLINE_MS})
  --output-json <file>             JSON 리포트 경로
  --help                           이 도움말

Environment:
  TOKEN_FOR_REVALIDATE 또는 CUSTOM__REVALIDATE__TOKEN
      on-demand revalidate 왕복에 쓰는 공유 토큰. 없으면 게이트는 skip하지 않고 실패한다.
      토큰은 인자로 받지 않는다 - 프로세스 목록과 셸 history에 남기지 않기 위해서다.
      토큰 값은 로그·리포트 어디에도 출력하지 않는다.
`

const parseArgs = (argv) => {
  const args = {
    baseUrl: "",
    hostHeader: "",
    isrRoute: DEFAULT_ISR_ROUTE,
    isrRevalidateSeconds: DEFAULT_ISR_REVALIDATE_SECONDS,
    apiFeedPath: DEFAULT_API_FEED_PATH,
    originImagePath: DEFAULT_ORIGIN_IMAGE_PATH,
    imageWidth: DEFAULT_IMAGE_WIDTH,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    regenerationDeadlineMs: DEFAULT_REGENERATION_DEADLINE_MS,
    outputJson: "",
    help: false,
  }

  const positiveInt = (raw, fallback) => {
    const parsed = Number.parseInt(raw ?? "", 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    switch (token) {
      case "--base-url":
        args.baseUrl = next || ""
        index += 1
        break
      case "--host-header":
        args.hostHeader = next || ""
        index += 1
        break
      case "--isr-route":
        args.isrRoute = next || args.isrRoute
        index += 1
        break
      case "--isr-revalidate-seconds":
        args.isrRevalidateSeconds = positiveInt(next, args.isrRevalidateSeconds)
        index += 1
        break
      case "--api-feed-path":
        args.apiFeedPath = next || args.apiFeedPath
        index += 1
        break
      case "--origin-image-path":
        args.originImagePath = next || args.originImagePath
        index += 1
        break
      case "--image-width":
        args.imageWidth = positiveInt(next, args.imageWidth)
        index += 1
        break
      case "--timeout-ms":
        args.timeoutMs = positiveInt(next, args.timeoutMs)
        index += 1
        break
      case "--poll-interval-ms":
        args.pollIntervalMs = positiveInt(next, args.pollIntervalMs)
        index += 1
        break
      case "--regeneration-deadline-ms":
        args.regenerationDeadlineMs = positiveInt(next, args.regenerationDeadlineMs)
        index += 1
        break
      case "--output-json":
        args.outputJson = next || ""
        index += 1
        break
      case "--help":
        args.help = true
        break
      default:
        if (token.startsWith("--")) throw new Error(`Unknown option: ${token}`)
        break
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "")
  return args
}

// node:http/https를 직접 쓰는 이유: fetch(undici)는 Host를 forbidden header로 취급해 조용히
// 버린다. DNS 전환 전에는 edge 네트워크에서 `Host: <WEB_DOMAIN>`으로 찔러야 하므로 그 경로가
// 없으면 게이트를 전환 전에 돌릴 수 없다.
//
// redirect도 따라가지 않는다. front 라우트가 갑자기 3xx가 되는 것은 게이트가 감춰야 할 상세가
// 아니라 보고해야 할 회귀다.
const request = ({ url, method = "GET", headers = {}, body = null, hostHeader = "", timeoutMs }) =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const secure = target.protocol === "https:"
    const transport = secure ? https : http
    const requestHeaders = { "user-agent": "aquila-front-render-gate/1.0", ...headers }
    if (hostHeader) requestHeaders.host = hostHeader

    const options = {
      method,
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: requestHeaders,
      timeout: timeoutMs,
    }
    if (secure && hostHeader) options.servername = hostHeader

    const clientRequest = transport.request(options, (response) => {
      const chunks = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("end", () => {
        const buffer = Buffer.concat(chunks)
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: buffer,
          text: buffer.toString("utf8"),
        })
      })
    })

    clientRequest.on("timeout", () => {
      clientRequest.destroy(new Error(`timeout after ${timeoutMs}ms: ${method} ${url}`))
    })
    clientRequest.on("error", reject)
    if (body !== null) clientRequest.write(body)
    clientRequest.end()
  })

const header = (headers, name) => {
  const value = headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value.join(", ") : String(value ?? "")
}

const cacheStateOf = (headers) => header(headers, CACHE_STATE_HEADER).trim().toUpperCase()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const uniqueNumbers = (values) => Array.from(new Set(values.filter((value) => Number.isFinite(value))))

const collectPostIds = (xml) =>
  uniqueNumbers(
    Array.from(String(xml || "").matchAll(/\/posts\/(\d+)/g)).map((match) => Number.parseInt(match[1], 10)),
  )

const countMatches = (text, pattern) => Array.from(String(text || "").matchAll(pattern)).length

const parseFirstStaticAsset = (html) => {
  const match = String(html || "").match(/\/_next\/static\/[A-Za-z0-9_/.-]+\.(?:js|css)/)
  return match?.[0] || ""
}

const backendPostIdsOf = (payload) => {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : []
  return uniqueNumbers(rows.map((row) => Number(row?.id)))
}

const failure = (name, reason, detail = {}) => ({ name, ok: false, reason, detail })
const success = (name, detail = {}) => ({ name, ok: true, reason: "", detail })

// ---------------------------------------------------------------------------
// 판정부. 모두 순수 함수이며 tools/test/front-render-gate.test.mjs가 결함 주입으로 RED를 고정한다.
// ---------------------------------------------------------------------------

const judgeSsrBackendData = ({ backend, rss, sitemap }) => {
  const name = "ssr-backend-data"
  if (backend.status !== 200) {
    return failure(name, `backend feed responded ${backend.status}; SSR cross-check has no reference data`)
  }

  const backendIds = backendPostIdsOf(backend.payload)
  if (backendIds.length === 0) {
    return failure(name, "backend feed returned no posts; SSR cross-check has no reference data")
  }

  if (rss.status !== 200) return failure(name, `RSS SSR route responded ${rss.status}`)
  if (!rss.contentType.toLowerCase().includes("xml")) {
    return failure(name, `RSS SSR route returned ${rss.contentType || "no content-type"}, not XML`)
  }
  const rssItems = countMatches(rss.xml, /<item>/g)
  if (rssItems === 0) {
    return failure(name, "RSS SSR route rendered zero items while the backend has posts")
  }
  const rssIds = collectPostIds(rss.xml)
  const rssMatched = backendIds.filter((id) => rssIds.includes(id))
  if (rssMatched.length === 0) {
    return failure(
      name,
      `RSS SSR output shares no post id with the backend feed (backend=${backendIds.join(",")}, rss=${rssIds.join(",")})`,
    )
  }

  if (sitemap.status !== 200) return failure(name, `sitemap SSR route responded ${sitemap.status}`)
  if (!sitemap.contentType.toLowerCase().includes("xml")) {
    return failure(name, `sitemap SSR route returned ${sitemap.contentType || "no content-type"}, not XML`)
  }
  const sitemapIds = collectPostIds(sitemap.xml)
  const sitemapMatched = backendIds.filter((id) => sitemapIds.includes(id))
  if (sitemapMatched.length === 0) {
    return failure(
      name,
      `sitemap SSR output shares no post id with the backend feed (backend=${backendIds.join(",")}, sitemap=${sitemapIds.join(",")})`,
    )
  }

  return success(name, {
    backendPostCount: backendIds.length,
    rssItemCount: rssItems,
    rssMatchedPostIds: rssMatched,
    sitemapMatchedPostIds: sitemapMatched,
  })
}

const judgeStaticImmutableCache = ({ assetPath, status, cacheControl }) => {
  const name = "static-immutable-cache"
  if (!assetPath) {
    return failure(name, "no /_next/static asset reference found in the rendered home page")
  }
  if (status !== 200) return failure(name, `static asset ${assetPath} responded ${status}`)

  const value = String(cacheControl || "").toLowerCase()
  if (!value.includes("max-age=31536000") || !value.includes("immutable")) {
    return failure(
      name,
      `static asset ${assetPath} cache-control is "${cacheControl || "<none>"}", expected public, max-age=31536000, immutable`,
    )
  }
  return success(name, { assetPath, cacheControl })
}

const judgeImageOptimization = ({ origin, optimized }) => {
  const name = "image-optimization"
  if (origin.status !== 200) return failure(name, `origin image responded ${origin.status}`)
  if (optimized.status !== 200) return failure(name, `/_next/image responded ${optimized.status}`)

  const optimizedType = optimized.contentType.toLowerCase().split(";")[0].trim()
  const originType = origin.contentType.toLowerCase().split(";")[0].trim()
  if (!OPTIMIZED_IMAGE_TYPES.includes(optimizedType)) {
    return failure(
      name,
      `/_next/image returned ${optimizedType || "no content-type"}; expected one of ${OPTIMIZED_IMAGE_TYPES.join(", ")}`,
    )
  }
  if (optimized.byteLength <= 0) return failure(name, "/_next/image returned an empty body")
  // 콘텐츠 타입만으로는 부족하다. 원본이 이미 webp/avif면 최적화가 꺼져도 타입 검사를 통과하고
  // 원본 바이트가 그대로 나간다. 크기 비교가 그 경로를 잡는다.
  //
  // 반대로 "타입이 원본과 다른가"를 규칙으로 쓰지 않는 이유: avif 원본을 더 작은 avif로 리사이즈한
  // 정상 응답까지 실패로 만든다.
  if (optimized.byteLength >= origin.byteLength) {
    return failure(
      name,
      `/_next/image body (${optimized.byteLength}B) is not smaller than the origin (${origin.byteLength}B); optimization is off`,
    )
  }
  return success(name, {
    originContentType: originType,
    originByteLength: origin.byteLength,
    optimizedContentType: optimizedType,
    optimizedByteLength: optimized.byteLength,
  })
}

const judgeIsrCacheState = ({ route, status, cacheState }) => {
  const name = "isr-cache-state-header"
  if (status !== 200) return failure(name, `${route} responded ${status}`)
  if (!cacheState) {
    return failure(
      name,
      `${route} carries no ${CACHE_STATE_HEADER} header; public_edge_probe cache observability has no source`,
    )
  }
  if (!KNOWN_CACHE_STATES.has(cacheState)) {
    return failure(name, `${route} reported an unrecognised ${CACHE_STATE_HEADER} value "${cacheState}"`)
  }
  return success(name, { route, cacheState })
}

// stale-while-revalidate는 2단계다. revalidate 창이 지난 첫 요청은 stale을 받으면서 백그라운드
// 재생성을 트리거하고, 그 다음 요청이 새 결과를 받는다. 한 번 찔러 보고 안 바뀌었다고 실패로
// 처리하면 오탐이고, 반대로 stale 200을 성공으로 세면 재생성 실패가 통째로 묻힌다.
const judgeTimedRegeneration = ({
  route,
  revalidateSeconds,
  observedStale,
  staleEtag,
  regeneratedEtag,
  reachedHit,
  ageWaitMs,
  regenerationWaitMs,
}) => {
  const name = "isr-timed-regeneration"
  if (!observedStale) {
    return failure(
      name,
      `${route} never reported ${CACHE_STATE_STALE} within ${Math.round(ageWaitMs / 1000)}s while revalidate=${revalidateSeconds}s; the revalidate window is not being honoured`,
    )
  }
  if (!reachedHit) {
    return failure(
      name,
      `${route} kept serving ${CACHE_STATE_STALE} for ${Math.round(regenerationWaitMs / 1000)}s after the window expired; background regeneration never completed (a stale 200 is not success)`,
    )
  }
  if (!regeneratedEtag) {
    return failure(name, `${route} returned ${CACHE_STATE_HIT} without an ETag; regeneration cannot be verified`)
  }
  if (regeneratedEtag === staleEtag) {
    return failure(
      name,
      `${route} reached ${CACHE_STATE_HIT} but served identical bytes (etag ${regeneratedEtag}); nothing was regenerated`,
    )
  }
  return success(name, { route, revalidateSeconds, staleEtag, regeneratedEtag, regenerationWaitMs })
}

const judgeOnDemandRevalidate = ({
  route,
  unauthorizedStatus,
  status,
  payload,
  beforeEtag,
  afterEtag,
  afterCacheState,
  elapsedMs,
  revalidateSeconds,
}) => {
  const name = "isr-on-demand-revalidate"
  if (unauthorizedStatus !== 401) {
    return failure(
      name,
      `${REVALIDATE_ENDPOINT} answered ${unauthorizedStatus} without a token; the token gate is not enforced`,
    )
  }
  if (status !== 200) return failure(name, `${REVALIDATE_ENDPOINT} answered ${status} with a valid token`)
  if (payload?.revalidated !== true) {
    return failure(name, `${REVALIDATE_ENDPOINT} did not report revalidated=true`)
  }
  const paths = Array.isArray(payload?.paths) ? payload.paths : []
  if (!paths.includes(route)) {
    return failure(name, `${REVALIDATE_ENDPOINT} reported paths=${JSON.stringify(paths)} without ${route}`)
  }
  if (!beforeEtag || !afterEtag) {
    return failure(name, `${route} did not expose an ETag before/after revalidation; the change cannot be verified`)
  }
  // 귀속 가드: 신선한 창을 벗어난 뒤 비교하면 시간 기반 재생성이 만든 변화를 on-demand의 성과로
  // 착각한다. 창을 벗어났으면 통과가 아니라 재실행이다.
  if (elapsedMs >= revalidateSeconds * 1000) {
    return failure(
      name,
      `the check took ${elapsedMs}ms with revalidate=${revalidateSeconds}s, so a timed regeneration could explain the change; rerun the gate`,
    )
  }
  if (afterEtag === beforeEtag) {
    return failure(
      name,
      `${REVALIDATE_ENDPOINT} answered 200 but ${route} still serves identical bytes (etag ${afterEtag}); the page was not regenerated`,
    )
  }
  if (afterCacheState !== CACHE_STATE_HIT) {
    return failure(
      name,
      `${route} reported ${CACHE_STATE_HEADER}=${afterCacheState || "<none>"} right after an on-demand revalidate; expected ${CACHE_STATE_HIT}`,
    )
  }
  return success(name, { route, beforeEtag, afterEtag, elapsedMs })
}

// ---------------------------------------------------------------------------
// 수집부
// ---------------------------------------------------------------------------

const resolveRevalidateToken = (env = process.env) =>
  String(env.TOKEN_FOR_REVALIDATE || env.CUSTOM__REVALIDATE__TOKEN || "").trim()

const probeRoute = async (context, route, extraHeaders = {}) => {
  const response = await request({
    url: `${context.baseUrl}${route}`,
    headers: extraHeaders,
    hostHeader: context.hostHeader,
    timeoutMs: context.timeoutMs,
  })
  return {
    status: response.status,
    contentType: header(response.headers, "content-type"),
    cacheControl: header(response.headers, "cache-control"),
    etag: header(response.headers, "etag"),
    cacheState: cacheStateOf(response.headers),
    byteLength: response.body.length,
    text: response.text,
  }
}

const checkSsrBackendData = async (context) => {
  const backend = await probeRoute(context, context.apiFeedPath, { accept: "application/json" })
  let payload = null
  try {
    payload = JSON.parse(backend.text)
  } catch {
    payload = null
  }
  const rss = await probeRoute(context, "/feed")
  const sitemap = await probeRoute(context, "/sitemap.xml")

  return judgeSsrBackendData({
    backend: { status: backend.status, payload },
    rss: { status: rss.status, contentType: rss.contentType, xml: rss.text },
    sitemap: { status: sitemap.status, contentType: sitemap.contentType, xml: sitemap.text },
  })
}

const checkStaticImmutableCache = async (context, homeHtml) => {
  const assetPath = parseFirstStaticAsset(homeHtml)
  if (!assetPath) return judgeStaticImmutableCache({ assetPath: "", status: 0, cacheControl: "" })

  const asset = await probeRoute(context, assetPath)
  return judgeStaticImmutableCache({
    assetPath,
    status: asset.status,
    cacheControl: asset.cacheControl,
  })
}

const checkImageOptimization = async (context) => {
  const origin = await probeRoute(context, context.originImagePath)
  const optimizedPath = `/_next/image?url=${encodeURIComponent(context.originImagePath)}&w=${context.imageWidth}&q=${DEFAULT_IMAGE_QUALITY}`
  const optimized = await probeRoute(context, optimizedPath, {
    accept: "image/avif,image/webp,image/*,*/*;q=0.8",
  })

  return judgeImageOptimization({
    origin: { status: origin.status, contentType: origin.contentType, byteLength: origin.byteLength },
    optimized: {
      status: optimized.status,
      contentType: optimized.contentType,
      byteLength: optimized.byteLength,
    },
  })
}

const checkTimedRegeneration = async (context) => {
  const ageDeadlineMs = context.ageDeadlineMs
  const ageStartedAt = Date.now()
  let sample = await probeRoute(context, context.isrRoute)
  let observedStale = sample.cacheState === CACHE_STATE_STALE

  while (!observedStale && Date.now() - ageStartedAt < ageDeadlineMs) {
    await sleep(context.pollIntervalMs)
    sample = await probeRoute(context, context.isrRoute)
    observedStale = sample.cacheState === CACHE_STATE_STALE
  }
  const ageWaitMs = Date.now() - ageStartedAt

  if (!observedStale) {
    return {
      result: judgeTimedRegeneration({
        route: context.isrRoute,
        revalidateSeconds: context.isrRevalidateSeconds,
        observedStale: false,
        staleEtag: sample.etag,
        regeneratedEtag: "",
        reachedHit: false,
        ageWaitMs,
        regenerationWaitMs: 0,
      }),
      freshAt: 0,
      freshEtag: "",
    }
  }

  const staleEtag = sample.etag
  const regenerationStartedAt = Date.now()
  let reachedHit = sample.cacheState === CACHE_STATE_HIT
  while (!reachedHit && Date.now() - regenerationStartedAt < context.regenerationDeadlineMs) {
    await sleep(context.pollIntervalMs)
    sample = await probeRoute(context, context.isrRoute)
    reachedHit = sample.cacheState === CACHE_STATE_HIT
  }
  const regenerationWaitMs = Date.now() - regenerationStartedAt

  return {
    result: judgeTimedRegeneration({
      route: context.isrRoute,
      revalidateSeconds: context.isrRevalidateSeconds,
      observedStale: true,
      staleEtag,
      regeneratedEtag: reachedHit ? sample.etag : "",
      reachedHit,
      ageWaitMs,
      regenerationWaitMs,
    }),
    freshAt: reachedHit ? Date.now() : 0,
    freshEtag: reachedHit ? sample.etag : "",
  }
}

const checkOnDemandRevalidate = async (context, { freshAt, freshEtag }) => {
  const startedAt = freshAt || Date.now()
  const body = JSON.stringify({ path: context.isrRoute })
  const jsonHeaders = { "content-type": "application/json", "content-length": Buffer.byteLength(body) }

  const unauthorized = await request({
    url: `${context.baseUrl}${REVALIDATE_ENDPOINT}`,
    method: "POST",
    headers: jsonHeaders,
    body,
    hostHeader: context.hostHeader,
    timeoutMs: context.timeoutMs,
  })

  // 반드시 인증된 POST **앞에서** 읽는다. 시간 기반 단계가 실패해 freshEtag가 없을 때 이 값을
  // POST 뒤에 읽으면 재생성된 ETag를 "before"로 집어 before === after가 되고, 실제 원인(시간 기반
  // 검증 실패)과 무관한 "재생성되지 않았다"가 보고된다.
  const before = freshEtag || (await probeRoute(context, context.isrRoute)).etag

  const authorized = await request({
    url: `${context.baseUrl}${REVALIDATE_ENDPOINT}`,
    method: "POST",
    headers: { ...jsonHeaders, "x-revalidate-token": context.revalidateToken },
    body,
    hostHeader: context.hostHeader,
    timeoutMs: context.timeoutMs,
  })
  let payload = null
  try {
    payload = JSON.parse(authorized.text)
  } catch {
    payload = null
  }

  const after = await probeRoute(context, context.isrRoute)

  return judgeOnDemandRevalidate({
    route: context.isrRoute,
    unauthorizedStatus: unauthorized.status,
    status: authorized.status,
    payload,
    beforeEtag: before,
    afterEtag: after.etag,
    afterCacheState: after.cacheState,
    elapsedMs: Date.now() - startedAt,
    revalidateSeconds: context.isrRevalidateSeconds,
  })
}

const runGate = async (options) => {
  const context = {
    baseUrl: options.baseUrl,
    hostHeader: options.hostHeader || "",
    isrRoute: options.isrRoute || DEFAULT_ISR_ROUTE,
    isrRevalidateSeconds: options.isrRevalidateSeconds || DEFAULT_ISR_REVALIDATE_SECONDS,
    apiFeedPath: options.apiFeedPath || DEFAULT_API_FEED_PATH,
    originImagePath: options.originImagePath || DEFAULT_ORIGIN_IMAGE_PATH,
    imageWidth: options.imageWidth || DEFAULT_IMAGE_WIDTH,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    regenerationDeadlineMs: options.regenerationDeadlineMs || DEFAULT_REGENERATION_DEADLINE_MS,
    revalidateToken: options.revalidateToken || "",
  }
  // revalidate 창이 지나도록 기다리는 상한. 15s 여유는 프로브 왕복과 스케줄 지연을 흡수한다.
  // 이 시간 안에 STALE을 못 보면 "창이 지켜지지 않는다"가 관측된 사실이다.
  context.ageDeadlineMs = options.ageDeadlineMs || (context.isrRevalidateSeconds + 15) * 1000

  const checks = []
  const home = await probeRoute(context, context.isrRoute)

  checks.push(await checkSsrBackendData(context))
  checks.push(await checkStaticImmutableCache(context, home.text))
  checks.push(await checkImageOptimization(context))
  checks.push(
    judgeIsrCacheState({ route: context.isrRoute, status: home.status, cacheState: home.cacheState }),
  )

  // 시간 기반 검증을 먼저 끝내 신선한 엔트리를 만든 뒤 on-demand를 돌린다. 순서를 뒤집으면
  // on-demand 직후의 바이트 변화가 시간 기반 재생성 때문인지 구분할 수 없다.
  const timed = await checkTimedRegeneration(context)
  checks.push(timed.result)
  checks.push(await checkOnDemandRevalidate(context, timed))

  return {
    baseUrl: context.baseUrl,
    hostHeader: context.hostHeader,
    checkedAt: new Date().toISOString(),
    isrRoute: context.isrRoute,
    isrRevalidateSeconds: context.isrRevalidateSeconds,
    ok: checks.every((check) => check.ok),
    checks,
  }
}

const toReportText = (report) => {
  const lines = [
    "# front render gate",
    "",
    `- baseUrl: ${report.baseUrl}`,
    `- hostHeader: ${report.hostHeader || "<none>"}`,
    `- isrRoute: ${report.isrRoute} (revalidate=${report.isrRevalidateSeconds}s)`,
    `- checkedAt: ${report.checkedAt}`,
    "",
  ]
  for (const check of report.checks) {
    lines.push(`${check.ok ? "PASS" : "FAIL"} ${check.name}`)
    if (!check.ok) lines.push(`  reason: ${check.reason}`)
    if (Object.keys(check.detail || {}).length > 0) {
      lines.push(`  detail: ${JSON.stringify(check.detail)}`)
    }
  }
  lines.push("")
  lines.push(`result: ${report.ok ? "PASS" : "FAIL"}`)
  return lines.join("\n")
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP_TEXT)
    return
  }
  if (!args.baseUrl) {
    throw new Error("--base-url is required")
  }

  // fail closed. 토큰이 없다고 revalidate 검사를 건너뛰면 그 검사가 있다는 사실만 남고
  // 검증은 사라진다.
  const revalidateToken = resolveRevalidateToken()
  if (!revalidateToken) {
    throw new Error(
      "TOKEN_FOR_REVALIDATE (or CUSTOM__REVALIDATE__TOKEN) is required; the on-demand revalidate check is not optional",
    )
  }

  const report = await runGate({ ...args, revalidateToken })
  process.stdout.write(`${toReportText(report)}\n`)

  if (args.outputJson) {
    await fs.mkdir(path.dirname(args.outputJson), { recursive: true })
    await fs.writeFile(args.outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  if (!report.ok) process.exitCode = 1
}

const isCliEntry = () => {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entryPath)).href
  } catch {
    return import.meta.url === pathToFileURL(entryPath).href
  }
}

if (isCliEntry()) {
  main().catch((error) => {
    process.stderr.write(`[front-render-gate] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

export {
  DEFAULT_API_FEED_PATH,
  DEFAULT_ISR_REVALIDATE_SECONDS,
  DEFAULT_ORIGIN_IMAGE_PATH,
  judgeImageOptimization,
  judgeIsrCacheState,
  judgeOnDemandRevalidate,
  judgeSsrBackendData,
  judgeStaticImmutableCache,
  judgeTimedRegeneration,
  parseFirstStaticAsset,
  resolveRevalidateToken,
  runGate,
  toReportText,
}
