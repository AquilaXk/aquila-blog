import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const backendDockerfilePath = path.join(repoRoot, "back/Dockerfile")
const uncheckedJdkDownloadHost = ["download", "java", "net"].join(".")

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
