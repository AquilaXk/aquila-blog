import assert from "node:assert/strict"
import http from "node:http"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
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
} from "../../deploy/homeserver/front-render-gate.mjs"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const FIXTURE_TOKEN = "fixture-revalidate-token"
const BACKEND_POST_IDS = [507, 466, 465]

// 원본보다 작은 최적화 산출물을 흉내내기 위한 바이트 (실제 이미지 디코딩은 하지 않는다).
const ORIGIN_IMAGE_BYTES = Buffer.alloc(11188, 1)
const OPTIMIZED_IMAGE_BYTES = Buffer.alloc(2190, 2)

/**
 * 결함 주입이 가능한 가짜 front. ISR 상태 기계(HIT/STALE + 재생성마다 바뀌는 ETag)를 실제
 * 홈서버 실측 동작(2026-08-02: STALE -> 약 3초 뒤 HIT, 재생성마다 ETag 변경)에 맞춰 흉내낸다.
 */
const createFixtureFront = (defects = {}) => {
  // on-demand 귀속 가드는 "시간 기반 단계가 HIT를 본 시각부터 revalidate 창 안에 끝났는가"를 본다.
  // 픽스처는 처음부터 창이 지난 상태로 시작하므로 이 값을 키워도 테스트가 느려지지 않고, 부하가
  // 큰 CI에서 게이트 왕복이 창을 넘겨 "rerun the gate"로 떨어지는 flake만 사라진다.
  const revalidateMs = 30_000
  const regenerationDelayMs = 120
  const state = {
    generation: 1,
    // 시작부터 창이 지난 상태로 둔다. 게이트의 시간 기반 단계가 즉시 STALE을 관측하고 끝나야
    // 테스트가 revalidate 창만큼 대기하지 않는다.
    generatedAt: Date.now() - revalidateMs * 2,
    regenerationScheduled: false,
  }

  const etag = () => `"gen-${state.generation}"`

  const scheduleRegeneration = () => {
    if (defects.staleForever || state.regenerationScheduled) return
    state.regenerationScheduled = true
    setTimeout(() => {
      state.generation += 1
      state.generatedAt = Date.now()
      state.regenerationScheduled = false
    }, regenerationDelayMs).unref()
  }

  const rssItems = () => {
    if (defects.ssrEmptyRss) return ""
    const ids = defects.ssrForeignIds ? [90001, 90002] : BACKEND_POST_IDS
    return ids
      .map(
        (id) =>
          `    <item>\n      <title>post ${id}</title>\n      <link>https://blog.example.test/posts/${id}</link>\n    </item>`,
      )
      .join("\n")
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://fixture.test")
    const route = url.pathname

    if (route === "/") {
      const stale = Date.now() - state.generatedAt >= revalidateMs
      if (stale) scheduleRegeneration()
      const headers = {
        "content-type": "text/html; charset=utf-8",
        "cache-control": `s-maxage=${revalidateMs / 1000}, stale-while-revalidate=31535940`,
      }
      if (!defects.noEtag) headers.etag = etag()
      if (!defects.noCacheHeader) headers["x-nextjs-cache"] = stale ? "STALE" : "HIT"
      response.writeHead(200, headers)
      response.end(
        `<!DOCTYPE html><html><head><script src="/_next/static/chunks/main-${state.generation}.js"></script></head><body>gen ${state.generation}</body></html>`,
      )
      return
    }

    if (route.startsWith("/_next/static/")) {
      response.writeHead(200, {
        "content-type": "application/javascript; charset=UTF-8",
        "cache-control": defects.weakStaticCache
          ? "public, max-age=0, must-revalidate"
          : "public, max-age=31536000, immutable",
      })
      response.end("// chunk\n")
      return
    }

    if (route === "/_next/image") {
      const unoptimized = Boolean(defects.unoptimizedImage)
      response.writeHead(200, {
        "content-type": unoptimized ? "image/png" : "image/webp",
        "cache-control": "public, max-age=60, must-revalidate",
        vary: "Accept",
      })
      response.end(unoptimized ? ORIGIN_IMAGE_BYTES : OPTIMIZED_IMAGE_BYTES)
      return
    }

    if (route === DEFAULT_ORIGIN_IMAGE_PATH) {
      response.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=0" })
      response.end(ORIGIN_IMAGE_BYTES)
      return
    }

    if (route === "/post/api/v1/posts/feed") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(
        JSON.stringify({
          content: defects.backendNoPosts
            ? []
            : BACKEND_POST_IDS.map((id) => ({ id, title: `post ${id}` })),
        }),
      )
      return
    }

    if (route === "/feed") {
      response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" })
      response.end(`<?xml version="1.0"?>\n<rss version="2.0">\n  <channel>\n${rssItems()}\n  </channel>\n</rss>`)
      return
    }

    if (route === "/sitemap.xml") {
      const locs = BACKEND_POST_IDS.map((id) => `  <url><loc>https://blog.example.test/posts/${id}</loc></url>`)
      response.writeHead(200, { "content-type": "text/xml" })
      response.end(`<?xml version="1.0"?>\n<urlset>\n${locs.join("\n")}\n</urlset>`)
      return
    }

    if (route === "/api/revalidate") {
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "POST", "content-type": "application/json" })
        response.end(JSON.stringify({ message: "Method Not Allowed" }))
        return
      }
      const token = request.headers["x-revalidate-token"]
      const authorized = token === FIXTURE_TOKEN || Boolean(defects.revalidateNoTokenGate)
      request.resume()
      if (!authorized) {
        response.writeHead(401, { "content-type": "application/json" })
        response.end(JSON.stringify({ message: "Invalid token or admin session required" }))
        return
      }
      state.generation += 1
      state.generatedAt = Date.now()
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ revalidated: !defects.revalidateFalse, count: 1, paths: ["/"] }))
      return
    }

    response.writeHead(404, { "content-type": "text/html" })
    response.end("<html><body>not found</body></html>")
  })

  return server
}

