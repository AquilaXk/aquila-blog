import assert from "node:assert/strict"
import fs from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  RUNTIME_IMAGE_SIZE_LIMIT_BYTES,
  RUNTIME_PAYLOAD_LIMIT_BYTES,
  RUNTIME_PAYLOAD_SOURCES,
  assertMuslRuntimeBase,
  assertPayloadSourceParity,
  evaluatePayload,
  measureTree,
  projectImageSizeBytes,
  resolveCopiedPayloadSources,
  resolveRuntimeStageBaseImage,
  summarizeTopPackages,
} from "./check-runtime-image-payload.mjs"

/** 2026-08-01 `docker images` 실측 — 예산 도출의 근거점이자 투영식의 회귀 기준. */
const MEASURED_POINTS = [
  { payloadBytes: 135_244_573, imageSizeBytes: 397_000_000 },
  { payloadBytes: 88_601_986, imageSizeBytes: 331_000_000 },
]

const frontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeDockerfile = fs.readFileSync(path.join(frontRoot, "Dockerfile.runtime"), "utf8")

const makeFixtureRoot = () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "runtime-payload-"))
  for (const source of RUNTIME_PAYLOAD_SOURCES) {
    fs.mkdirSync(path.join(root, source), { recursive: true })
  }
  return root
}

test("measureTree sums regular files across nested directories", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "measure-tree-"))
  fs.writeFileSync(path.join(root, "a.txt"), "x".repeat(100))
  fs.mkdirSync(path.join(root, "nested/deeper"), { recursive: true })
  fs.writeFileSync(path.join(root, "nested/deeper/b.txt"), "y".repeat(23))

  assert.deepEqual(measureTree(root), { bytes: 123, fileCount: 2 })
})

test("measureTree does not follow symlinks into already counted files", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "measure-symlink-"))
  fs.writeFileSync(path.join(root, "real.txt"), "z".repeat(64))
  fs.mkdirSync(path.join(root, ".bin"))
  fs.symlinkSync(path.join(root, "real.txt"), path.join(root, ".bin/link"))

  assert.deepEqual(measureTree(root), { bytes: 64, fileCount: 1 })
})

test("summarizeTopPackages ranks scoped and unscoped packages by size", () => {
  const nodeModules = fs.mkdtempSync(path.join(tmpdir(), "top-packages-"))
  fs.mkdirSync(path.join(nodeModules, "small"))
  fs.writeFileSync(path.join(nodeModules, "small/index.js"), "a".repeat(10))
  fs.mkdirSync(path.join(nodeModules, "@img/sharp-libvips-linuxmusl-x64"), { recursive: true })
  fs.writeFileSync(
    path.join(nodeModules, "@img/sharp-libvips-linuxmusl-x64/lib.so"),
    "b".repeat(500)
  )

  assert.deepEqual(summarizeTopPackages(nodeModules, 5), [
    { name: "@img/sharp-libvips-linuxmusl-x64", bytes: 500 },
    { name: "small", bytes: 10 },
  ])
})

test("summarizeTopPackages tolerates a missing node_modules directory", () => {
  assert.deepEqual(summarizeTopPackages(path.join(tmpdir(), "definitely-absent-node-modules")), [])
})

test("resolveRuntimeStageBaseImage takes the last stage even when FROM is lowercase", () => {
  const dockerfile = [
    "FROM node:20-alpine@sha256:aaa AS builder",
    "RUN yarn build",
    "from debian:bookworm-slim@sha256:bbb",
    'CMD ["node", "server.js"]',
  ].join("\n")

  assert.equal(resolveRuntimeStageBaseImage(dockerfile), "debian:bookworm-slim@sha256:bbb")
})

test("assertMuslRuntimeBase rejects a glibc runtime base", () => {
  const dockerfile = [
    "FROM node:20-alpine@sha256:aaa AS builder",
    "FROM node:20-slim@sha256:bbb",
    'CMD ["node", "server.js"]',
  ].join("\n")

  assert.throws(() => assertMuslRuntimeBase(dockerfile), /alpine \(musl\) base/)
})

