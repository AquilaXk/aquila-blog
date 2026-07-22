import { expect, test } from "@playwright/test"
import {
  applyCandidateCodeFenceRecovery,
  hasEmptyFencedCodeBlockBody,
  resolveEditorCodeFenceRecovery,
} from "../../src/routes/Admin/editorCodeFenceRecovery"

const emptyFenceContent = [
  "intro",
  "",
  "```kotlin",
  "",
  "```",
  "",
  "outro",
].join("\n")

const filledFenceContent = [
  "intro",
  "",
  "```kotlin",
  "fun example() = Unit",
  "```",
  "",
  "outro",
].join("\n")

test.describe("editor code fence recovery", () => {
  test("detects visibly empty fenced bodies", () => {
    expect(hasEmptyFencedCodeBlockBody(emptyFenceContent)).toBe(true)
    expect(hasEmptyFencedCodeBlockBody(filledFenceContent)).toBe(false)
  })

  test("recovers empty fences from contentHtml body candidate before public API", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: filledFenceContent,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(true)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(false)
    expect(result.content).toContain("fun example() = Unit")
  })

  test("uses public API only when contentHtml recovery is insufficient", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: emptyFenceContent,
      publicContent: filledFenceContent,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(result.content).toContain("fun example() = Unit")
  })

  test("marks unrecovered when PRIVATE-like public fallback is unavailable", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: "",
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("unrecovered")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
  })

  test("replaces fully empty admin content with candidate markdown", () => {
    const result = applyCandidateCodeFenceRecovery("", filledFenceContent)
    expect(result.recovered).toBe(true)
    expect(result.content).toBe(filledFenceContent)
  })
})
