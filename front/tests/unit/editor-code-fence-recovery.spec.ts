import { expect, test } from "@playwright/test"
import {
  adminContentHadEmptyFenceForTelemetry,
  applyCandidateCodeFenceRecovery,
  hasEmptyFencedCodeBlockBody,
  htmlRecoveryConflictsWithPublic,
  hasComplementaryPublicRecoveryPattern,
  isCandidateInSyncWithAdmin,
  isContentHtmlRecoveryTrustworthy,
  resolveEditorCodeFenceRecovery,
  resolveLoadedPostContentHtml,
  shouldFetchPublicContentForCodeFenceRecovery,
} from "../../src/routes/Admin/editorCodeFenceRecovery"
import { resolveEditorMetaSnapshot } from "../../src/routes/Admin/editorStudioMetaModel"

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

const partialPublicCandidate = [
  "intro",
  "",
  "```kotlin",
  "",
  "```",
  "",
  "```ts",
  "const value = 1",
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

  test("empty admin + prose-only html does not fetch public or mark recovered", () => {
    const proseOnlyHtml = "intro without fenced code"
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: proseOnlyHtml,
      publicContent: filledFenceContent,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(false)
    expect(result.content).toBe(proseOnlyHtml)
  })

  test("telemetry treats wholly empty admin content as hadEmptyFence", () => {
    expect(adminContentHadEmptyFenceForTelemetry("")).toBe(true)
    expect(adminContentHadEmptyFenceForTelemetry(emptyFenceContent)).toBe(true)
    expect(adminContentHadEmptyFenceForTelemetry(filledFenceContent)).toBe(false)
  })

  test("empty admin + blank html stays unrecovered without public fetch", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: "",
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("unrecovered")
    expect(result.recovered).toBe(false)
    expect(result.content).toBe("")
  })

  test("merges complementary partial html and public candidates sequentially", () => {
    const htmlWithFirstFenceOnly = [
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

    const result = resolveEditorCodeFenceRecovery({
      adminContent: twoEmptyFences,
      contentHtmlBodyCandidate: htmlWithFirstFenceOnly,
      publicContent: fullPublicCandidate,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(false)
    expect(result.content).toContain("fun example() = Unit")
    expect(result.content).toContain("const value = 1")
  })

  test("partial html alone reports recovered false", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: twoEmptyFences,
      contentHtmlBodyCandidate: partialHtmlCandidate,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
    expect(result.content).toContain("fun example() = Unit")
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

  test("prefers public when html recovery is complete but public preserves richer fence metadata", () => {
    const adminWithPlainFence = [
      "intro",
      "",
      "```",
      "",
      "```",
      "",
      "outro",
    ].join("\n")
    const htmlFilledFence = [
      "intro",
      "",
      "```kotlin",
      "fun example() = Unit",
      "```",
      "",
      "outro",
    ].join("\n")
    const publicWithFenceTitle = [
      "intro",
      "",
      '```kotlin title="Example"',
      "fun example() = Unit",
      "```",
      "",
      "outro",
    ].join("\n")

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithPlainFence,
      contentHtmlBodyCandidate: htmlFilledFence,
      publicContent: publicWithFenceTitle,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(result.content).toContain('title="Example"')
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(false)
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

  test("does not restore intentionally cleared fence from stale contentHtml when public confirms empty", () => {
    const adminWithClearedFence = emptyFenceContent
    const staleHtmlWithOldCode = filledFenceContent
    const publicWithEmptyFence = emptyFenceContent

    expect(
      htmlRecoveryConflictsWithPublic(
        adminWithClearedFence,
        staleHtmlWithOldCode,
        publicWithEmptyFence
      )
    ).toBe(true)
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: adminWithClearedFence,
        contentHtmlBodyCandidate: staleHtmlWithOldCode,
        htmlRecoveredContent: staleHtmlWithOldCode,
        publicContent: publicWithEmptyFence,
        publicFallbackSucceeded: true,
      })
    ).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithClearedFence,
      contentHtmlBodyCandidate: staleHtmlWithOldCode,
      publicContent: publicWithEmptyFence,
      publicFallbackSucceeded: true,
    })

    expect(result.source).not.toBe("contentHtml")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
    expect(result.content).not.toContain("fun example() = Unit")
  })

  test("does not restore empty fences from contentHtml when fence opening changed in admin", () => {
    const adminWithChangedLanguage = [
      "intro",
      "",
      "```typescript",
      "",
      "```",
      "",
      "outro",
    ].join("\n")
    const staleHtmlWithKotlin = filledFenceContent

    expect(isCandidateInSyncWithAdmin(adminWithChangedLanguage, staleHtmlWithKotlin)).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithChangedLanguage,
      contentHtmlBodyCandidate: staleHtmlWithKotlin,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("unrecovered")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
    expect(result.content).not.toContain("fun example() = Unit")
  })

  test("does not restore empty fences from contentHtml when fence info string changed in admin", () => {
    const adminWithFenceTitle = [
      "intro",
      "",
      '```kotlin title="Updated"',
      "",
      "```",
      "",
      "outro",
    ].join("\n")
    const staleHtmlWithoutTitle = filledFenceContent

    expect(isCandidateInSyncWithAdmin(adminWithFenceTitle, staleHtmlWithoutTitle)).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithFenceTitle,
      contentHtmlBodyCandidate: staleHtmlWithoutTitle,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("unrecovered")
    expect(result.recovered).toBe(false)
    expect(result.content).not.toContain("fun example() = Unit")
  })

  test("does not restore empty fences from contentHtml when prose is out of sync", () => {
    const adminWithUpdatedProse = [
      "updated intro",
      "",
      "```kotlin",
      "",
      "```",
      "",
      "outro",
    ].join("\n")
    const staleHtml = filledFenceContent

    expect(isCandidateInSyncWithAdmin(adminWithUpdatedProse, staleHtml)).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithUpdatedProse,
      contentHtmlBodyCandidate: staleHtml,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("unrecovered")
    expect(result.recovered).toBe(false)
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
    expect(result.content).not.toContain("fun example() = Unit")
  })

  test("sync check uses parsed admin body so frontmatter does not block private recovery", () => {
    const adminWithFrontmatter = [
      "tags: kotlin",
      "",
      "intro",
      "",
      "```kotlin",
      "",
      "```",
      "",
      "outro",
    ].join("\n")
    const htmlCandidate = filledFenceContent

    const result = resolveEditorCodeFenceRecovery({
      adminContent: adminWithFrontmatter,
      adminBodyForSync: emptyFenceContent,
      contentHtmlBodyCandidate: htmlCandidate,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(true)
    expect(result.rejectStoredContentHtml).toBe(false)
    expect(result.content).toContain("fun example() = Unit")
  })

  test("marks stale html for rejection when public confirms intentional empty fence", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: filledFenceContent,
      publicContent: emptyFenceContent,
      publicFallbackSucceeded: true,
    })

    expect(result.rejectStoredContentHtml).toBe(true)
    expect(result.source).not.toBe("contentHtml")
  })

  test("rejects html recovery when public fence body mismatches non-empty html body", () => {
    const htmlWithCodeA = [
      "intro",
      "",
      "```kotlin",
      "fun codeA() = Unit",
      "```",
      "",
      "outro",
    ].join("\n")
    const publicWithCodeB = [
      "intro",
      "",
      "```kotlin",
      "fun codeB() = Unit",
      "```",
      "",
      "outro",
    ].join("\n")

    expect(
      htmlRecoveryConflictsWithPublic(emptyFenceContent, htmlWithCodeA, publicWithCodeB)
    ).toBe(true)
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: emptyFenceContent,
        contentHtmlBodyCandidate: htmlWithCodeA,
        htmlRecoveredContent: htmlWithCodeA,
        publicContent: publicWithCodeB,
        publicFallbackSucceeded: true,
      })
    ).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: htmlWithCodeA,
      publicContent: publicWithCodeB,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(true)
    expect(result.rejectStoredContentHtml).toBe(true)
    expect(result.content).toContain("fun codeB() = Unit")
    expect(result.content).not.toContain("fun codeA() = Unit")
  })

  test("does not waive conflict on one fence because another fence is complementary", () => {
    expect(
      htmlRecoveryConflictsWithPublic(twoEmptyFences, partialHtmlCandidate, partialPublicCandidate)
    ).toBe(true)
    expect(
      hasComplementaryPublicRecoveryPattern(twoEmptyFences, partialHtmlCandidate, partialPublicCandidate)
    ).toBe(true)
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: twoEmptyFences,
        contentHtmlBodyCandidate: partialHtmlCandidate,
        htmlRecoveredContent: partialHtmlCandidate,
        publicContent: partialPublicCandidate,
        publicFallbackSucceeded: true,
      })
    ).toBe(false)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: twoEmptyFences,
      contentHtmlBodyCandidate: partialHtmlCandidate,
      publicContent: partialPublicCandidate,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("publicApi")
    expect(result.recovered).toBe(false)
    expect(result.rejectStoredContentHtml).toBe(true)
    expect(result.content).toContain("const value = 1")
    expect(result.content).not.toContain("fun example() = Unit")
    expect(hasEmptyFencedCodeBlockBody(result.content)).toBe(true)
  })

  test("empty admin + prose-only html without public does not mark recovered", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: "intro without fenced code",
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(false)
    expect(result.content).toBe("intro without fenced code")
  })

  test("fetches public only for empty-fence admin, not wholly cleared admin", () => {
    expect(shouldFetchPublicContentForCodeFenceRecovery("")).toBe(false)
    expect(shouldFetchPublicContentForCodeFenceRecovery("   \n")).toBe(false)
    expect(shouldFetchPublicContentForCodeFenceRecovery(emptyFenceContent)).toBe(true)
    expect(shouldFetchPublicContentForCodeFenceRecovery(filledFenceContent)).toBe(false)
  })

  test("does not revive cleared empty admin from stale contentHtml when public confirms empty", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: filledFenceContent,
      publicContent: "",
      publicFallbackSucceeded: true,
    })

    expect(
      htmlRecoveryConflictsWithPublic("", filledFenceContent, "")
    ).toBe(true)
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: "",
        contentHtmlBodyCandidate: filledFenceContent,
        htmlRecoveredContent: filledFenceContent,
        publicContent: "",
        publicFallbackSucceeded: true,
      })
    ).toBe(false)
    expect(result.source).not.toBe("contentHtml")
    expect(result.recovered).toBe(false)
    expect(result.content).toBe("")
    expect(result.content).not.toContain("fun example() = Unit")
    expect(result.rejectStoredContentHtml).toBe(true)
  })

  test("empty admin with stale contentHtml sets rejectStoredContentHtml without public fetch", () => {
    const result = resolveEditorCodeFenceRecovery({
      adminContent: "",
      contentHtmlBodyCandidate: filledFenceContent,
      publicFallbackSucceeded: false,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(true)
    expect(result.content).toContain("fun example() = Unit")
    expect(result.rejectStoredContentHtml).toBe(false)
  })

  test("treats missing public fence as html conflict for extra admin empty fences", () => {
    const adminWithExtraEmptyFence = [
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
    const htmlWithBothFilled = fullPublicCandidate
    const publicWithOneFence = [
      "intro",
      "",
      "```kotlin",
      "fun example() = Unit",
      "```",
      "",
      "outro",
    ].join("\n")

    expect(
      htmlRecoveryConflictsWithPublic(
        adminWithExtraEmptyFence,
        htmlWithBothFilled,
        publicWithOneFence
      )
    ).toBe(true)
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: adminWithExtraEmptyFence,
        contentHtmlBodyCandidate: htmlWithBothFilled,
        htmlRecoveredContent: htmlWithBothFilled,
        publicContent: publicWithOneFence,
        publicFallbackSucceeded: true,
      })
    ).toBe(false)
  })

  test("resolveLoadedPostContentHtml keeps admin contentHtml when recovery source is contentHtml", () => {
    expect(
      resolveLoadedPostContentHtml({
        postContentHtml: "<pre>admin html</pre>",
        publicContentHtml: "<pre>public html</pre>",
        fenceRecovery: {
          source: "contentHtml",
          rejectStoredContentHtml: false,
        },
      })
    ).toBe("<pre>admin html</pre>")
  })

  test("resolveLoadedPostContentHtml omits html when recovery rejects stored html", () => {
    expect(
      resolveLoadedPostContentHtml({
        postContentHtml: "<pre>stale html</pre>",
        publicContentHtml: "<pre>public html</pre>",
        fenceRecovery: {
          source: "unrecovered",
          rejectStoredContentHtml: true,
        },
      })
    ).toBeNull()
  })

  test("rejected html contentHtml does not revive cleared fences via meta sync", () => {
    const staleHtml = [
      "<p>intro</p>",
      "<pre><code class=\"language-kotlin\">fun example() = Unit</code></pre>",
      "<p>outro</p>",
    ].join("")
    const recoveredContent = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: filledFenceContent,
      publicContent: emptyFenceContent,
      publicFallbackSucceeded: true,
    })
    const loadedContentHtml = resolveLoadedPostContentHtml({
      postContentHtml: staleHtml,
      publicContentHtml: staleHtml,
      fenceRecovery: recoveredContent,
    })

    expect(recoveredContent.rejectStoredContentHtml).toBe(true)
    expect(loadedContentHtml).toBeNull()

    const snapshot = resolveEditorMetaSnapshot(recoveredContent.content, loadedContentHtml)
    expect(snapshot.body).not.toContain("fun example() = Unit")
    expect(hasEmptyFencedCodeBlockBody(snapshot.body)).toBe(true)
  })

  test("trusts html recovery when public markdown is derived from contentHtml only", () => {
    expect(
      isContentHtmlRecoveryTrustworthy({
        adminContent: emptyFenceContent,
        contentHtmlBodyCandidate: filledFenceContent,
        htmlRecoveredContent: filledFenceContent,
        publicContent: filledFenceContent,
        publicFallbackSucceeded: true,
      })
    ).toBe(true)

    const result = resolveEditorCodeFenceRecovery({
      adminContent: emptyFenceContent,
      contentHtmlBodyCandidate: filledFenceContent,
      publicContent: filledFenceContent,
      publicFallbackSucceeded: true,
    })

    expect(result.source).toBe("contentHtml")
    expect(result.recovered).toBe(true)
    expect(result.rejectStoredContentHtml).toBe(false)
  })
})