const withFixtureFront = async (defects, callback) => {
  const server = createFixtureFront(defects)
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const runGateAgainstFixture = (defects = {}) =>
  withFixtureFront(defects, (baseUrl) =>
    runGate({
      baseUrl,
      revalidateToken: FIXTURE_TOKEN,
      isrRevalidateSeconds: 30,
      timeoutMs: 5_000,
      pollIntervalMs: 100,
      ageDeadlineMs: 3_000,
      regenerationDeadlineMs: 3_000,
    }),
  )

const checkNamed = (report, name) => {
  const check = report.checks.find((entry) => entry.name === name)
  assert.ok(check, `missing check ${name} in ${report.checks.map((entry) => entry.name).join(", ")}`)
  return check
}

test("gate passes against a healthy front", async () => {
  const report = await runGateAgainstFixture()

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2))
  assert.deepEqual(
    report.checks.map((check) => check.name),
    [
      "ssr-backend-data",
      "static-immutable-cache",
      "image-optimization",
      "isr-cache-state-header",
      "isr-timed-regeneration",
      "isr-on-demand-revalidate",
    ],
  )
})

test("gate passes when the public edge strips ETag but preserves ISR state transitions", async () => {
  const report = await runGateAgainstFixture({ noEtag: true })

  assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2))
  assert.equal(checkNamed(report, "isr-timed-regeneration").detail.staleEtag, "")
  assert.equal(checkNamed(report, "isr-on-demand-revalidate").detail.afterEtag, "")
})

// --- RED: 각 결함을 주입하면 해당 검사만 실패해야 한다 ------------------------------------

test("RED: SSR route rendering zero items while the backend has posts fails", async () => {
  const report = await runGateAgainstFixture({ ssrEmptyRss: true })

  assert.equal(report.ok, false)
  const check = checkNamed(report, "ssr-backend-data")
  assert.equal(check.ok, false)
  assert.match(check.reason, /rendered zero items/)
})

test("RED: SSR output that shares no post id with the backend fails", async () => {
  const report = await runGateAgainstFixture({ ssrForeignIds: true })

  const check = checkNamed(report, "ssr-backend-data")
  assert.equal(check.ok, false)
  assert.match(check.reason, /shares no post id/)
})

test("RED: a static asset without the immutable long cache fails", async () => {
  const report = await runGateAgainstFixture({ weakStaticCache: true })

  const check = checkNamed(report, "static-immutable-cache")
  assert.equal(check.ok, false)
  assert.match(check.reason, /max-age=31536000/)
})