test("assertMuslRuntimeBase accepts the shipped Dockerfile.runtime", () => {
  assert.match(assertMuslRuntimeBase(runtimeDockerfile), /^node:20-alpine@sha256:/)
})

test("resolveCopiedPayloadSources reads the runtime stage COPY sources", () => {
  assert.deepEqual(resolveCopiedPayloadSources(runtimeDockerfile), [
    ".next/standalone",
    ".next/static",
    "public",
  ])
})

test("assertPayloadSourceParity fails when the Dockerfile copies an unmeasured path", () => {
  const drifted = runtimeDockerfile.replace(
    "COPY --from=builder --chown=app:app /app/public ./public",
    "COPY --from=builder --chown=app:app /app/public ./public\n" +
      "COPY --from=builder --chown=app:app /app/extra ./extra"
  )

  assert.throws(() => assertPayloadSourceParity(drifted), /drifted from RUNTIME_PAYLOAD_SOURCES/)
})

test("assertPayloadSourceParity passes for the shipped Dockerfile.runtime", () => {
  assert.doesNotThrow(() => assertPayloadSourceParity(runtimeDockerfile))
})

test("evaluatePayload totals every copied source and reports remaining budget", () => {
  const root = makeFixtureRoot()
  fs.writeFileSync(path.join(root, ".next/standalone/server.js"), "s".repeat(600))
  fs.writeFileSync(path.join(root, ".next/static/chunk.js"), "c".repeat(300))
  fs.writeFileSync(path.join(root, "public/logo.png"), "p".repeat(100))

  const result = evaluatePayload({ projectRoot: root, limitBytes: 2000 })

  assert.equal(result.totalBytes, 1000)
  assert.equal(result.remainingBytes, 1000)
  assert.equal(result.overBudget, false)
  assert.deepEqual(
    result.sources.map((entry) => entry.source),
    RUNTIME_PAYLOAD_SOURCES
  )
})

test("evaluatePayload flags a payload over the budget", () => {
  const root = makeFixtureRoot()
  fs.writeFileSync(path.join(root, ".next/standalone/server.js"), "s".repeat(1024))

  const result = evaluatePayload({ projectRoot: root, limitBytes: 1000 })

  assert.equal(result.overBudget, true)
  assert.equal(result.remainingBytes, -24)
})

test("evaluatePayload refuses to pass when the build output is missing", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "runtime-payload-empty-"))

  assert.throws(
    () => evaluatePayload({ projectRoot: root, limitBytes: RUNTIME_PAYLOAD_LIMIT_BYTES }),
    /runtime payload source not found/
  )
})

test("projectImageSizeBytes reproduces both measured docker images SIZE points", () => {
  for (const point of MEASURED_POINTS) {
    const projected = projectImageSizeBytes(point.payloadBytes)
    const errorRatio = Math.abs(projected - point.imageSizeBytes) / point.imageSizeBytes
    assert.ok(
      errorRatio < 0.01,
      `payload=${point.payloadBytes} projected=${Math.round(projected)} measured=${point.imageSizeBytes}`
    )
  }
})

test("a payload spending the whole budget still projects under the image size limit", () => {
  const projected = projectImageSizeBytes(RUNTIME_PAYLOAD_LIMIT_BYTES)

  assert.ok(
    projected < RUNTIME_IMAGE_SIZE_LIMIT_BYTES,
    `projected=${Math.round(projected)} limit=${RUNTIME_IMAGE_SIZE_LIMIT_BYTES}`
  )
})

test("the budget leaves real headroom above the measured payload", () => {
  const measuredPayload = MEASURED_POINTS.at(-1)?.payloadBytes ?? 0

  assert.ok(RUNTIME_PAYLOAD_LIMIT_BYTES > measuredPayload)
  assert.ok(RUNTIME_PAYLOAD_LIMIT_BYTES - measuredPayload > 20_000_000)
})
