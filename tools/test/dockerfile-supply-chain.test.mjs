import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const backendDockerfilePath = path.join(repoRoot, "back/Dockerfile")
const frontRuntimeDockerfilePath = path.join(repoRoot, "front/Dockerfile.runtime")
const uncheckedJdkDownloadHost = ["download", "java", "net"].join(".")

// Dockerfile keywords are case-insensitive. A case-sensitive split would treat a lowercase final
// `from` as ordinary text and hand back an earlier stage, so a runtime stage missing USER or the
// healthcheck client could still pass on the previous stage's lines.
const runtimeStageOf = (dockerfile) => dockerfile.split(/^FROM\s+/im).at(-1)

test("backend Dockerfile pins every external build stage image by digest", () => {
  const dockerfile = readFileSync(backendDockerfilePath, "utf8")
  const unpinnedFroms = [...dockerfile.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?$/gim)]
    .map((match) => match[1])
    .filter((image) => !image.includes("@sha256:"))

  assert.deepEqual(unpinnedFroms, [])
})

test("backend Dockerfile does not pipe unchecked network downloads into build tools", () => {
  const dockerfile = readFileSync(backendDockerfilePath, "utf8")

  assert.doesNotMatch(dockerfile, /curl\b[\s\S]*\|\s*tar\b/)
  assert.equal(dockerfile.includes(uncheckedJdkDownloadHost), false)
})

test("backend runtime image contains the compose healthcheck client", () => {
  const dockerfile = readFileSync(backendDockerfilePath, "utf8")
  const runtimeStage = runtimeStageOf(dockerfile)

  assert.match(runtimeStage, /apt-get install -y --no-install-recommends wget\b/)
})

test("front runtime Dockerfile pins every external build stage image by digest", () => {
  const dockerfile = readFileSync(frontRuntimeDockerfilePath, "utf8")
  const unpinnedFroms = [...dockerfile.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?$/gim)]
    .map((match) => match[1])
    .filter((image) => !image.includes("@sha256:"))

  assert.deepEqual(unpinnedFroms, [])
})

test("front runtime image contains the compose healthcheck client", () => {
  const dockerfile = readFileSync(frontRuntimeDockerfilePath, "utf8")
  const runtimeStage = runtimeStageOf(dockerfile)

  assert.match(runtimeStage, /apk add --no-cache wget\b/)
})

test("runtime stage extraction is not fooled by a lowercase final FROM", () => {
  const dockerfile = [
    "FROM base@sha256:aaa AS builder",
    "RUN apk add --no-cache wget",
    "USER app",
    "from base@sha256:bbb",
    'CMD ["node", "server.js"]',
  ].join("\n")

  const runtimeStage = runtimeStageOf(dockerfile)

  assert.doesNotMatch(runtimeStage, /apk add --no-cache wget\b/)
  assert.deepEqual([...runtimeStage.matchAll(/^USER\s+(\S+)/gim)], [])
})

test("front runtime image drops root before serving", () => {
  const dockerfile = readFileSync(frontRuntimeDockerfilePath, "utf8")
  const runtimeStage = runtimeStageOf(dockerfile)
  const users = [...runtimeStage.matchAll(/^USER\s+(\S+)/gim)].map((match) => match[1])

  assert.notEqual(users.length, 0)
  assert.equal(["root", "0"].includes(users.at(-1)), false)
})

// Docker creates a mount point that the image does not contain as root:root, and copies the
// image directory's ownership onto a fresh named volume only when that directory exists. The
// compose `.next/cache` volume therefore silently becomes unwritable for the non-root runtime
// unless the runtime stage pre-creates it: the container still starts, the healthcheck still
// passes, and only ISR writes and image optimization fail.
test("front runtime image owns the .next/cache mount point the compose volume attaches to", () => {
  const dockerfile = readFileSync(frontRuntimeDockerfilePath, "utf8")
  const runtimeStage = runtimeStageOf(dockerfile)
  const cacheMountSetupIndex = runtimeStage.search(/mkdir -p \.next\/cache/)
  const dropRootIndex = runtimeStage.search(/^USER\s+\S+/im)

  assert.notEqual(cacheMountSetupIndex, -1, "runtime stage must create .next/cache")
  assert.match(runtimeStage, /chown app:app \.next\/cache/)
  assert(cacheMountSetupIndex < dropRootIndex, "the mount point must be created while still root")
})
