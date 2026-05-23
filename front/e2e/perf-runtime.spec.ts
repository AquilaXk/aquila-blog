import { expect, test } from "@playwright/test"
import {
  PERF_RUNTIME_GUARD_TRIALS,
  QA_ENGINE_ROUTE,
  average,
  buildMockExploreItem,
  clsAssertionEpsilon,
  clsBudget,
  detailEntryBudgetMs,
  editorCommitP95BudgetMs,
  editorInputLongTaskRatioBudget,
  editorTypingP95BudgetMs,
  feedScrollLongFrameRatioBudget,
  feedScrollMaxFrameGapBudgetMs,
  getLayoutSnapshot,
  getMaxHorizontalJitter,
  gotoForPerf,
  homeClsBudget,
  homeFcpBudgetMs,
  installClsObserver,
  jitterBudgetPx,
  mockDetailRailEndpoint,
  mockFeedEndpoints,
  recordRuntimeGuardMetric,
  recordRuntimeGuardMetricWithAliases,
  refreshCheckRoutes,
  reloadForPerf,
  waitForFeedCardLink,
  waitForPageReady,
  waitForQaEditorReady,
} from "./helpers/perfFixtures"

test.describe("perf runtime guard budgets", () => {
  test("홈 페이지 CLS(web-vitals) 예산을 통과한다", async ({ page }) => {
  await installClsObserver(page)
  await mockFeedEndpoints(page)
  await page.goto("/")
  await waitForPageReady(page)
  await page.waitForTimeout(1500)

  const fcpSamples: number[] = []
  for (let trial = 0; trial < PERF_RUNTIME_GUARD_TRIALS; trial += 1) {
    if (trial > 0) {
      await reloadForPerf(page)
      await page.waitForTimeout(300)
    }
    const fcpMs = await page.evaluate(() => {
      const byName = performance.getEntriesByName("first-contentful-paint")
      const fcpEntry = byName.at(-1) ?? performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint")
      const startTime = Number(fcpEntry?.startTime ?? 0)
      return Number.isFinite(startTime) && startTime > 0 ? startTime : 0
    })
    if (fcpMs > 0) {
      fcpSamples.push(fcpMs)
    }
  }
  const averagedFcpMs = average(fcpSamples)
  if (averagedFcpMs <= 0) {
    throw new Error("홈 FCP 측정값을 수집하지 못했습니다.")
  }

  console.log(
    `[runtime-guard] home-fcp avg=${averagedFcpMs.toFixed(2)}ms trials=${fcpSamples.length}/${PERF_RUNTIME_GUARD_TRIALS} budget=${homeFcpBudgetMs}ms`
  )
  recordRuntimeGuardMetric("home_first_contentful_paint_ms", averagedFcpMs, homeFcpBudgetMs, {
    unit: "ms",
    route: "/",
    section: "feed",
    sampleCount: fcpSamples.length,
  })

  const cls = await page.evaluate(() => (window as unknown as { __aqCls?: number }).__aqCls ?? 0)
  console.log(`[web-vitals] CLS=${cls.toFixed(4)} budget=${homeClsBudget}`)
  expect(cls).toBeLessThanOrEqual(homeClsBudget + clsAssertionEpsilon)
  expect(averagedFcpMs).toBeLessThanOrEqual(homeFcpBudgetMs)
})

  test("주요 페이지는 새로고침 후 수평 꿈틀과 CLS 예산을 통과한다", async ({ page }) => {
  test.setTimeout(60_000)
  await installClsObserver(page)
  await mockFeedEndpoints(page)

  for (const route of refreshCheckRoutes) {
    await gotoForPerf(page, route)
    await page.waitForTimeout(300)
    const before = await getLayoutSnapshot(page)
    await page.evaluate(() => {
      ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    })

    await reloadForPerf(page)
    await page.waitForTimeout(1000)
    const after = await getLayoutSnapshot(page)

    const jitterPx = getMaxHorizontalJitter(before, after)
    const cls = await page.evaluate(() => (window as unknown as { __aqCls?: number }).__aqCls ?? 0)

    console.log(
      `[refresh-jitter] route=${route} jitter=${jitterPx.toFixed(2)}px budget=${jitterBudgetPx} cls=${cls.toFixed(4)} budget=${clsBudget}`
    )
    expect(jitterPx).toBeLessThanOrEqual(jitterBudgetPx)
    expect(cls).toBeLessThanOrEqual(clsBudget + clsAssertionEpsilon)
  }
})

  test("에디터 타이핑 p95는 런타임 가드 예산을 통과한다", async ({ page }) => {
  const typingP95Samples: number[] = []
  const typingMeanSamples: number[] = []
  const typingMaxSamples: number[] = []
  const typingLongTaskRatioSamples: number[] = []
  const editorCommitP95Samples: number[] = []
  const editorCommitRawSampleCounts: number[] = []
  let editorCommitFallbackCount = 0
  const typingSampleCounts: number[] = []
  await page.addInitScript(() => {
    ;(window as unknown as RuntimeGuardWindow).__AQ_RUNTIME_GUARD_ENABLED__ = true
    ;(window as unknown as RuntimeGuardWindow).__AQ_RUNTIME_GUARD__ = {
      editorCommitSamples: [],
    }
  })

  for (let trial = 0; trial < PERF_RUNTIME_GUARD_TRIALS; trial += 1) {
    await gotoForPerf(page, QA_ENGINE_ROUTE, { waitAuth: false })
    await page.evaluate(() => {
      ;(window as unknown as RuntimeGuardWindow).__AQ_RUNTIME_GUARD_ENABLED__ = true
      ;(window as unknown as RuntimeGuardWindow).__AQ_RUNTIME_GUARD__ = {
        editorCommitSamples: [],
      }
    })

    const editor = await waitForQaEditorReady(page)
    await editor.click()

    const typingStats = await editor.evaluate(async (node) => {
      const host = node as HTMLElement
      const payload = "성능가드 타이핑 기준 블록 입력 "
      const text = payload.repeat(6)
      const samples: number[] = []
      const longTaskDurations: number[] = []
      let longTaskObserver: PerformanceObserver | null = null
      const waitNextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      try {
        longTaskObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            longTaskDurations.push(entry.duration)
          }
        })
        longTaskObserver.observe({ type: "longtask" })
      } catch {
        longTaskObserver = null
      }

      const setCaretToEnd = () => {
        const range = document.createRange()
        range.selectNodeContents(host)
        range.collapse(false)
        const selection = window.getSelection()
        if (!selection) return
        selection.removeAllRanges()
        selection.addRange(range)
      }

      for (const character of text) {
        const start = performance.now()
        setCaretToEnd()

        const insertedWithExecCommand =
          typeof document.execCommand === "function" && document.execCommand("insertText", false, character)

        if (!insertedWithExecCommand) {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(character))
            range.collapse(false)
          } else {
            host.append(document.createTextNode(character))
          }
          host.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              cancelable: false,
              inputType: "insertText",
              data: character,
            })
          )
        }

        await waitNextFrame()
        samples.push(performance.now() - start)
      }

      longTaskObserver?.disconnect()

      const toPercentile = (values: number[], percentilePoint: number) => {
        if (!values.length) return 0
        const sorted = [...values].sort((a, b) => a - b)
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentilePoint) - 1))
        return sorted[index]
      }
      const meanMs = samples.reduce((sum, sample) => sum + sample, 0) / Math.max(samples.length, 1)
      const p95Ms = toPercentile(samples, 0.95)
      const maxMs = samples.length ? Math.max(...samples) : 0
      const longTaskCount = longTaskDurations.length
      const longTaskRatio = samples.length ? longTaskCount / samples.length : 0
      return {
        sampleCount: samples.length,
        meanMs,
        p95Ms,
        maxMs,
        longTaskCount,
        longTaskRatio,
      }
    })

    const commitStats = await page.evaluate(() => {
      const runtime = (window as unknown as RuntimeGuardWindow).__AQ_RUNTIME_GUARD__
      const rawSamples = runtime?.editorCommitSamples ?? []
      const samples = rawSamples.filter((value) => Number.isFinite(value) && value > 0)
      const sorted = [...samples].sort((a, b) => a - b)
      const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))
      return {
        sampleCount: samples.length,
        p95Ms: sorted.length ? sorted[p95Index] : 0,
      }
    })

    typingP95Samples.push(typingStats.p95Ms)
    typingMeanSamples.push(typingStats.meanMs)
    typingMaxSamples.push(typingStats.maxMs)
    typingLongTaskRatioSamples.push(typingStats.longTaskRatio)
    typingSampleCounts.push(typingStats.sampleCount)
    editorCommitRawSampleCounts.push(commitStats.sampleCount)
    if (commitStats.sampleCount > 0) {
      editorCommitP95Samples.push(commitStats.p95Ms)
    } else {
      // Fallback keeps runtime guard signal available on surfaces without React Profiler wiring.
      editorCommitP95Samples.push(typingStats.p95Ms)
      editorCommitFallbackCount += 1
    }
  }

  const averagedTypingP95Ms = average(typingP95Samples)
  const averagedTypingMeanMs = average(typingMeanSamples)
  const averagedTypingMaxMs = average(typingMaxSamples)
  const averagedLongTaskRatio = average(typingLongTaskRatioSamples)
  const averagedCommitP95Ms = average(editorCommitP95Samples)
  const averagedTypingSampleCount = Math.round(average(typingSampleCounts))

  console.log(
    `[runtime-guard] editor-typing p95(avg)=${averagedTypingP95Ms.toFixed(2)}ms mean(avg)=${averagedTypingMeanMs.toFixed(2)}ms max(avg)=${averagedTypingMaxMs.toFixed(2)}ms samples(avg)=${averagedTypingSampleCount} trials=${PERF_RUNTIME_GUARD_TRIALS} budget=${editorTypingP95BudgetMs}ms`
  )
  console.log(
    `[runtime-guard] editor-longtask ratio(avg)=${averagedLongTaskRatio.toFixed(4)} budget=${editorInputLongTaskRatioBudget}`
  )
  console.log(
    `[runtime-guard] editor-commit p95(avg)=${averagedCommitP95Ms.toFixed(2)}ms samples=${Math.round(average(editorCommitRawSampleCounts))} fallbackTrials=${editorCommitFallbackCount} budget=${editorCommitP95BudgetMs}ms`
  )

  recordRuntimeGuardMetricWithAliases("editor_input_latency", averagedTypingP95Ms, editorTypingP95BudgetMs, {
    unit: "ms",
    route: QA_ENGINE_ROUTE,
    section: "editor",
    sampleCount: averagedTypingSampleCount,
    extra: {
      meanMs: averagedTypingMeanMs,
      maxMs: averagedTypingMaxMs,
      trials: PERF_RUNTIME_GUARD_TRIALS,
    },
  }, ["editor.typing.p95_ms"])
  recordRuntimeGuardMetric("editor_input_longtask_ratio", averagedLongTaskRatio, editorInputLongTaskRatioBudget, {
    unit: "ratio",
    route: QA_ENGINE_ROUTE,
    section: "editor",
    sampleCount: averagedTypingSampleCount,
  })
  recordRuntimeGuardMetric("editor_render_commit_p95_ms", averagedCommitP95Ms, editorCommitP95BudgetMs, {
    unit: "ms",
    route: QA_ENGINE_ROUTE,
    section: "editor",
    sampleCount: Math.round(average(editorCommitRawSampleCounts)),
    extra: {
      fallbackTrials: editorCommitFallbackCount,
    },
  })

  expect(averagedTypingSampleCount).toBeGreaterThanOrEqual(60)
  expect(averagedTypingP95Ms).toBeLessThanOrEqual(editorTypingP95BudgetMs)
  expect(averagedLongTaskRatio).toBeLessThanOrEqual(editorInputLongTaskRatioBudget)
  expect(averagedCommitP95Ms).toBeLessThanOrEqual(editorCommitP95BudgetMs)
})

  test("피드 스크롤 프레임 예산은 런타임 가드를 통과한다", async ({ page }) => {
  const pageMap: Record<number, number[]> = {
    1: Array.from({ length: 16 }, (_, index) => 3100 + index),
    2: Array.from({ length: 16 }, (_, index) => 3200 + index),
    3: Array.from({ length: 16 }, (_, index) => 3300 + index),
    4: Array.from({ length: 16 }, (_, index) => 3400 + index),
  }

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const cursorParam = url.searchParams.get("cursor")
      const pageNumber = isCursorEndpoint
        ? cursorParam
          ? Number(cursorParam.replace("cursor-", "")) || 1
          : 1
        : Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")
      const ids = pageMap[pageNumber] ?? []
      const hasNext = pageNumber < 4
      const nextCursor = hasNext ? `cursor-${pageNumber + 1}` : null

      if (isCursorEndpoint) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content: ids.map(buildMockExploreItem),
            pageSize,
            hasNext,
            nextCursor,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: ids.map(buildMockExploreItem),
          pageable: {
            pageNumber: Math.max(pageNumber - 1, 0),
            pageSize,
            totalElements: 64,
            totalPages: 4,
          },
        }),
      })
    },
  })

  await page.goto("/")
  await waitForPageReady(page)

  const frameSampleCounts: number[] = []
  const frameMaxGapSamples: number[] = []
  const frameP95GapSamples: number[] = []
  const frameLongRatioSamples: number[] = []

  for (let trial = 0; trial < PERF_RUNTIME_GUARD_TRIALS; trial += 1) {
    const frameStats = await page.evaluate(async () => {
      const frameGaps: number[] = []
      let active = true
      let rafId = 0
      let previous = performance.now()

      const collect = (now: number) => {
        frameGaps.push(now - previous)
        previous = now
        if (active) rafId = requestAnimationFrame(collect)
      }
      rafId = requestAnimationFrame(collect)

      for (let step = 0; step < 18; step += 1) {
        const maxScrollable = Math.max(document.body.scrollHeight - window.innerHeight, 0)
        const progress = (step + 1) / 18
        window.scrollTo({ top: Math.round(maxScrollable * progress), behavior: "auto" })
        await new Promise((resolve) => setTimeout(resolve, 70))
      }
      await new Promise((resolve) => setTimeout(resolve, 320))

      active = false
      cancelAnimationFrame(rafId)
      window.scrollTo({ top: 0, behavior: "auto" })

      const toPercentile = (values: number[], percentilePoint: number) => {
        if (!values.length) return 0
        const sorted = [...values].sort((a, b) => a - b)
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentilePoint) - 1))
        return sorted[index]
      }

      const usableFrames = frameGaps.filter((gap) => Number.isFinite(gap) && gap > 0)
      const maxFrameGapMs = usableFrames.length ? Math.max(...usableFrames) : 0
      const p95FrameGapMs = toPercentile(usableFrames, 0.95)
      const longFrameThresholdMs = 50
      const longFrameCount = usableFrames.filter((gap) => gap > longFrameThresholdMs).length
      const longFrameRatio = usableFrames.length ? longFrameCount / usableFrames.length : 0

      return {
        sampleCount: usableFrames.length,
        maxFrameGapMs,
        p95FrameGapMs,
        longFrameRatio,
      }
    })
    frameSampleCounts.push(frameStats.sampleCount)
    frameMaxGapSamples.push(frameStats.maxFrameGapMs)
    frameP95GapSamples.push(frameStats.p95FrameGapMs)
    frameLongRatioSamples.push(frameStats.longFrameRatio)
    await page.waitForTimeout(120)
  }

  const averagedFrameSampleCount = Math.round(average(frameSampleCounts))
  const averagedMaxFrameGapMs = average(frameMaxGapSamples)
  const averagedP95FrameGapMs = average(frameP95GapSamples)
  const averagedLongFrameRatio = average(frameLongRatioSamples)

  console.log(
    `[runtime-guard] feed-scroll maxFrameGap(avg)=${averagedMaxFrameGapMs.toFixed(2)}ms p95FrameGap(avg)=${averagedP95FrameGapMs.toFixed(2)}ms longFrameRatio(avg)=${averagedLongFrameRatio.toFixed(4)} trials=${PERF_RUNTIME_GUARD_TRIALS} budget(max=${feedScrollMaxFrameGapBudgetMs}ms, ratio=${feedScrollLongFrameRatioBudget})`
  )
  recordRuntimeGuardMetricWithAliases("feed_scroll_blocking.max_frame_gap_ms", averagedMaxFrameGapMs, feedScrollMaxFrameGapBudgetMs, {
    unit: "ms",
    route: "/",
    section: "feed",
    sampleCount: averagedFrameSampleCount,
    extra: {
      p95FrameGapMs: averagedP95FrameGapMs,
      longFrameRatio: averagedLongFrameRatio,
      trials: PERF_RUNTIME_GUARD_TRIALS,
    },
  }, ["feed.scroll.max_frame_gap_ms"])
  recordRuntimeGuardMetricWithAliases("feed_scroll_blocking.long_frame_ratio", averagedLongFrameRatio, feedScrollLongFrameRatioBudget, {
    unit: "ratio",
    route: "/",
    section: "feed",
    sampleCount: averagedFrameSampleCount,
    extra: {
      maxFrameGapMs: averagedMaxFrameGapMs,
      p95FrameGapMs: averagedP95FrameGapMs,
      trials: PERF_RUNTIME_GUARD_TRIALS,
    },
  }, ["feed.scroll.long_frame_ratio"])

  expect(averagedFrameSampleCount).toBeGreaterThanOrEqual(40)
  expect(averagedMaxFrameGapMs).toBeLessThanOrEqual(feedScrollMaxFrameGapBudgetMs)
  expect(averagedLongFrameRatio).toBeLessThanOrEqual(feedScrollLongFrameRatioBudget)
})

  test("상세 진입 시간은 런타임 가드 예산을 통과한다", async ({ page }) => {
  const postId = 1001
  const detailEntrySamples: number[] = []

  await mockFeedEndpoints(page)
  await mockDetailRailEndpoint(page, postId)

  for (let trial = 0; trial < PERF_RUNTIME_GUARD_TRIALS; trial += 1) {
    await gotoForPerf(page, "/")

    const firstCardLink = await waitForFeedCardLink(page, postId)

    await page.evaluate(() => {
      performance.clearMarks("rum:detail-entry:start")
      performance.mark("rum:detail-entry:start")
    })

    await Promise.all([page.waitForURL(`**/posts/${postId}`), firstCardLink.click()])
    await expect(page.getByRole("heading", { name: "상세 레일 스티키 회귀 점검" })).toBeVisible()
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {})

    const detailEntryMs = await page.evaluate(() => {
      const mark = performance.getEntriesByName("rum:detail-entry:start").at(-1)
      if (!mark) return null
      return performance.now() - mark.startTime
    })

    if (detailEntryMs === null) {
      throw new Error("상세 진입 측정 마크를 찾지 못했습니다.")
    }

    detailEntrySamples.push(detailEntryMs)
    await page.waitForTimeout(120)
  }

  const averagedDetailEntryMs = average(detailEntrySamples)
  console.log(
    `[runtime-guard] detail-entry duration(avg)=${averagedDetailEntryMs.toFixed(2)}ms trials=${PERF_RUNTIME_GUARD_TRIALS} budget=${detailEntryBudgetMs}ms`
  )
  recordRuntimeGuardMetricWithAliases("detail_enter_cost", averagedDetailEntryMs, detailEntryBudgetMs, {
    unit: "ms",
    route: `/posts/${postId}`,
    section: "detail",
    sampleCount: detailEntrySamples.length,
    extra: {
      trials: PERF_RUNTIME_GUARD_TRIALS,
    },
  }, ["detail.entry.ms"])

  expect(averagedDetailEntryMs).toBeLessThanOrEqual(detailEntryBudgetMs)
})
})
