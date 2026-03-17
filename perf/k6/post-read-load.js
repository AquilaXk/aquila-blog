import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://api.aquilaxk.site";

const feedDuration = new Trend("post_feed_duration_ms");
const exploreDuration = new Trend("post_explore_duration_ms");
const detailDuration = new Trend("post_detail_duration_ms");
const tagsDuration = new Trend("post_tags_duration_ms");
const businessErrorRate = new Rate("post_business_error_rate");
const serverErrorRate = new Rate("post_server_error_rate");

const KEYWORDS = ["", "spring", "kotlin", "테스트", "아키텍처", "성능"];

export const options = {
  scenarios: {
    home_feed: {
      executor: "ramping-arrival-rate",
      exec: "homeFeedScenario",
      startRate: 2,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 80,
      stages: [
        { target: 6, duration: "2m" },
        { target: 10, duration: "3m" },
        { target: 0, duration: "1m" },
      ],
    },
    detail_reader: {
      executor: "ramping-arrival-rate",
      exec: "detailReaderScenario",
      startRate: 2,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 80,
      stages: [
        { target: 8, duration: "2m" },
        { target: 12, duration: "3m" },
        { target: 0, duration: "1m" },
      ],
    },
    explore_search: {
      executor: "ramping-arrival-rate",
      exec: "exploreScenario",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 40,
      stages: [
        { target: 3, duration: "2m" },
        { target: 5, duration: "3m" },
        { target: 0, duration: "1m" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    post_business_error_rate: ["rate<0.02"],
    post_server_error_rate: ["rate<0.01"],
    post_feed_duration_ms: ["p(95)<2500"],
    post_explore_duration_ms: ["p(95)<2500"],
    post_detail_duration_ms: ["p(95)<1800"],
    post_tags_duration_ms: ["p(95)<1000"],
  },
};

function safeJson(response) {
  try {
    return response.json();
  } catch (error) {
    return null;
  }
}

function randomInt(minInclusive, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function randomPick(list, fallback = null) {
  if (!list || list.length === 0) return fallback;
  return list[randomInt(0, list.length - 1)];
}

function recordResponse(res, trend, name) {
  trend.add(res.timings.duration);
  const ok = check(res, {
    [`${name} 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
  });
  businessErrorRate.add(!ok);
  serverErrorRate.add(res.status >= 500);
  return ok;
}

export function setup() {
  const feedRes = http.get(`${BASE_URL}/post/api/v1/posts/feed?page=1&pageSize=30&sort=CREATED_AT`);
  const feedJson = safeJson(feedRes);
  const postIds = (feedJson?.content || feedJson?.data?.content || [])
    .map((p) => p.id)
    .filter((id) => typeof id === "number");

  const tagsRes = http.get(`${BASE_URL}/post/api/v1/posts/tags`);
  const tagsJson = safeJson(tagsRes) || [];
  const tags = tagsJson.map((t) => t.name).filter((name) => typeof name === "string" && name.length > 0);

  return {
    postIds,
    tags,
  };
}

export function homeFeedScenario() {
  const page = randomInt(1, 3);
  const pageSize = randomPick([12, 18, 24], 12);
  const res = http.get(`${BASE_URL}/post/api/v1/posts/feed?page=${page}&pageSize=${pageSize}&sort=CREATED_AT`);
  recordResponse(res, feedDuration, "feed");

  if (Math.random() < 0.2) {
    const tagsRes = http.get(`${BASE_URL}/post/api/v1/posts/tags`);
    recordResponse(tagsRes, tagsDuration, "tags");
  }
}

export function detailReaderScenario(data) {
  const postId = randomPick(data?.postIds, 1);
  const res = http.get(`${BASE_URL}/post/api/v1/posts/${postId}`);
  recordResponse(res, detailDuration, "detail");
}

export function exploreScenario(data) {
  const page = randomInt(1, 3);
  const pageSize = randomPick([12, 18, 24], 12);
  const kw = encodeURIComponent(randomPick(KEYWORDS, ""));
  const tagRaw = Math.random() < 0.6 ? randomPick(data?.tags, "") : "";
  const tag = encodeURIComponent(tagRaw || "");
  const res = http.get(
    `${BASE_URL}/post/api/v1/posts/explore?page=${page}&pageSize=${pageSize}&sort=CREATED_AT&kw=${kw}&tag=${tag}`,
  );
  recordResponse(res, exploreDuration, "explore");
}
