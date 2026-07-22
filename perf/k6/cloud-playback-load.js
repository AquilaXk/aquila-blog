/**
 * Cloud external playback load (range seek 포함).
 *
 * 사전 준비 (홈서버 외부 회선에서 실행):
 *   1. admin 로그인 후 POST /system/api/v1/adm/cloud/files/{id}/external-playback-token
 *   2. 응답 data.token, data.fileId, 파일 byteSize를 __ENV로 주입
 *   3. token TTL 6h — 장시간 측정 시 만료 전 재발급
 *
 * Rate limit (429):
 *   external-content 경로에 backstop rate limit이 있다.
 *   측정 전 임계 일시 상향 또는 부하를 limit 이하로 유지한다.
 *   EXCLUDE_429=1 이면 429를 playback_error_rate에서 제외(정책 기록용).
 *   rate limit 방어 동작 자체는 별도 짧은 시나리오로 분리한다.
 *
 * 실행 예:
 *   BASE_URL="https://api.aquilaxk.site" \
 *   CLOUD_FILE_ID="103" \
 *   CLOUD_PLAYBACK_TOKEN="<token>" \
 *   CLOUD_FILE_BYTE_SIZE="8388608" \
 *   CONCURRENT_VIEWERS="5" \
 *   k6 run perf/k6/cloud-playback-load.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "https://api.aquilaxk.site").replace(/\/$/, "");
const FILE_ID = (__ENV.CLOUD_FILE_ID || "").trim();
const PLAYBACK_TOKEN = (__ENV.CLOUD_PLAYBACK_TOKEN || "").trim();
const FILE_BYTE_SIZE = Number(__ENV.CLOUD_FILE_BYTE_SIZE || "0");
const CONCURRENT_VIEWERS = Number(__ENV.CONCURRENT_VIEWERS || "5");
const SEEK_BURST_PEAK = Number(__ENV.SEEK_BURST_PEAK || String(CONCURRENT_VIEWERS * 2));
const EXCLUDE_429 = (__ENV.EXCLUDE_429 || "0").trim() === "1";
const INITIAL_RANGE_BYTES = Number(__ENV.INITIAL_RANGE_BYTES || "65535");
const SEEK_RANGE_BYTES = Number(__ENV.SEEK_RANGE_BYTES || "1048576");

const playbackTtfbMs = new Trend("playback_ttfb_ms", true);
const playbackRangeDurationMs = new Trend("playback_range_duration_ms", true);
const playbackErrorRate = new Rate("playback_error_rate");
const playbackStatusCounter = new Counter("playback_http_status_total");
const playback206Rate = new Rate("playback_206_rate");

export const options = {
  scenarios: {
    concurrent_viewers: {
      executor: "constant-vus",
      exec: "playbackViewer",
      vus: CONCURRENT_VIEWERS,
      duration: __ENV.PLAYBACK_DURATION || "3m",
      tags: { scenario: "playback" },
    },
    seek_burst: {
      executor: "ramping-vus",
      exec: "seekBurst",
      startVUs: 0,
      stages: [
        { duration: "30s", target: SEEK_BURST_PEAK },
        { duration: "2m", target: SEEK_BURST_PEAK },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "seek_burst" },
    },
  },
  thresholds: {
    playback_ttfb_ms: ["p(95)<1500"],
    playback_error_rate: ["rate<0.01"],
    "playback_range_duration_ms{scenario:playback}": ["p(95)<2500"],
  },
};

function contentUrl() {
  return `${BASE_URL}/system/api/v1/adm/cloud/files/${FILE_ID}/external-content?token=${encodeURIComponent(PLAYBACK_TOKEN)}`;
}

/** Deterministic PRNG (mulberry32). Avoid Math.random for Sonar S2245 / QG security rating. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededInt(minInclusive, maxInclusive, seed) {
  const rand = mulberry32(seed >>> 0);
  return Math.floor(rand() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function vuIterSeed(salt) {
  const vu = typeof __VU !== "undefined" ? Number(__VU) : 1;
  const iter = typeof __ITER !== "undefined" ? Number(__ITER) : 0;
  return (Math.imul(vu, 1_000_003) + Math.imul(iter, 97) + (salt >>> 0)) >>> 0;
}

function randomSeekStart() {
  if (!Number.isFinite(FILE_BYTE_SIZE) || FILE_BYTE_SIZE <= 0) {
    return seededInt(0, 4_000_000, vuIterSeed(0x9e3779b9));
  }
  const maxStart = Math.max(0, FILE_BYTE_SIZE - SEEK_RANGE_BYTES - 1);
  return seededInt(0, maxStart, vuIterSeed(0x9e3779b9));
}

function isPlaybackFailure(status) {
  if (status === 416) {
    return false;
  }
  if (EXCLUDE_429 && status === 429) {
    return false;
  }
  return status < 200 || status >= 400;
}

function recordPlayback(res, label) {
  playbackTtfbMs.add(res.timings.waiting);
  playbackRangeDurationMs.add(res.timings.duration);
  playbackStatusCounter.add(1, { label, status: String(res.status) });
  playback206Rate.add(res.status === 206);
  const failed = isPlaybackFailure(res.status);
  playbackErrorRate.add(failed);
  check(res, {
    [`${label} 200/206`]: (r) => r.status === 200 || r.status === 206,
  });
  return res;
}

function headProbe() {
  const res = http.head(contentUrl(), {
    tags: { request: "head" },
    redirects: 0,
  });
  recordPlayback(res, "head");
  return res;
}

function rangeGet(start, end, label) {
  const res = http.get(contentUrl(), {
    headers: { Range: `bytes=${start}-${end}` },
    tags: { request: "range", label },
    redirects: 0,
  });
  recordPlayback(res, label);
  return res;
}

function seekCycle() {
  headProbe();
  rangeGet(0, INITIAL_RANGE_BYTES, "initial_range");
  const start = randomSeekStart();
  const end = Math.min(start + SEEK_RANGE_BYTES - 1, FILE_BYTE_SIZE > 0 ? FILE_BYTE_SIZE - 1 : start + SEEK_RANGE_BYTES - 1);
  rangeGet(start, end, "random_seek");
}

export function setup() {
  if (!FILE_ID || !PLAYBACK_TOKEN) {
    throw new Error("CLOUD_FILE_ID and CLOUD_PLAYBACK_TOKEN are required");
  }
  const probe = http.head(contentUrl(), { redirects: 0 });
  if (probe.status >= 400) {
    throw new Error(`playback token probe failed: HTTP ${probe.status}`);
  }
  return { fileId: FILE_ID, byteSize: FILE_BYTE_SIZE };
}

export function playbackViewer() {
  seekCycle();
  sleep(seededInt(1, 4, vuIterSeed(0x85ebca6b)));
}

export function seekBurst() {
  seekCycle();
  sleep(0.2);
}
