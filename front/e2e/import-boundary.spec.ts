import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

type RestrictedImportPattern = {
  group?: string[]
}

type RestrictedImportRule = [
  "error",
  {
    patterns?: RestrictedImportPattern[]
  }
]

type EslintOverride = {
  files?: string[]
  rules?: {
    "no-restricted-imports"?: RestrictedImportRule
  }
}

const readEslintOverrides = (): EslintOverride[] => {
  const eslintConfig = JSON.parse(readFileSync(path.resolve(__dirname, "../.eslintrc.json"), "utf8")) as {
    overrides?: EslintOverride[]
  }

  return eslintConfig.overrides ?? []
}

const restrictedImportGroupsFor = (filePattern: string): string[] => {
  const override = readEslintOverrides().find((candidate) => candidate.files?.includes(filePattern))
  const restrictedImportRule = override?.rules?.["no-restricted-imports"]

  return restrictedImportRule?.[1].patterns?.flatMap((pattern) => pattern.group ?? []) ?? []
}

test.describe("frontend import boundary", () => {
  test("lower layers cannot import route or page UI layers", () => {
    expect(restrictedImportGroupsFor("src/apis/**/*.{ts,tsx}")).toEqual(
      expect.arrayContaining(["src/routes/**", "src/components/**", "src/pages/**"])
    )
    expect(restrictedImportGroupsFor("src/libs/**/*.{ts,tsx}")).toEqual(
      expect.arrayContaining(["src/routes/**", "src/pages/**"])
    )
    expect(restrictedImportGroupsFor("src/components/**/*.{ts,tsx}")).toEqual(
      expect.arrayContaining(["src/routes/**", "src/pages/**"])
    )
    expect(restrictedImportGroupsFor("src/routes/**/*.{ts,tsx}")).toEqual(expect.arrayContaining(["src/pages/**"]))
  })
})