test("RED: /_next/image returning the origin bytes fails", async () => {
  const report = await runGateAgainstFixture({ unoptimizedImage: true })

  const check = checkNamed(report, "image-optimization")
  assert.equal(check.ok, false)
  assert.match(check.reason, /expected one of image\/webp, image\/avif/)
})

// 원본이 이미 webp/avif인 경우: 콘텐츠 타입 검사만으로는 최적화가 꺼진 것을 구분할 수 없고
// 크기 비교가 유일한 신호다.
test("RED: an already-modern origin served back unchanged fails on size, not type", () => {
  const result = judgeImageOptimization({
    origin: { status: 200, contentType: "image/webp", byteLength: 4096 },
    optimized: { status: 200, contentType: "image/webp", byteLength: 4096 },
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /optimization is off/)
})

test("RED: a front that stops emitting the ISR cache header fails", async () => {
  const report = await runGateAgainstFixture({ noCacheHeader: true })

  const check = checkNamed(report, "isr-cache-state-header")
  assert.equal(check.ok, false)
  assert.match(check.reason, /x-nextjs-cache/)
})

test("RED: serving stale 200 forever is not counted as success", async () => {
  const report = await runGateAgainstFixture({ staleForever: true })

  const check = checkNamed(report, "isr-timed-regeneration")
  assert.equal(check.ok, false)
  assert.match(check.reason, /regeneration never completed/)

  // 이 fixture에서 on-demand revalidate는 정상 동작한다(백그라운드 재생성만 죽어 있다). 그런데
  // "before" ETag를 revalidate POST **뒤에** 읽으면 before === after가 되어 멀쩡한 on-demand
  // 경로까지 실패로 보고된다 - 진짜 원인을 가리는 오탐이다.
  const onDemand = checkNamed(report, "isr-on-demand-revalidate")
  assert.equal(onDemand.ok, true, onDemand.reason)
})

test("RED: /api/revalidate answering 200 without revalidated=true fails", async () => {
  const report = await runGateAgainstFixture({ revalidateFalse: true })

  const check = checkNamed(report, "isr-on-demand-revalidate")
  assert.equal(check.ok, false)
  assert.match(check.reason, /revalidated=true/)
})

test("RED: /api/revalidate accepting an unauthenticated request fails", async () => {
  const report = await runGateAgainstFixture({ revalidateNoTokenGate: true })

  const check = checkNamed(report, "isr-on-demand-revalidate")
  assert.equal(check.ok, false)
  assert.match(check.reason, /token gate is not enforced/)
})

test("RED: an empty backend feed is reported instead of silently passing the SSR check", async () => {
  const report = await runGateAgainstFixture({ backendNoPosts: true })

  const check = checkNamed(report, "ssr-backend-data")
  assert.equal(check.ok, false)
  assert.match(check.reason, /no reference data/)
})

// --- 판정부 단위 검증 -----------------------------------------------------------------

test("judgeSsrBackendData rejects non-XML SSR responses", () => {
  const result = judgeSsrBackendData({
    backend: { status: 200, payload: { content: [{ id: 1 }] } },
    rss: { status: 200, contentType: "text/html", xml: "<html><item></item>/posts/1</html>" },
    sitemap: { status: 200, contentType: "text/xml", xml: "<loc>/posts/1</loc>" },
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /not XML/)
})

test("judgeStaticImmutableCache reports a missing asset reference instead of passing", () => {
  const result = judgeStaticImmutableCache({ assetPath: "", status: 0, cacheControl: "" })

  assert.equal(result.ok, false)
  assert.match(result.reason, /no \/_next\/static asset reference/)
})

test("judgeImageOptimization rejects an optimized body that is not smaller", () => {
  const result = judgeImageOptimization({
    origin: { status: 200, contentType: "image/png", byteLength: 1000 },
    optimized: { status: 200, contentType: "image/webp", byteLength: 1000 },
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /not smaller than the origin/)
})

test("judgeIsrCacheState rejects an unknown cache-state value", () => {
  assert.equal(judgeIsrCacheState({ route: "/", status: 200, cacheState: "HIT" }).ok, true)
  assert.equal(judgeIsrCacheState({ route: "/", status: 200, cacheState: "" }).ok, false)
  assert.equal(judgeIsrCacheState({ route: "/", status: 200, cacheState: "PRERENDER" }).ok, false)
})

test("judgeTimedRegeneration distinguishes a window that never expires from a regeneration that never lands", () => {
  const neverStale = judgeTimedRegeneration({
    route: "/",
    revalidateSeconds: 60,
    observedStale: false,
    staleEtag: "a",
    regeneratedEtag: "",
    reachedHit: false,
    ageWaitMs: 75_000,
    regenerationWaitMs: 0,
  })
  assert.equal(neverStale.ok, false)
  assert.match(neverStale.reason, /revalidate window is not being honoured/)

  const neverRegenerated = judgeTimedRegeneration({
    route: "/",
    revalidateSeconds: 60,
    observedStale: true,
    staleEtag: "a",
    regeneratedEtag: "",
    reachedHit: false,
    ageWaitMs: 61_000,
    regenerationWaitMs: 60_000,
  })
  assert.equal(neverRegenerated.ok, false)
  assert.match(neverRegenerated.reason, /stale 200 is not success/)
})

test("judgeOnDemandRevalidate refuses to attribute a change made outside the fresh window", () => {
  const base = {
    route: "/",
    unauthorizedStatus: 401,
    status: 200,
    payload: { revalidated: true, paths: ["/"] },
    beforeEtag: "a",
    afterEtag: "b",
    afterCacheState: "HIT",
    revalidateSeconds: 60,
  }

  assert.equal(judgeOnDemandRevalidate({ ...base, elapsedMs: 4_000 }).ok, true)

  const drifted = judgeOnDemandRevalidate({ ...base, elapsedMs: 61_000 })
  assert.equal(drifted.ok, false)
  assert.match(drifted.reason, /rerun the gate/)
})

test("parseFirstStaticAsset finds the first hashed chunk reference", () => {
  assert.equal(
    parseFirstStaticAsset('<script src="/_next/static/chunks/polyfills-42372ed130431b0a.js"></script>'),
    "/_next/static/chunks/polyfills-42372ed130431b0a.js",
  )
  assert.equal(parseFirstStaticAsset("<html></html>"), "")
})

test("the revalidate token is read from the environment, never from argv", () => {
  assert.equal(resolveRevalidateToken({ TOKEN_FOR_REVALIDATE: " token-a " }), "token-a")
  assert.equal(resolveRevalidateToken({ CUSTOM__REVALIDATE__TOKEN: "token-b" }), "token-b")
  assert.equal(resolveRevalidateToken({}), "")

  const source = readFileSync(path.join(repoRoot, "deploy/homeserver/front-render-gate.mjs"), "utf8")
  assert.doesNotMatch(source, /"--revalidate-token"/)
})

// 게이트의 시간 기반 단계는 대상 라우트의 revalidate 값보다 오래 기다려야 한다. 앱이 그 값을
// 늘리면 게이트 기본값이 조용히 너무 짧아져 "창이 지켜지지 않는다"는 오탐을 만든다.
test("the gate default matches the home route revalidate value in the app", () => {
  const homePage = readFileSync(path.join(repoRoot, "front/src/pages/index.tsx"), "utf8")
  const match = homePage.match(/const HOME_ISR_REVALIDATE_SECONDS = (\d+)/)

  assert.ok(match, "HOME_ISR_REVALIDATE_SECONDS not found in front/src/pages/index.tsx")
  assert.equal(Number(match[1]), DEFAULT_ISR_REVALIDATE_SECONDS)
})

// 정적 자산 삭제는 게이트를 조용히 깨뜨린다: 기본 probe 원본이 사라지면 image-optimization은
// "origin image responded 404"로 항상 실패하고, 그 자산을 지운 PR의 diff에는 게이트 파일이 없어
// 리뷰가 소비자 파손을 보지 못한다(#1612). svg는 /_next/image 최적화 대상이 아니라 raster도 함께
// 요구한다.
test("the gate default origin image is a raster asset that still exists in front/public", () => {
  assert.match(DEFAULT_ORIGIN_IMAGE_PATH, /^\/[^?#]+\.(?:png|jpe?g|webp|avif)$/)

  const assetPath = path.join(repoRoot, "front/public", DEFAULT_ORIGIN_IMAGE_PATH)
  assert.ok(existsSync(assetPath), `${DEFAULT_ORIGIN_IMAGE_PATH} is missing from front/public`)
})
