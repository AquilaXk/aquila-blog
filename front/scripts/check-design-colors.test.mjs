import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collectDiffText, committedDiffRange, findDirectColorViolations } from "./check-design-colors.mjs"

test("findDirectColorViolations reports added hex colors", () => {
  const diff = [
    "diff --git a/src/routes/Feed/Card.tsx b/src/routes/Feed/Card.tsx",
    "+++ b/src/routes/Feed/Card.tsx",
    "@@ -1,0 +10,2 @@",
    "+  color: #ffffff;",
    "+  background: theme.colors.gray1;",
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [
    {
      file: "src/routes/Feed/Card.tsx",
      line: 10,
      source: "color: #ffffff;",
    },
  ])
})

test("findDirectColorViolations reports added rgb colors", () => {
  const diff = [
    "diff --git a/src/routes/Settings/Page.tsx b/src/routes/Settings/Page.tsx",
    "+++ b/src/routes/Settings/Page.tsx",
    "@@ -20,0 +21,1 @@",
    "+  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);",
  ].join("\n")

  assert.equal(findDirectColorViolations(diff).length, 1)
})

test("findDirectColorViolations ignores removed lines and theme tokens", () => {
  const diff = [
    "diff --git a/src/routes/Feed/Card.tsx b/src/routes/Feed/Card.tsx",
    "--- a/src/routes/Feed/Card.tsx",
    "+++ b/src/routes/Feed/Card.tsx",
    "@@ -4,1 +4,1 @@",
    "-  color: #ffffff;",
    "+  color: ${({ theme }) => theme.colors.gray12};",
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [])
})

test("findDirectColorViolations ignores URL fragment references", () => {
  const diff = [
    "diff --git a/src/layouts/RootLayout/Header.tsx b/src/layouts/RootLayout/Header.tsx",
    "+++ b/src/layouts/RootLayout/Header.tsx",
    "@@ -1,0 +1,3 @@",
    '+  <a href="#feed">Feed</a>',
    '+  mask: url(#fade);',
    '+  color: "#ffffff";',
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [
    {
      file: "src/layouts/RootLayout/Header.tsx",
      line: 3,
      source: 'color: "#ffffff";',
    },
  ])
})

test("committedDiffRange avoids requiring a shallow checkout merge base", () => {
  assert.equal(committedDiffRange("origin/main"), "origin/main..HEAD")
})

test("collectDiffText skips non-git build directories", () => {
  const originalCwd = process.cwd()
  const buildDir = mkdtempSync(join(tmpdir(), "design-colors-no-git-"))

  try {
    process.chdir(buildDir)
    assert.equal(collectDiffText(), "")
  } finally {
    process.chdir(originalCwd)
  }
})
