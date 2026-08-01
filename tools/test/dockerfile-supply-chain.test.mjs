import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const backendDockerfilePath = path.join(repoRoot, "back/Dockerfile")
const frontRuntimeDockerfilePath = path.join(repoRoot, "front/Dockerfile.runtime")
const uncheckedJdkDownloadHost = ["download", "java", "net"].join(".")

const runtimeStageOf = (dockerfile) => dockerfile.split(/^FROM /m).at(-1)

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

test("front runtime image drops root before serving", () => {
  const dockerfile = readFileSync(frontRuntimeDockerfilePath, "utf8")
  const runtimeStage = runtimeStageOf(dockerfile)
  const users = [...runtimeStage.matchAll(/^USER\s+(\S+)/gim)].map((match) => match[1])

  assert.notEqual(users.length, 0)
  assert.equal(["root", "0"].includes(users.at(-1)), false)
})
