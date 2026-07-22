/**
 * Cloud video multipart part upload latency / concurrent sessions.
 *
 * k6는 part body를 메모리에 유지하므로 PART_SIZE_BYTES를 작게(기본 1MiB) 유지한다.
 * 5GB 전체 업로드 실측은 companion shell을 사용:
 *   ./perf/k6/cloud-upload-5gb-measure.sh
 *
 * Admin 인증 (__ENV, 커밋 금지):
 *   CLOUD_AUTH_COOKIE="accessToken=<jwt>; apiKey=<key>"  또는
 *   CLOUD_AUTH_HEADER="Bearer <jwt>"
 *
 * 실행 예:
 *   BASE_URL="https://api.aquilaxk.site" \
 *   CLOUD_AUTH_COOKIE="accessToken=..." \
 *   PART_SIZE_BYTES="1048576" \
 *   PARTS_PER_SESSION="3" \
 *   CONCURRENT_SESSIONS="2" \
 *   k6 run perf/k6/cloud-upload-parts-load.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "https://api.aquilaxk.site").replace(/\/$/, "");
const CLOUD_API = `${BASE_URL}/system/api/v1/adm/cloud`;
const PART_SIZE_BYTES = Number(__ENV.PART_SIZE_BYTES || "1048576");
const PARTS_PER_SESSION = Number(__ENV.PARTS_PER_SESSION || "3");
const CONCURRENT_SESSIONS = Number(__ENV.CONCURRENT_SESSIONS || "2");
const SESSION_BYTE_SIZE = Number(__ENV.SESSION_BYTE_SIZE || String(PART_SIZE_BYTES * PARTS_PER_SESSION));
const UPLOAD_FILENAME = __ENV.UPLOAD_FILENAME || "k6-part-load.bin";
const UPLOAD_CONTENT_TYPE = __ENV.UPLOAD_CONTENT_TYPE || "application/octet-stream";
const UPLOAD_FOLDER = __ENV.UPLOAD_FOLDER || "/perf-k6";

const partUploadDurationMs = new Trend("cloud_part_upload_duration_ms", true);
const sessionCreateDurationMs = new Trend("cloud_session_create_duration_ms", true);
const uploadErrorRate = new Rate("cloud_upload_error_rate");
const uploadStatusCounter = new Counter("cloud_upload_http_status_total");

export const options = {
  scenarios: {
    concurrent_part_sessions: {
      executor: "constant-vus",
      exec: "uploadSessionParts",
      vus: CONCURRENT_SESSIONS,
      duration: __ENV.UPLOAD_DURATION || "2m",
    },
  },
  thresholds: {
    cloud_part_upload_duration_ms: ["p(95)<5000"],
    cloud_upload_error_rate: ["rate<0.02"],
    cloud_session_create_duration_ms: ["p(95)<3000"],
  },
};

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const cookie = (__ENV.CLOUD_AUTH_COOKIE || "").trim();
  const authHeader = (__ENV.CLOUD_AUTH_HEADER || "").trim();
  if (cookie) {
    headers.Cookie = cookie;
  }
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  return headers;
}

function safeJson(response) {
  try {
    return response.json();
  } catch (_error) {
    return null;
  }
}

function recordUpload(res, label) {
  uploadStatusCounter.add(1, { label, status: String(res.status) });
  const ok = res.status >= 200 && res.status < 300;
  uploadErrorRate.add(!ok);
  return ok;
}

function buildPartPayload(sizeBytes) {
  const buffer = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i += 1) {
    buffer[i] = i % 256;
  }
  return buffer.buffer;
}

const partPayload = buildPartPayload(PART_SIZE_BYTES);

function createSession() {
  const started = Date.now();
  const res = http.post(
    `${CLOUD_API}/files/video-upload-sessions`,
    JSON.stringify({
      originalFilename: UPLOAD_FILENAME,
      contentType: UPLOAD_CONTENT_TYPE,
      byteSize: SESSION_BYTE_SIZE,
      folderPath: UPLOAD_FOLDER,
    }),
    {
      headers: authHeaders({ "Content-Type": "application/json" }),
      tags: { request: "create_session" },
    },
  );
  sessionCreateDurationMs.add(Date.now() - started);
  recordUpload(res, "create_session");
  const body = safeJson(res);
  const session = body?.data;
  check(res, { "session created 201": (r) => r.status === 201 });
  return session;
}

function uploadPart(sessionId, partNumber) {
  const url = `${CLOUD_API}/files/video-upload-sessions/${sessionId}/parts/${partNumber}`;
  const started = Date.now();
  const res = http.put(url, partPayload, {
    headers: authHeaders({ "Content-Type": "application/octet-stream" }),
    tags: { request: "upload_part", partNumber: String(partNumber) },
  });
  partUploadDurationMs.add(Date.now() - started);
  recordUpload(res, "upload_part");
  check(res, { [`part ${partNumber} 200`]: (r) => r.status === 200 });
  return res;
}

function cancelSession(sessionId) {
  const res = http.del(`${CLOUD_API}/files/video-upload-sessions/${sessionId}`, null, {
    headers: authHeaders(),
    tags: { request: "cancel_session" },
  });
  recordUpload(res, "cancel_session");
}

export function setup() {
  const cookie = (__ENV.CLOUD_AUTH_COOKIE || "").trim();
  const authHeader = (__ENV.CLOUD_AUTH_HEADER || "").trim();
  if (!cookie && !authHeader) {
    throw new Error("CLOUD_AUTH_COOKIE or CLOUD_AUTH_HEADER is required");
  }
  return { partSizeBytes: PART_SIZE_BYTES, partsPerSession: PARTS_PER_SESSION };
}

export function uploadSessionParts() {
  const session = createSession();
  if (!session?.id) {
    sleep(1);
    return;
  }

  const totalParts = Math.min(PARTS_PER_SESSION, session.totalParts || PARTS_PER_SESSION);
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    uploadPart(session.id, partNumber);
    sleep(0.05);
  }

  // 부하 측정 목적: complete 대신 cancel로 스토리지/DB 잔여 최소화
  cancelSession(session.id);
  sleep(1);
}
