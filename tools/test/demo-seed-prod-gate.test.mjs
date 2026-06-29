import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const guardPath = path.join(repoRoot, "tools/guards/check-demo-seed-prod-traces.mjs")

test("demo seed prod gate passes current runtime artifacts", () => {
  const output = execFileSync(process.execPath, [guardPath], { cwd: repoRoot, encoding: "utf8" })
  assert.match(output, /\[demo-seed-prod-gate] ok/)
})

test("demo seed prod gate rejects prod-like runtime seed traces", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-demo-seed-gate-"))
  try {
    mkdirSync(path.join(workDir, "tools/guards"), { recursive: true })
    mkdirSync(path.join(workDir, ".github/workflows"), { recursive: true })
    mkdirSync(path.join(workDir, "deploy"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/resources"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/member/adapter/bootstrap"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/bootstrap"), { recursive: true })

    writeFileSync(
      path.join(workDir, "tools/guards/check-demo-seed-prod-traces.mjs"),
      readFileSync(guardPath, "utf8"),
    )
    writeFileSync(
      path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/member/adapter/bootstrap/MemberNotProdInitData.kt"),
      "class MemberNotProdInitData // DemoSeedDataCondition\n",
    )
    writeFileSync(
      path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/bootstrap/PostNotProdInitData.kt"),
      "class PostNotProdInitData // DemoSeedDataCondition\n",
    )
    writeFileSync(path.join(workDir, "back/src/main/resources/application.yaml"), "custom: {}\n")
    writeFileSync(path.join(workDir, "back/src/main/resources/application-prod.yaml"), "custom: {}\n")
    writeFileSync(path.join(workDir, ".github/workflows/deploy.yml"), "seed: admin@test.com\n")

    assert.throws(
      () => execFileSync(process.execPath, ["tools/guards/check-demo-seed-prod-traces.mjs"], { cwd: workDir, encoding: "utf8" }),
      /forbidden demo seed trace/,
    )
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})

test("demo seed prod gate rejects deploy env seed traces", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-demo-seed-env-gate-"))
  try {
    mkdirSync(path.join(workDir, "tools/guards"), { recursive: true })
    mkdirSync(path.join(workDir, ".github/workflows"), { recursive: true })
    mkdirSync(path.join(workDir, "deploy/homeserver"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/resources"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/member/adapter/bootstrap"), { recursive: true })
    mkdirSync(path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/bootstrap"), { recursive: true })

    writeFileSync(
      path.join(workDir, "tools/guards/check-demo-seed-prod-traces.mjs"),
      readFileSync(guardPath, "utf8"),
    )
    writeFileSync(
      path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/member/adapter/bootstrap/MemberNotProdInitData.kt"),
      "class MemberNotProdInitData // DemoSeedDataCondition\n",
    )
    writeFileSync(
      path.join(workDir, "back/src/main/kotlin/com/back/boundedContexts/post/adapter/bootstrap/PostNotProdInitData.kt"),
      "class PostNotProdInitData // DemoSeedDataCondition\n",
    )
    writeFileSync(path.join(workDir, "back/src/main/resources/application.yaml"), "custom: {}\n")
    writeFileSync(path.join(workDir, "back/src/main/resources/application-prod.yaml"), "custom: {}\n")
    writeFileSync(path.join(workDir, ".github/workflows/deploy.yml"), "name: deploy\n")
    writeFileSync(path.join(workDir, "deploy/homeserver/.env.prod"), "ADMIN_EMAIL=admin@test.com\n")

    assert.throws(
      () => execFileSync(process.execPath, ["tools/guards/check-demo-seed-prod-traces.mjs"], { cwd: workDir, encoding: "utf8" }),
      /forbidden demo seed trace/,
    )
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})
