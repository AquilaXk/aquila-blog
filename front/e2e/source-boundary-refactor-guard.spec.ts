import { execFileSync } from "node:child_process"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("refactor boundary guard", () => {
  test("large file and ownership boundary guard passes", () => {
    const frontRoot = path.resolve(__dirname, "..")
    const output = execFileSync(process.execPath, [path.join(frontRoot, "scripts/check-refactor-boundaries.mjs")], {
      cwd: frontRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    })

    expect(output).toContain("[refactor-boundaries] ok")
  })
})
