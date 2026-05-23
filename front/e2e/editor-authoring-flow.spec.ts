import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test.describe("editor authoring spec split guard", () => {
  test("root spec stays below the orchestration line budget", () => {
    const source = readFileSync(resolve(__dirname, "editor-authoring-flow.spec.ts"), "utf8")
    const lineCount = source.split("\n").length

    expect(lineCount).toBeLessThanOrEqual(800)
  })
})
