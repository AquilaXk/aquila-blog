import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectDiffText,
  committedDiffRange,
  findDirectColorViolations,
  isColorSourceFile,
} from "./check-design-colors.mjs"

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

test("findDirectColorViolations reports multi-line functional colors", () => {
  const diff = [
    "diff --git a/src/routes/Feed/Card.tsx b/src/routes/Feed/Card.tsx",
    "+++ b/src/routes/Feed/Card.tsx",
    "@@ -20,0 +21,4 @@",
    "+  box-shadow: 0 8px 20px rgba(",
    "+    15,",
    "+    23,",
    "+    42,",
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [
    {
      file: "src/routes/Feed/Card.tsx",
      line: 21,
      source: "box-shadow: 0 8px 20px rgba(",
    },
  ])
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
    "@@ -1,0 +1,6 @@",
    '+  <a href="#feed">Feed</a>',
    '+  <a href={"#feed"}>Feed</a>',
    "+  <a href={'#feed'}>Feed</a>",
    '+  mask: url(#fade);',
    '+  mask: url("#fade");',
    '+  color: "#ffffff";',
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [
    {
      file: "src/layouts/RootLayout/Header.tsx",
      line: 6,
      source: 'color: "#ffffff";',
    },
  ])
})

test("findDirectColorViolations allows color literals in the palette source module", () => {
  const diff = [
    "diff --git a/src/design-system/marketingPalette.ts b/src/design-system/marketingPalette.ts",
    "+++ b/src/design-system/marketingPalette.ts",
    "@@ -1,0 +1,2 @@",
    '+  700: "#5C6BC0",',
    '+  900: "#3B4890",',
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [])
})

/**
 * git은 pathspec을 front에서 주더라도 diff 헤더 경로를 저장소 루트 기준으로 쓴다. 예외를 앱 기준
 * 경로와 문자열 일치로만 보면 워킹트리 diff에서는 통과하고 커밋된 diff에서는 실패한다.
 */
test("findDirectColorViolations allows the palette module under a repository-root diff path", () => {
  const diff = [
    "diff --git a/front/src/design-system/marketingPalette.ts b/front/src/design-system/marketingPalette.ts",
    "+++ b/front/src/design-system/marketingPalette.ts",
    "@@ -1,0 +1,1 @@",
    '+  400: "#B4BCFB",',
  ].join("\n")

  assert.deepEqual(findDirectColorViolations(diff), [])
})

test("isColorSourceFile does not exempt look-alike paths outside the allowlist", () => {
  assert.equal(isColorSourceFile("src/design-system/marketingPalette.ts"), true)
  assert.equal(isColorSourceFile("front/src/design-system/marketingPalette.ts"), true)
  assert.equal(isColorSourceFile("front/src/design-system/otherMarketingPalette.ts"), false)
  assert.equal(isColorSourceFile("front/src/routes/Company/marketingPalette.ts"), false)
})

test("findDirectColorViolations still guards surfaces that consume the palette", () => {
  const diff = [
    "diff --git a/src/routes/Company/CompanyPage.styles.ts b/src/routes/Company/CompanyPage.styles.ts",
    "+++ b/src/routes/Company/CompanyPage.styles.ts",
    "@@ -1,0 +1,1 @@",
    "+  background: #5C6BC0;",
  ].join("\n")

  assert.equal(findDirectColorViolations(diff).length, 1)
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
