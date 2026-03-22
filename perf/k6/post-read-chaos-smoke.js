import http from "k6/http"
import { check, sleep } from "k6"
import { Counter, Rate, Trend } from "k6/metrics"

const BASE_URL = __ENV.BASE_URL || "https://api.aquilaxk.site"
const DETAIL_ID = (__ENV.DETAIL_ID || "503").trim()
const CHAOS_FAILURE_PATH = (__ENV.CHAOS_FAILURE_PATH || "").trim()

const feedDuration = new Trend("chaos_feed_duration_ms")
const exploreDuration = new Trend("chaos_explore_duration_ms")
const detailDuration = new Trend("chaos_detail_duration_ms")
const endpointSuccessRate = new Rate("chaos_read_success_rate")
const injectedFailureCount = new Counter("chaos_injected_failure_count")

export const options = {
  scenarios: {
    read_smoke: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 10 },
        { duration: "60s", target: 20 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    chaos_read_success_rate: ["rate>0.95"],
    chaos_feed_duration_ms: ["p(95)<2500"],
    chaos_explore_duration_ms: ["p(95)<2500"],
    chaos_detail_duration_ms: ["p(95)<1800"],
  },
}

const request = (path) =>
  http.get(`${BASE_URL}${path}`, {
    headers: {
      "x-chaos-smoke": "true",
    },
    tags: {
      path,
    },
  })

const markReadResult = (res, durationMetric, label) => {
  durationMetric.add(res.timings.duration)
  const ok = check(res, {
    [`${label} 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
  })
  endpointSuccessRate.add(ok)
}

export default function () {
  const feedRes = request("/post/api/v1/posts/feed?page=1&pageSize=30&sort=CREATED_AT")
  markReadResult(feedRes, feedDuration, "feed")

  const exploreRes = request("/post/api/v1/posts/explore?page=1&pageSize=30&sort=CREATED_AT&kw=&tag=")
  markReadResult(exploreRes, exploreDuration, "explore")

  const detailRes = request(`/post/api/v1/posts/${DETAIL_ID}`)
  markReadResult(detailRes, detailDuration, "detail")

  if (CHAOS_FAILURE_PATH) {
    const injected = request(CHAOS_FAILURE_PATH)
    if (injected.status >= 500 || injected.status === 429) {
      injectedFailureCount.add(1)
    }
  }

  sleep(1)
}
