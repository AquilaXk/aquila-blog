import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test.describe("perf spec split guard", () => {
  test("root perf spec stays below the line budget", () => {
    const source = readFileSync(resolve(__dirname, "perf.spec.ts"), "utf8")
    expect(source.split("\n").length).toBeLessThanOrEqual(800)
  })
})
