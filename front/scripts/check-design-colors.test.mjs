import test from "node:test"
import assert from "node:assert/strict"
import { findDirectColorViolations } from "./check-design-colors.mjs"

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
