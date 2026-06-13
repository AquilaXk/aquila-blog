import { expect, test } from "./helpers/authoringPlaywright"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  mockEditorRouteWithPost507,
  POST_507_REAL_FEATURE_CONTRACT,
  readPost507EditorDiagnostics,
} from "./helpers/post507Fixtures"

const e2eRoot = path.resolve(process.cwd(), "e2e")
const helperSource = (relativePath: string) => readFileSync(path.join(e2eRoot, relativePath), "utf8")

test.describe("editor 507 real feature E2E contract", () => {
  test("사용자 체감 editor close gate는 507 copy route coverage manifest로 고정된다", () => {
    expect(POST_507_REAL_FEATURE_CONTRACT.editorRoute).toBe("/editor/[id]")
    expect(POST_507_REAL_FEATURE_CONTRACT.fixtureName).toBe("post507Markdown")
    expect(POST_507_REAL_FEATURE_CONTRACT.auxiliaryRouteBoundary).toContain("auxiliary")

    const requiredIds = [
      "code-block-initial-render",
      "code-block-language-picker",
      "table-axis-selection",
      "table-cmd-a",
      "table-text-drag",
      "list-item-block-selection",
      "body-text-selection",
      "block-selection",
      "scroll-jump-lock",
      "lower-real-workflow-gate",
    ]
    expect(POST_507_REAL_FEATURE_CONTRACT.requiredCoverage.map((entry) => entry.id)).toEqual(requiredIds)

    for (const coverage of POST_507_REAL_FEATURE_CONTRACT.requiredCoverage) {
      const source = helperSource(coverage.specFile)
      for (const fragment of coverage.requiredSourceFragments) {
        expect(source, `${coverage.id} must contain ${fragment}`).toContain(fragment)
      }
      expect(source, `${coverage.id} must exercise an editor route`).toMatch(/\/editor\/|mockEditorRouteWithPost507/)

      const usesSyntheticPostId = /adm\/posts\/(?:584|585|988|994|996|997|998|999)|\/editor\/(?:584|585|988|994|996|997|998|999)/.test(source)
      if (usesSyntheticPostId) {
        expect(
          /post507|POST_507|507/.test(source),
          `${coverage.specFile} uses a synthetic id and must explicitly bind it to the 507 copy/source`
        ).toBe(true)
      }
    }
  })

  test("QA route constants are explicitly auxiliary, not real bug close gates", () => {
    const source = helperSource("helpers/editorAuthoringFlow.ts")
    expect(source).toContain("QA_ROUTE_PURPOSE")
    expect(source).toContain("auxiliary-only")
    expect(source).toContain("not editor user-bug close gates")
  })

  test("507 diagnostics snapshot includes selection, scroll, focus, overlay, preserve owner, and DOM summary", async ({
    page,
  }) => {
    await mockEditorRouteWithPost507(page, {
      postId: 589,
      title: "post 507 real feature diagnostics contract 글",
    })

    const diagnostics = await readPost507EditorDiagnostics(page, "loaded-507")

    expect(diagnostics.url).toBe("/editor/589")
    expect(diagnostics.scrollTopTimeline).toEqual([
      expect.objectContaining({ label: "loaded-507", scrollTop: expect.any(Number) }),
    ])
    expect(diagnostics.domSnapshot.editorTextSample).toContain("Stateless")
    expect(diagnostics.domSnapshot.codeBlockCount).toBeGreaterThanOrEqual(1)
    expect(diagnostics.domSnapshot.tableCount).toBeGreaterThanOrEqual(1)
    expect(diagnostics).toEqual(
      expect.objectContaining({
        activeElement: expect.any(String),
        domSnapshot: expect.any(Object),
        overlayRects: expect.any(Array),
        preserveAttributes: expect.any(Array),
        selectionText: expect.any(String),
      })
    )
    expect(Object.hasOwn(diagnostics, "focusedElement")).toBe(true)
    expect(diagnostics.focusedElement === null || typeof diagnostics.focusedElement === "string").toBe(true)
    expect(
      (diagnostics as unknown as { interactionTelemetry?: unknown }).interactionTelemetry,
      "507 diagnostics must expose interaction telemetry so tests can fail on timeline churn"
    ).toEqual(
      expect.objectContaining({
        fallbackTimeline: expect.any(Array),
        menuTimeline: expect.any(Array),
        scrollTopTimeline: expect.any(Array),
        scrollToCalls: expect.any(Array),
        selectionTimeline: expect.any(Array),
      })
    )
  })
})
