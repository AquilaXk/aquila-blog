import { expect, test } from "@playwright/test"
import {
  adminContentHadEmptyFenceForTelemetry,
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

const twoEmptyFences = [
  "intro",
  "",
  "```kotlin",
  "",
  "```",
  "",
  "```ts",
  "",
  "```",
  "",
  "outro",
].join("\n")

const partialHtmlCandidate = [
  "intro",
  "",
  "```kotlin",
  "fun example() = Unit",
  "```",
  "",
  "```ts",
  "",
  "```",
  "",
  "outro",
].join("\n")

const fullPublicCandidate = [
  "intro",
  "",
  "```kotlin",
  "fun example() = Unit",
  "```",
  "",
  "```ts",
  "const value = 1",
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

  test("empty admin + prose-only html + public fenced content recovers via publicApi", () => {
    const proseOnlyHtml = "intro without fenced code"
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: proseOnlyHtml,
      publicContent: filledFenceContent,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(result.content).toBe(filledFenceContent)
  })

  test("telemetry treats wholly empty admin content as hadEmptyFence", () => {
    expect(adminContentHadEmptyFenceForTelemetry("")).toBe(true)
    expect(adminContentHadEmptyFenceForTelemetry(emptyFenceContent)).toBe(true)
    expect(adminContentHadEmptyFenceForTelemetry(filledFenceContent)).toBe(false)
  })

  test("empty admin + blank html + public content recovers via publicApi", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: "",
      publicContent: filledFenceContent,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(result.content).toBe(filledFenceContent)
  })

  test("partial html recovery prefers publicApi when public fully recovers", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: twoEmptyFences,
      contentHtmlBodyCandidate: partialHtmlCandidate,
      publicContent: fullPublicCandidate,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(false)
    expect(result.content).toContain("fun example() = Unit")
    expect(result.content).toContain("const value = 1")
  })

  test("complete html recovery uses contentHtml without needing public", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: filledFenceContent,
      publicContent: fullPublicCandidate,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(true)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(false)
    expect(result.content).toContain("fun example() = Unit")
    expect(result.content).not.toContain("const value = 1")
  })

  test("does not mark recovered when public fallback only partially fills fences", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: twoEmptyFences,
      contentHtmlBodyCandidate: "",
      publicContent: partialHtmlCandidate,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
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
