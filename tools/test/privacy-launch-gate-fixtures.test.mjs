import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const validatorPath = path.join(repoRoot, "tools/privacy/validate-launch-gate-checklist.mjs")
const sourcePath = path.join(repoRoot, "legal/privacy-launch-controls.json")
const checklistPath = path.join(repoRoot, "docs/design/privacy-launch-gate-checklist.md")

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-launch-gate-"))
  const sourceFixturePath = path.join(fixtureRoot, "privacy-launch-controls.json")
  const checklistFixturePath = path.join(fixtureRoot, "privacy-launch-gate-checklist.md")
  fs.copyFileSync(sourcePath, sourceFixturePath)
  fs.copyFileSync(checklistPath, checklistFixturePath)
  return { sourceFixturePath, checklistFixturePath }
}

const runValidator = ({ sourceFixturePath, checklistFixturePath }) =>
  spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PRIVACY_LAUNCH_CONTROLS_PATH: sourceFixturePath,
      PRIVACY_LAUNCH_CHECKLIST_PATH: checklistFixturePath,
    },
    encoding: "utf8",
  })

test("privacy launch gate fixture passes with synchronized source and checklist", () => {
  const fixture = createFixture()
  const result = runValidator(fixture)

  assert.equal(result.status, 0)
  assert.match(result.stdout, /controls verified/)
})

test("privacy launch gate fixture fails when evidence reference is missing", () => {
  const fixture = createFixture()
  const source = JSON.parse(fs.readFileSync(fixture.sourceFixturePath, "utf8"))
  source.controls[0].evidenceArtifacts = []
  fs.writeFileSync(fixture.sourceFixturePath, `${JSON.stringify(source, null, 2)}\n`)

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /evidenceArtifacts must contain at least one evidence reference/)
})

test("privacy launch gate fixture fails when checklist matrix drifts", () => {
  const fixture = createFixture()
  const checklist = fs.readFileSync(fixture.checklistFixturePath, "utf8")
  fs.writeFileSync(
    fixture.checklistFixturePath,
    checklist.replace("| #998 | Open |", "| #998 | Closed |"),
  )

  const result = runValidator(fixture)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /#998 checklist status drift/)
})
