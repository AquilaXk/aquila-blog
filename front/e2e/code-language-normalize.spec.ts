import { expect, test } from "@playwright/test"
import { normalizeCodeLanguage } from "src/components/editor/extensions"

test.describe("code language normalize", () => {
  test("txt와 plaintext 계열은 일반 텍스트로 정규화한다", () => {
    expect(normalizeCodeLanguage("txt")).toBe("text")
    expect(normalizeCodeLanguage("plaintext")).toBe("text")
    expect(normalizeCodeLanguage("plain-text")).toBe("text")
    expect(normalizeCodeLanguage("plain text")).toBe("text")
  })

  test("자주 쓰는 축약 언어는 canonical 값으로 정규화한다", () => {
    expect(normalizeCodeLanguage("ts")).toBe("typescript")
    expect(normalizeCodeLanguage("js")).toBe("javascript")
    expect(normalizeCodeLanguage("kt")).toBe("kotlin")
    expect(normalizeCodeLanguage("py")).toBe("python")
    expect(normalizeCodeLanguage("yml")).toBe("yaml")
  })
})
