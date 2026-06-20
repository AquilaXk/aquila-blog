import assert from "node:assert/strict"
import http from "node:http"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { createHealthPayload, runProbe } from "../../deploy/homeserver/monitoring/public-edge-probe.mjs"

const withServer = async (handler, callback) => {
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  try {
    const address = server.address()
    assert.equal(typeof address, "object")
    const baseUrl = `http://127.0.0.1:${address.port}`
    return await callback(baseUrl)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const runProbeFixture = async (baseUrl, route, options = {}) => {
  const stateDir = mkdtempSync(path.join(tmpdir(), "public-edge-probe-test-"))
  try {
    return await runProbe({
      baseUrl,
      routes: [route],
      latestPosts: 0,
      requestsPerRoute: 1,
      timeoutMs: options.timeoutMs || 1000,
      statePath: path.join(stateDir, "state.json"),
      outputJson: "",
      outputMd: "",
      prometheusOut: "",
      refreshMs: 5000,
      servePort: 0,
      help: false,
    })
  } finally {
    rmSync(stateDir, { recursive: true, force: true })
  }
}

test("public edge probe marks 200 route healthy", async () => {
  await withServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html", "x-vercel-cache": "HIT" })
    response.end("<html><head></head><body>ok</body></html>")
  }, async (baseUrl) => {
    const result = await runProbeFixture(baseUrl, "/")

    assert.equal(result.report.overall.ok, true)
    assert.match(result.prometheus, /aquila_public_edge_probe_route_up\{route="\/"\} 1/)
    assert.match(result.prometheus, /aquila_public_edge_probe_status_code\{route="\/",request_index="1"\} 200/)
    assert.match(result.prometheus, /aquila_public_edge_probe_up 1/)
    assert.match(result.prometheus, /aquila_public_edge_probe_last_success_timestamp_seconds [1-9][0-9]+/)
  })
})

test("public edge probe allows the explicit 404 route policy", async () => {
  await withServer((request, response) => {
    response.writeHead(404, { "content-type": "text/html", "x-vercel-cache": "MISS" })
    response.end("<html><head><link rel=\"canonical\" href=\"http://example.test/404\" /></head><body>not found</body></html>")
  }, async (baseUrl) => {
    const result = await runProbeFixture(baseUrl, "/404")

    assert.equal(result.report.overall.ok, true)
    assert.match(result.prometheus, /aquila_public_edge_probe_route_up\{route="\/404"\} 1/)
    assert.match(result.prometheus, /aquila_public_edge_probe_status_code\{route="\/404",request_index="1"\} 404/)
  })
})

test("public edge probe exposes 5xx as route and overall failure", async () => {
  await withServer((request, response) => {
    response.writeHead(500, { "content-type": "text/html", "x-vercel-cache": "MISS" })
    response.end("<html><head></head><body>error</body></html>")
  }, async (baseUrl) => {
    const result = await runProbeFixture(baseUrl, "/")

    assert.equal(result.report.overall.ok, false)
    assert.match(result.prometheus, /aquila_public_edge_probe_route_up\{route="\/"\} 0/)
    assert.match(result.prometheus, /aquila_public_edge_probe_status_code\{route="\/",request_index="1"\} 500/)
    assert.match(result.prometheus, /aquila_public_edge_probe_up 0/)
  })
})

test("public edge probe exposes timeout as route and overall failure", async () => {
  await withServer(() => {}, async (baseUrl) => {
    const result = await runProbeFixture(baseUrl, "/", { timeoutMs: 1000 })

    assert.equal(result.report.overall.ok, false)
    assert.match(result.prometheus, /aquila_public_edge_probe_route_up\{route="\/"\} 0/)
    assert.match(result.prometheus, /aquila_public_edge_probe_status_code\{route="\/",request_index="1"\} 0/)
    assert.match(result.report.routes[0].failureReason, /timeout/i)
  })
})

test("public edge probe healthz is stale after two refresh intervals", () => {
  const now = Date.parse("2026-06-21T00:00:00.000Z")
  const fresh = createHealthPayload({ lastError: "", lastSuccessAt: "2026-06-20T23:59:55.000Z" }, 5000, now)
  const boundary = createHealthPayload({ lastError: "", lastSuccessAt: "2026-06-20T23:59:50.000Z" }, 5000, now)
  const stale = createHealthPayload({ lastError: "", lastSuccessAt: "2026-06-20T23:59:40.000Z" }, 5000, now)

  assert.equal(fresh.statusCode, 200)
  assert.equal(fresh.body.ok, true)
  assert.equal(boundary.statusCode, 200)
  assert.equal(boundary.body.ok, true)
  assert.equal(boundary.body.stale, false)
  assert.equal(stale.statusCode, 503)
  assert.equal(stale.body.ok, false)
  assert.equal(stale.body.stale, true)
})
