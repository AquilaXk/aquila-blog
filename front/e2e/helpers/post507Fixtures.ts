import { expect, type Locator, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./editorAuthoringFlow"

export const POST_507_TITLE = "Stateless란 무엇인가?"
export const POST_507_FINAL_TABLE_TARGET_CELL = "Stateless 의미"
export const POST_507_FINAL_TABLE_END_CELL = "구현되어 있는가"
export const POST_507_FINAL_TABLE_HEADER_CELL = "영역"
export const POST_507_FINAL_REFERENCE_TEXT = "https://datatracker.ietf.org/doc/html/rfc7519"
export const POST_507_FINAL_TABLE_REQUIRED_TEXTS = [
  POST_507_FINAL_TABLE_HEADER_CELL,
  "점검 항목",
  "확인 기준",
  "개념 이해",
  POST_507_FINAL_TABLE_TARGET_CELL,
  "요청만으로 처리 가능한가",
  "Access/Refresh 구분",
  POST_507_FINAL_TABLE_END_CELL,
] as const
export const POST_507_FINAL_TABLE_FORBIDDEN_TEXTS = [
  "서버가 사용자의 로그인한 상태를 기억",
  "Access Token API 인증",
  "Access 길게 보안 위험",
] as const
export const POST_507_CODE_REQUIRED_TEXTS = [
  "public Token login(User user)",
  "createAccessToken(user)",
  "createRefreshToken(user)",
  "return new Token(access, refresh);",
] as const
const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

export const POST_507_REAL_FEATURE_CONTRACT = {
  auxiliaryRouteBoundary:
    "QA routes and synthetic documents are auxiliary/unit contracts; editor user-bug close gates must use post 507 copied content on /editor/[id].",
  editorRoute: "/editor/[id]",
  fixtureFile: "front/e2e/helpers/post507Fixtures.ts",
  fixtureName: "post507Markdown",
  requiredCoverage: [
    {
      id: "code-block-initial-render",
      issueSymptom: "code block body appears late or empty on first render",
      requiredSourceFragments: ["507 contentHtml 코드블럭", "POST_507_TITLE", "/editor/584"],
      routeContract: "507-contentHtml-copy",
      specFile: "editor-authoring-route-code-initial-render.spec.ts",
    },
    {
      id: "code-block-language-picker",
      issueSymptom: "code language picker dead-clicks or scrolls instead of opening",
      requiredSourceFragments: ["mockEditorRouteWithPost507", "post 507 code language route", "코드 언어 선택"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-code-mermaid.spec.ts",
    },
    {
      id: "table-axis-selection",
      issueSymptom: "row/column structural selection flickers or leaves stale overlays",
      requiredSourceFragments: [
        "installPost507InteractionTelemetry",
        "mockEditorRouteWithPost507",
        "expectNoPost507MenuChurn",
        "table-column-selection-outline",
        "table-row-selection-outline",
      ],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-table-axis-after-select-all.spec.ts",
    },
    {
      id: "table-cmd-a",
      issueSymptom: "Cmd/Ctrl+A in a table cell fails to select the current table text",
      requiredSourceFragments: ["mockEditorRouteWithPost507", "expectPost507FinalTableTextSelected", "SELECT_ALL_SHORTCUT"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-table-select-all.spec.ts",
    },
    {
      id: "table-text-drag",
      issueSymptom: "mouse drag inside table cells does not leave native text selection",
      requiredSourceFragments: ["post507Markdown", "single-cell native drag", "multi-cell"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-table-multicell-selection.spec.ts",
    },
    {
      id: "list-item-block-selection",
      issueSymptom: "list item block selection paints inside the bullet/content instead of the item overlay",
      requiredSourceFragments: ["mockEditorRouteWithPost507", "실제 /editor/[id] 507 리스트 항목"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-list-affordances.spec.ts",
    },
    {
      id: "body-text-selection",
      issueSymptom: "body text drag selection jumps scroll or leaves block overlay state behind",
      requiredSourceFragments: ["post507Markdown", "Stateless가 좋다는데", "bodyDrag.selectionText"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-live-drag-sequence.spec.ts",
    },
    {
      id: "block-selection",
      issueSymptom: "top-level block selection competes with code/list/table text selection",
      requiredSourceFragments: ["mockEditorRouteWithPost507", "코드블럭 block handle", "keyboard-block-selection-overlay"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-code-mermaid.spec.ts",
    },
    {
      id: "scroll-jump-lock",
      issueSymptom: "selection or drag leaves scrollTop jumped or locked",
      requiredSourceFragments: ["post507Markdown", "live 507", "scrollTop"],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-live-drag-sequence.spec.ts",
    },
    {
      id: "lower-real-workflow-gate",
      issueSymptom:
        "code block body and final table scroll/selection regressions only appear when the lower 507 workflow runs as one user sequence",
      requiredSourceFragments: [
        "setupPost507ModifyRequestCapture",
        "expectPost507CodeGateSatisfied",
        "runPost507LowerRealWorkflowGate",
        "expectPost507LowerGateTelemetryStable",
        "cell text drag -> code block internal Cmd/Ctrl+A -> row axis selection -> column axis selection -> lower body text selection -> lower body block drag",
      ],
      routeContract: "507-copy-route",
      specFile: "editor-authoring-route-real-507-lower-gate.spec.ts",
    },
  ],
} as const

export type Post507EditorDiagnosticSnapshot = {
  activeElement: string | null
  activePreserveOwner: string | null
  domSnapshot: {
    blockOverlayCount: number
    blockGhostCount: number
    codeBlockCount: number
    dropIndicatorCount: number
    editorTextSample: string
    selectedCellCount: number
    tableCount: number
  }
  focusedElement: string | null
  interactionTelemetry: Post507InteractionTelemetrySnapshot
  overlayRects: Array<{
    bottom: number
    height: number
    left: number
    selector: string
    testId: string | null
    top: number
    width: number
  }>
  preserveAttributes: Array<{ element: string; name: string; value: string }>
  scrollTopTimeline: Array<{ label: string; scrollTop: number }>
  selectionDebug: {
    elementFallbackText: string
    owner: Post507InteractionTelemetrySnapshot["selectionTimeline"][number]["owner"]
    rootFallbackText: string
    windowText: string
  }
  selectionText: string
  url: string
}

export type Post507InteractionTelemetrySnapshot = {
  fallbackTimeline: Array<{
    codeFallbackCount: number
    codeFallbackText: string
    label: string
    tableFallbackCount: number
    tableFallbackText: string
  }>
  menuTimeline: Array<{
    columnMenuCount: number
    columnMenuVisibleCount: number
    label: string
    rowMenuCount: number
    rowMenuVisibleCount: number
    structureMenuCount: number
    structureMenuVisibleCount: number
  }>
  menuEverVisible: {
    column: boolean
    row: boolean
    structure: boolean
  }
  scrollToCalls: Array<{
    elapsedMs: number
    targetX: number
    targetY: number
  }>
  scrollTopTimeline: Array<{ elapsedMs: number; label: string; scrollTop: number }>
  selectionTimeline: Array<{
    label: string
    owner: "block" | "body" | "code" | "none" | "table"
    textLength: number
    textSample: string
  }>
}

export const readPost507EditorDiagnostics = async (
  page: Page,
  label = "snapshot"
): Promise<Post507EditorDiagnosticSnapshot> =>
  page.evaluate((snapshotLabel) => {
    const describeElement = (element: Element | null) => {
      if (!element) return null
      const id = element.id ? `#${element.id}` : ""
      const testId = element.getAttribute("data-testid")
      const testIdSuffix = testId ? `[data-testid="${testId}"]` : ""
      const className = typeof element.className === "string" ? element.className.trim().replace(/\s+/g, ".") : ""
      return `${element.tagName.toLowerCase()}${id}${className ? `.${className}` : ""}${testIdSuffix}`
    }
    const toRect = (element: Element, selector: string) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        selector,
        testId: element.getAttribute("data-testid"),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      }
    }
    const overlaySelectors = [
      "[data-testid='keyboard-block-selection-overlay']",
      "[data-testid='table-column-selection-outline']",
      "[data-testid='table-row-selection-outline']",
      "[data-testid='block-drop-indicator']",
      "[data-testid='block-drag-ghost']",
      "[data-block-drag-ghost='true']",
      "[data-table-affordance]",
    ]
    const overlayRects = overlaySelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((element) => toRect(element, selector))
    )
    const preserveAttributes = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .flatMap((element) =>
        Array.from(element.attributes)
          .filter((attribute) => /preserve|scroll|selection/i.test(attribute.name))
          .map((attribute) => ({
            element: describeElement(element) || element.tagName.toLowerCase(),
            name: attribute.name,
            value: attribute.value.slice(0, 160),
          }))
      )
      .slice(0, 40)
    const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
    const windowSelectionText = window.getSelection()?.toString() || ""
    const rootFallbackText = document.documentElement.getAttribute("data-table-drag-selection-text") || ""
    const elementFallbackText =
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") || ""
    const selectionText = windowSelectionText || rootFallbackText || elementFallbackText
    const readFallbackSample = (sampleLabel: string) => {
      const codeFallbackText =
        document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text")?.trim() ||
        ""
      const tableFallbackText =
        document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ||
        document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text")?.trim() ||
        ""
      return {
        codeFallbackCount: document.querySelectorAll("[data-code-drag-selection-text]").length,
        codeFallbackText: codeFallbackText.slice(0, 160),
        label: sampleLabel,
        tableFallbackCount: document.querySelectorAll("[data-table-drag-selection-text]").length,
        tableFallbackText: tableFallbackText.slice(0, 160),
      }
    }
    const isElementVisible = (element: Element) => {
      const className = typeof element.className === "string" ? element.className.toLowerCase() : ""
      const style = (element.getAttribute("style") || "").toLowerCase()
      return (
        element.getAttribute("aria-hidden") !== "true" &&
        element.getAttribute("data-state") !== "closed" &&
        !element.hasAttribute("hidden") &&
        !/\b(hidden|invisible|opacity-0)\b/.test(className) &&
        !/(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/.test(style)
      )
    }
    const countVisibleElements = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).filter(isElementVisible).length
    const readMenuSample = (sampleLabel: string) => ({
      columnMenuCount: document.querySelectorAll("[data-testid='table-column-menu']").length,
      columnMenuVisibleCount: countVisibleElements("[data-testid='table-column-menu']"),
      label: sampleLabel,
      rowMenuCount: document.querySelectorAll("[data-testid='table-row-menu']").length,
      rowMenuVisibleCount: countVisibleElements("[data-testid='table-row-menu']"),
      structureMenuCount: document.querySelectorAll("[data-testid='table-structure-menu'], [data-table-menu-root='true']").length,
      structureMenuVisibleCount: countVisibleElements("[data-testid='table-structure-menu'], [data-table-menu-root='true']"),
    })
    const resolveSelectionOwner = (): Post507InteractionTelemetrySnapshot["selectionTimeline"][number]["owner"] => {
      const selection = window.getSelection()
      const elements = [selection?.anchorNode, selection?.focusNode]
        .map((node) => (node instanceof Element ? node : node?.parentElement ?? null))
        .filter((element): element is Element => Boolean(element))
      if (elements.some((element) => element.closest(".aq-code-shell, .aq-code-editor-content"))) return "code"
      if (elements.some((element) => element.closest("td, th, .tableWrapper"))) return "table"
      if (document.querySelector("[data-testid='keyboard-block-selection-overlay']")) return "block"
      if (selection?.toString().trim()) return "body"
      return "none"
    }
    const readSelectionSample = (sampleLabel: string) => {
      const text = window.getSelection()?.toString() || ""
      return {
        label: sampleLabel,
        owner: resolveSelectionOwner(),
        textLength: text.length,
        textSample: text.replace(/\s+/g, " ").trim().slice(0, 160),
      }
    }
    const readScrollTopSample = (sampleLabel: string) => ({
      elapsedMs: 0,
      label: sampleLabel,
      scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
    })
    const telemetryWindow = window as typeof window & {
      __aqPost507InteractionTelemetry?: Post507InteractionTelemetrySnapshot
    }
    const recordedTelemetry = telemetryWindow.__aqPost507InteractionTelemetry

    return {
      activeElement: describeElement(document.activeElement),
      activePreserveOwner:
        document.documentElement.getAttribute("data-editor-scroll-preserve-owner") ||
        document.documentElement.getAttribute("data-editor-active-preserve-owner") ||
        null,
      domSnapshot: {
        blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
        blockGhostCount: document.querySelectorAll("[data-testid='block-drag-ghost'], [data-block-drag-ghost='true']").length,
        codeBlockCount: document.querySelectorAll("[data-code-block-wrapper='true'], .aq-code-shell").length,
        dropIndicatorCount: document.querySelectorAll("[data-testid='block-drop-indicator']").length,
        editorTextSample: (editor?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        selectedCellCount: document.querySelectorAll(".selectedCell").length,
        tableCount: document.querySelectorAll("table").length,
      },
      focusedElement: describeElement(document.querySelector(":focus")),
      interactionTelemetry: recordedTelemetry
        ? {
            fallbackTimeline: recordedTelemetry.fallbackTimeline.slice(-120),
            menuEverVisible: recordedTelemetry.menuEverVisible,
            menuTimeline: recordedTelemetry.menuTimeline.slice(-120),
            scrollToCalls: recordedTelemetry.scrollToCalls.slice(-120),
            scrollTopTimeline: recordedTelemetry.scrollTopTimeline.slice(-120),
            selectionTimeline: recordedTelemetry.selectionTimeline.slice(-120),
          }
        : {
            fallbackTimeline: [readFallbackSample(snapshotLabel)],
            menuEverVisible: {
              column: countVisibleElements("[data-testid='table-column-menu']") > 0,
              row: countVisibleElements("[data-testid='table-row-menu']") > 0,
              structure: countVisibleElements("[data-testid='table-structure-menu'], [data-table-menu-root='true']") > 0,
            },
            menuTimeline: [readMenuSample(snapshotLabel)],
            scrollToCalls: [],
            scrollTopTimeline: [readScrollTopSample(snapshotLabel)],
            selectionTimeline: [readSelectionSample(snapshotLabel)],
          },
      overlayRects,
      preserveAttributes,
      scrollTopTimeline: [
        {
          label: snapshotLabel,
          scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
        },
      ],
      selectionDebug: {
        elementFallbackText: elementFallbackText.replace(/\s+/g, " ").trim().slice(0, 160),
        owner: readSelectionSample(snapshotLabel).owner,
        rootFallbackText: rootFallbackText.replace(/\s+/g, " ").trim().slice(0, 160),
        windowText: windowSelectionText.replace(/\s+/g, " ").trim().slice(0, 160),
      },
      selectionText,
      url: `${window.location.pathname}${window.location.search}`,
    }
  }, label)

export const installPost507InteractionTelemetry = async (page: Page) =>
  page.evaluate(() => {
    type TelemetryWindow = typeof window & {
      __aqPost507InteractionTelemetry?: Post507InteractionTelemetrySnapshot
      __aqPost507InteractionTelemetryCleanup?: () => void
      __aqPost507OriginalScrollTo?: typeof window.scrollTo
    }
    const telemetryWindow = window as TelemetryWindow
    telemetryWindow.__aqPost507InteractionTelemetryCleanup?.()

    const startedAt = performance.now()
    const elapsedMs = () => Math.round(performance.now() - startedAt)
    const limit = 120
    const trim = <T>(items: T[]) => {
      if (items.length > limit) items.splice(0, items.length - limit)
    }
    const telemetry: Post507InteractionTelemetrySnapshot = {
      fallbackTimeline: [],
      menuEverVisible: {
        column: false,
        row: false,
        structure: false,
      },
      menuTimeline: [],
      scrollToCalls: [],
      scrollTopTimeline: [],
      selectionTimeline: [],
    }

    const readFallbackSample = (label: string) => {
      const codeFallbackText =
        document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text")?.trim() ||
        ""
      const tableFallbackText =
        document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ||
        document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text")?.trim() ||
        ""
      return {
        codeFallbackCount: document.querySelectorAll("[data-code-drag-selection-text]").length,
        codeFallbackText: codeFallbackText.slice(0, 160),
        label,
        tableFallbackCount: document.querySelectorAll("[data-table-drag-selection-text]").length,
        tableFallbackText: tableFallbackText.slice(0, 160),
      }
    }
    const isElementVisible = (element: Element) => {
      const className = typeof element.className === "string" ? element.className.toLowerCase() : ""
      const style = (element.getAttribute("style") || "").toLowerCase()
      return (
        element.getAttribute("aria-hidden") !== "true" &&
        element.getAttribute("data-state") !== "closed" &&
        !element.hasAttribute("hidden") &&
        !/\b(hidden|invisible|opacity-0)\b/.test(className) &&
        !/(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/.test(style)
      )
    }
    const countVisibleElements = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).filter(isElementVisible).length
    const readMenuSample = (label: string) => ({
      columnMenuCount: document.querySelectorAll("[data-testid='table-column-menu']").length,
      columnMenuVisibleCount: countVisibleElements("[data-testid='table-column-menu']"),
      label,
      rowMenuCount: document.querySelectorAll("[data-testid='table-row-menu']").length,
      rowMenuVisibleCount: countVisibleElements("[data-testid='table-row-menu']"),
      structureMenuCount: document.querySelectorAll("[data-testid='table-structure-menu'], [data-table-menu-root='true']").length,
      structureMenuVisibleCount: countVisibleElements("[data-testid='table-structure-menu'], [data-table-menu-root='true']"),
    })
    const resolveSelectionOwner = (): Post507InteractionTelemetrySnapshot["selectionTimeline"][number]["owner"] => {
      const selection = window.getSelection()
      const elements = [selection?.anchorNode, selection?.focusNode]
        .map((node) => (node instanceof Element ? node : node?.parentElement ?? null))
        .filter((element): element is Element => Boolean(element))
      if (elements.some((element) => element.closest(".aq-code-shell, .aq-code-editor-content"))) return "code"
      if (elements.some((element) => element.closest("td, th, .tableWrapper"))) return "table"
      if (document.querySelector("[data-testid='keyboard-block-selection-overlay']")) return "block"
      if (selection?.toString().trim()) return "body"
      return "none"
    }
    const readSelectionSample = (label: string) => {
      const text = window.getSelection()?.toString() || ""
      return {
        label,
        owner: resolveSelectionOwner(),
        textLength: text.length,
        textSample: text.replace(/\s+/g, " ").trim().slice(0, 160),
      }
    }
    const readScrollTopSample = (label: string) => ({
      elapsedMs: elapsedMs(),
      label,
      scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
    })
    const recordSnapshot = (label: string) => {
      const menuSample = readMenuSample(label)
      telemetry.menuEverVisible.column ||= menuSample.columnMenuVisibleCount > 0
      telemetry.menuEverVisible.row ||= menuSample.rowMenuVisibleCount > 0
      telemetry.menuEverVisible.structure ||= menuSample.structureMenuVisibleCount > 0
      telemetry.fallbackTimeline.push(readFallbackSample(label))
      telemetry.menuTimeline.push(menuSample)
      telemetry.selectionTimeline.push(readSelectionSample(label))
      trim(telemetry.fallbackTimeline)
      trim(telemetry.menuTimeline)
      trim(telemetry.selectionTimeline)
    }
    const recordScrollTop = (label: string) => {
      telemetry.scrollTopTimeline.push(readScrollTopSample(label))
      trim(telemetry.scrollTopTimeline)
    }

    const originalScrollTo =
      telemetryWindow.__aqPost507OriginalScrollTo ?? (window.scrollTo.bind(window) as typeof window.scrollTo)
    telemetryWindow.__aqPost507OriginalScrollTo = originalScrollTo
    window.scrollTo = ((xOrOptions?: number | ScrollToOptions, y?: number) => {
      const targetX = typeof xOrOptions === "object" ? Number(xOrOptions.left ?? window.scrollX) : Number(xOrOptions ?? window.scrollX)
      const targetY = typeof xOrOptions === "object" ? Number(xOrOptions.top ?? window.scrollY) : Number(y ?? window.scrollY)
      telemetry.scrollToCalls.push({
        elapsedMs: elapsedMs(),
        targetX: Math.round(targetX),
        targetY: Math.round(targetY),
      })
      trim(telemetry.scrollToCalls)
      if (typeof xOrOptions === "object") return originalScrollTo(xOrOptions)
      return originalScrollTo(xOrOptions ?? window.scrollX, y ?? window.scrollY)
    }) as typeof window.scrollTo

    const mutationObserver = new MutationObserver(() => recordSnapshot("mutation"))
    mutationObserver.observe(document.documentElement, {
      attributeFilter: [
        "aria-expanded",
        "class",
        "data-code-drag-selection-text",
        "data-table-drag-selection-text",
        "data-testid",
        "style",
      ],
      attributes: true,
      childList: true,
      subtree: true,
    })
    const handleSelectionChange = () => {
      telemetry.selectionTimeline.push(readSelectionSample("selectionchange"))
      trim(telemetry.selectionTimeline)
    }
    const handleScroll = () => recordScrollTop("scroll")
    document.addEventListener("selectionchange", handleSelectionChange)
    window.addEventListener("scroll", handleScroll, true)
    recordSnapshot("installed")
    recordScrollTop("installed")

    telemetryWindow.__aqPost507InteractionTelemetry = telemetry
    telemetryWindow.__aqPost507InteractionTelemetryCleanup = () => {
      window.scrollTo = originalScrollTo
      mutationObserver.disconnect()
      document.removeEventListener("selectionchange", handleSelectionChange)
      window.removeEventListener("scroll", handleScroll, true)
      delete telemetryWindow.__aqPost507InteractionTelemetryCleanup
    }
  })

export const readPost507InteractionTelemetry = async (page: Page, label = "interaction") =>
  (await readPost507EditorDiagnostics(page, label)).interactionTelemetry

export const clearPost507InteractionTelemetry = async (page: Page) =>
  page.evaluate(() => {
    const telemetryWindow = window as typeof window & {
      __aqPost507InteractionTelemetry?: Post507InteractionTelemetrySnapshot
      __aqPost507InteractionTelemetryCleanup?: () => void
    }
    telemetryWindow.__aqPost507InteractionTelemetryCleanup?.()
    delete telemetryWindow.__aqPost507InteractionTelemetry
  })

export const expectPost507FinalTableTextSelected = (selectionText: string) => {
  const normalizedSelectionText = selectionText.replace(/\s+/g, " ").trim()
  for (const requiredText of POST_507_FINAL_TABLE_REQUIRED_TEXTS) {
    expect(normalizedSelectionText).toContain(requiredText)
  }
  for (const forbiddenText of POST_507_FINAL_TABLE_FORBIDDEN_TEXTS) {
    expect(normalizedSelectionText).not.toContain(forbiddenText)
  }
}

export const post507FinalTableMarkdown = [
  '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
  "| **영역** | **점검 항목** | **확인 기준** |",
  "| --- | --- | --- |",
  "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
  "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
  "| 보안 | HTTPS 사용 | 필수 |",
  "| 저장소 | Refresh 저장 | DB/Redis |",
  "| 만료 | Access 짧게 | 15~60분 |",
  "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
].join("\n")

export const post507Markdown = [
  "## **시작하며**",
  "",
  "백엔드 인증을 처음 배우면 대부분 이런 흐름으로 헷갈립니다.",
  "",
  "- “Stateless가 좋다는데, 왜 좋은 거지?”",
  "- “세션이랑 JWT는 뭐가 다른 거야?”",
  "- “JWT 쓰면 로그인 상태가 유지되는 거야?”",
  "- “Refresh Token은 왜 또 따로 있어?”",
  "",
  "처음에는 이렇게 외우기 쉽습니다.",
  "",
  "> **세션 = 서버 저장토큰 = 클라이언트 저장**",
  "",
  "하지만 이걸로는 절대 이해가 되지 않습니다.",
  "",
  "왜냐하면 중요한건 {{color:#34d399|**\"어디에\" **}}저장하느냐가 아니라",
  "",
  "요청을 처리할 때 {{color:#fb923c|**\"무엇이\"**}} 필요하냐 이기 때문입니다.",
  "",
  "이 글에서는 가장 헷갈리는 지점부터 하나씩 이해해보겠습니다.",
  "",
  "---",
  "",
  "## 왜 이 문제가 중요한가",
  "",
  "보통 처음 인증을 구현한다면 이런 식으로 할 것 입니다",
  "",
  "```text",
  "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
  "```",
  "",
  "이 구조는 아주 직관적이지만 한가지 중요한 질문을 만듭니다.",
  "",
  "> **\"서버는 도대체 어떻게 이 사용자가 로그인한 상태인지 아는걸까?\"**",
  "",
  "이 질문에 대한 답은 간단합니다.",
  "",
  "> 👉 {{color:#fb923c|**서버가 사용자가 로그인한 상태를 기억**}}**하고 있기 때문입니다**",
  "",
  "이게 바로 흔히 말하는 {{color:#fb923c|**\"Stateful\"**}} 입니다.",
  "",
  "그렇다면 만약 {{color:#60a5fa|서버가 사용자의 로그인한 상태를 기억하지 않는다면}}요?",
  "",
  "이게 바로 {{color:#60a5fa|**\"Stateless\"**}} 입니다.",
  "",
  "**Stateless 에서는 서버가 사용자의 로그인한 상태를 기억하지 않습니다.**",
  "",
  "---",
  "",
  "## 핵심 개념 설명",
  "",
  "### 1. Stateful (세션 기반)",
  "",
  "```mermaid",
  "sequenceDiagram",
  "    participant Client",
  "    participant Server",
  "",
  "    Client->>Server: 로그인",
  "    Server-->>Client: Session ID",
  "",
  "    Client->>Server: 요청 + Session ID",
  "    Server->>Server: 세션 조회",
  "    Server-->>Client: 응답",
  "```",
  "",
  "### **핵심 포인트**",
  "",
  "- 서버가 사용자 상태를 기억함",
  "- 요청마다 “이 사용자가 누구인지” 조회 필요",
  "",
  "---",
  "",
  "### **헷갈리는 포인트**",
  "",
  "> “Session ID만 있으면 인증되는 거 아닌가요?”",
  "",
  "맞습니다.",
  "",
  "하지만 중요한 건 이겁니다.",
  "",
  "> **Session ID는 ‘열쇠’일 뿐이고, 실제 정보는 서버에 있다**",
  "",
  "---",
  "",
  "## **2. Stateless (토큰 기반)**",
  "",
  "이제 반대로 생각해봅니다.",
  "",
  "> ❓ “서버가 기억하지 않으려면?”",
  "",
  "👉 답은 하나입니다.",
  "",
  "> **요청 안에 모든 정보를 넣는다**",
  "",
  "---",
  "",
  "### **흐름 (JWT)**",
  "",
  "```mermaid",
  "sequenceDiagram",
  "    participant Client",
  "    participant Server",
  "",
  "    Client->>Server: 로그인",
  "    Server-->>Client: JWT 발급",
  "",
  "    Client->>Server: 요청 + JWT",
  "    Server->>Server: 토큰 검증",
  "    Server-->>Client: 응답",
  "```",
  "",
  "---",
  "",
  "### **핵심 포인트**",
  "",
  "- 서버는 상태를 저장하지 않음",
  "- JWT 안에 사용자 정보 포함",
  "",
  "---",
  "",
  "### **JWT 내부 예시**",
  "",
  "```",
  "{",
  "  \"userId\": 123,",
  "  \"role\": \"USER\",",
  "  \"exp\": 1710000000",
  "}",
  "```",
  "",
  "---",
  "",
  "### **헷갈리는 포인트**",
  "",
  "> “그럼 서버는 DB 안 보고도 인증이 가능한 건가요?”",
  "",
  "👉 맞습니다.",
  "",
  "왜냐하면",
  "",
  "> **토큰 자체가 ‘신분증’ 역할을 하기 때문입니다**",
  "",
  "---",
  "",
  "## **그런데 여기서 문제가 생깁니다**",
  "",
  "JWT 구조를 이해하면 자연스럽게 이런 생각이 듭니다.",
  "",
  "> ❓ “그럼 JWT를 오래 쓰면 로그인 계속 유지되겠네?”",
  "",
  "👉 맞습니다.",
  "",
  "하지만 동시에 **큰 문제**가 생깁니다.",
  "",
  "---",
  "",
  "## **문제 1. 토큰 탈취**",
  "",
  "- 누군가 JWT를 가져가면?",
  "- 그대로 로그인 가능",
  "",
  "👉 서버는 막을 방법이 없음",
  "",
  "---",
  "",
  "## **문제 2. 로그아웃 불가능**",
  "",
  "- 이미 발급된 토큰은 계속 유효",
  "",
  "👉 서버가 기억하지 않기 때문",
  "",
  "---",
  "",
  "## **문제 3. 권한 변경 반영 안 됨**",
  "",
  "- 유저 권한이 바뀌어도",
  "- 토큰은 그대로",
  "",
  "---",
  "",
  "## **그래서 등장한 것이 Refresh Token**",
  "",
  "---",
  "",
  "## **JWT + Refresh Token 구조**",
  "",
  "```mermaid",
  "sequenceDiagram",
  "    participant Client",
  "    participant Server",
  "",
  "    Client->>Server: 로그인",
  "    Server-->>Client: Access + Refresh",
  "",
  "    Client->>Server: API 요청 (Access)",
  "    Server-->>Client: 응답",
  "",
  "    Client->>Server: Access 만료 → Refresh 요청",
  "    Server-->>Client: 새 Access 발급",
  "```",
  "",
  "---",
  "",
  "## **역할 정리**",
  "",
  "<!-- aq-table {\"overflowMode\":\"normal\",\"columnWidths\":[146,139]} -->",
  "| **토큰** | **역할** |",
  "| --- | --- |",
  "| Access Token | API 인증 |",
  "| Refresh Token | Access 재발급 |",
  "",
  "---",
  "",
  "## **왜 둘로 나누는가**",
  "",
  "주니어 입장에서 가장 중요한 포인트입니다.",
  "",
  "### **❌ 하나로 해결하려 하면**",
  "",
  "<!-- aq-table {\"overflowMode\":\"normal\",\"columnWidths\":[125,147]} -->",
  "| **방식** | **문제** |",
  "| --- | --- |",
  "| Access 길게 | 보안 위험 |",
  "| Access 짧게 | 로그인 자주 끊김 |",
  "",
  "- Access Token 은 요청마다 서버로 보내어지기 때문에 탈취위험이 매우 높다",
  "",
  "---",
  "",
  "### **✅ 그래서 이렇게 나눕니다**",
  "",
  "- Access → 짧게 (보안)",
  "- Refresh → 길게 (사용자 경험) Access 토큰이 만료되면 Refresh로 갱신",
  "",
  "---",
  "",
  "## **잘못 이해하기 쉬운 부분**",
  "",
  "### **1. “Refresh Token도 Stateless다” (❌)**",
  "",
  "👉 대부분은 서버에 저장합니다",
  "",
  "**왜?**",
  "",
  "- 탈취 대응",
  "- 로그아웃 처리",
  "",
  "---",
  "",
  "### **2. “JWT 쓰면 서버가 아무것도 안 한다” (❌)**",
  "",
  "👉 실제로는",
  "",
  "- 서명 검증",
  "- 만료 확인",
  "- (경우에 따라) blacklist 체크",
  "",
  "---",
  "",
  "### **3. “토큰에 정보 많이 넣으면 좋다” (❌)**",
  "",
  "👉 변경 반영 안 됨",
  "",
  "---",
  "",
  "## **구현 예시 **",
  "",
  "### **로그인**",
  "",
  "```java",
  "public Token login(User user) {",
  "",
  "    String access = createAccessToken(user);   // 짧게",
  "    String refresh = createRefreshToken(user); // 길게",
  "",
  "    saveRefreshToken(user.getId(), refresh);",
  "",
  "    return new Token(access, refresh);",
  "}",
  "```",
  "",
  "---",
  "",
  "### **재발급**",
  "",
  "```java",
  "public String reissue(String refreshToken) {",
  "",
  "    if (!isValid(refreshToken)) {",
  "        throw new UnauthorizedException();",
  "    }",
  "",
  "    return createAccessToken(getUser(refreshToken));",
  "}",
  "```",
  "",
  "---",
  "",
  "## **이 구조에서 꼭 이해해야 할 포인트**",
  "",
  "- Access → 서버 저장 없음 (Stateless)",
  "- Refresh → 서버 저장 있음 (Stateful)",
  "",
  "👉 완전 Stateless는 아니다",
  "",
  "---",
  "",
  "## **운영에서 가장 먼저 터지는 문제들 (학습 관점)**",
  "",
  "### **1. “로그아웃했는데 왜 계속 요청이 되지?”**",
  "",
  "**원인**",
  "",
  "- Access Token이 아직 살아있음",
  "",
  "**해결 방법**",
  "",
  "- 짧은 TTL",
  "",
  "---",
  "",
  "### **2. “토큰 탈취되면 끝 아닌가요?”**",
  "",
  "👉 맞습니다 (Access 기준)",
  "",
  "**해결 방법**",
  "",
  "- 짧은 TTL",
  "- Refresh 관리",
  "",
  "---",
  "",
  "### **3. “왜 Refresh Token까지 DB에 넣어요?”**",
  "",
  "**이유**",
  "",
  "- 탈취 대응",
  "- 강제 로그아웃",
  "",
  "---",
  "",
  "### **4. “Access 만료되면 요청 계속 실패하는데요?”**",
  "",
  "**이유**",
  "",
  "- 재발급 로직 없음",
  "",
  "**해결 방법**",
  "",
  "- 자동 refresh 요청",
  "",
  "---",
  "",
  "## **운영 체크리스트 (학습용)**",
  "",
  post507FinalTableMarkdown,
  "",
  "---",
  "",
  "## **마치며**",
  "",
  "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다.",
  "",
  "오히려 반대입니다.",
  "",
  "> **“서버가 상태를 덜 들고도 동작하도록 설계를 더 많이 고민하는 구조”**",
  "",
  "세션, JWT, Refresh Token은 각각 다른 기술이 아니라",
  "",
  "> **“상태를 어디에 둘 것인가”에 대한 선택지** 입니다.",
  "",
  "그리고 가장 중요한 한 문장은 이것입니다.",
  "",
  "> **Stateless는 기술이 아니라, 요청을 완결시키는 설계 방식이다**",
  "",
  "---",
  "",
  "## **참고**",
  "",
  "- https://d2.naver.com/helloworld/59361",
  "- https://engineering.linecorp.com/ko/blog/line-login-session-management",
  "- https://auth0.com/docs/tokens",
  "- https://datatracker.ietf.org/doc/html/rfc7519",
].join("\n")

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

export const mockEditorRouteWithPost507 = async (
  page: Page,
  options: { postId: number; title?: string; version?: number }
) => {
  const title = options.title ?? POST_507_TITLE

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(adminMember),
    })
  })
  await page.route(`**/post/api/v1/adm/posts/${options.postId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: options.postId,
        version: options.version ?? 1,
        title,
        content: post507Markdown,
        contentHtml: null,
        published: true,
        listed: true,
      }),
    })
  })

  await page.goto(`/editor/${options.postId}`)

  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  const finalTable = editor.locator("table").last()
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(title)
  await expectEditorToContainLoadedText(editor, POST_507_FINAL_TABLE_TARGET_CELL)
  await expect(finalTable.locator("tr")).toHaveCount(7)
  await expect(finalTable.locator("tr").first().locator("th, td")).toHaveCount(3)

  return { content: post507Markdown, editor, finalTable }
}

export type Post507ModifyRequestSnapshot = {
  content: string
  listed: boolean | null
  method: string
  published: boolean | null
  title: string
  version: number | null
}

export type Post507ModifyRequestCapture = {
  postId: number
  read: () => Post507ModifyRequestSnapshot | null
  readAll: () => Post507ModifyRequestSnapshot[]
}

export const setupPost507ModifyRequestCapture = async (
  page: Page,
  postId: number
): Promise<Post507ModifyRequestCapture> => {
  const snapshots: Post507ModifyRequestSnapshot[] = []

  await page.route(`**/post/api/v1/posts/${postId}**`, async (route) => {
    const request = route.request()
    const corsHeaders = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "content-type,x-aquila-csrf",
      "Access-Control-Allow-Methods": "PUT,OPTIONS",
      "Access-Control-Allow-Origin": request.headers().origin || "*",
    }
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }
    if (request.method() !== "PUT") {
      await route.fallback()
      return
    }

    const rawBody = request.postData() || "{}"
    const body = JSON.parse(rawBody) as {
      content?: unknown
      listed?: unknown
      published?: unknown
      title?: unknown
      version?: unknown
    }
    const snapshot = {
      content: typeof body.content === "string" ? body.content : "",
      listed: typeof body.listed === "boolean" ? body.listed : null,
      method: request.method(),
      published: typeof body.published === "boolean" ? body.published : null,
      title: typeof body.title === "string" ? body.title : "",
      version: typeof body.version === "number" ? body.version : null,
    } satisfies Post507ModifyRequestSnapshot
    snapshots.push(snapshot)

    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "OK",
        data: {
          id: postId,
          version: (snapshot.version ?? 1) + 1,
        },
      }),
    })
  })
  await page.route("**/api/revalidate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        revalidated: true,
        count: 1,
        paths: [`/posts/${postId}`],
      }),
    })
  })

  return {
    postId,
    read: () => snapshots.at(-1) ?? null,
    readAll: () => [...snapshots],
  }
}

export const readPost507ScrollTop = (page: Page) =>
  page.evaluate(() => Math.round(document.scrollingElement?.scrollTop ?? window.scrollY))

export const readPost507SelectionText = (page: Page) =>
  page.evaluate(
    () =>
      window.getSelection()?.toString() ||
      document.documentElement.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
      ""
  )

export const clearPost507SelectionState = (page: Page) =>
  page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.documentElement.removeAttribute("data-table-drag-selection-text")
    document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-table-drag-selection-text")
    })
    document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
      element.removeAttribute("data-code-drag-selection-text")
    })
  })

const cancelPost507ScrollPreserveBeforeProgrammaticScroll = async (page: Page) => {
  await page.mouse.wheel(0, 1)
  await page.waitForTimeout(80)
}

const readPost507CodeGateState = (page: Page) =>
  page.evaluate((requiredTexts) => {
    const codeShells = Array.from(document.querySelectorAll<HTMLElement>(".aq-code-shell"))
    const codeShell =
      codeShells.find((shell) => requiredTexts.every((text) => shell.textContent?.includes(text))) ??
      codeShells.find((shell) => shell.textContent?.includes("createAccessToken")) ??
      codeShells[0] ??
      null
    const visibleText = (codeShell?.innerText || codeShell?.textContent || "").replace(/\s+$/g, "")
    const highlightText = (
      codeShell?.querySelector<HTMLElement>(".aq-code-highlight-layer")?.textContent ||
      codeShell?.querySelector<HTMLElement>("pre > code")?.textContent ||
      ""
    ).replace(/\s+$/g, "")
    const editableText = (
      codeShell?.querySelector<HTMLElement>(".aq-code-editor-content")?.textContent ||
      codeShell?.querySelector<HTMLElement>("pre > code")?.textContent ||
      ""
    ).replace(/\s+$/g, "")
    return {
      editableText,
      emptyShellCount: codeShells.filter((shell) => !(shell.textContent || "").trim()).length,
      highlightText,
      shellCount: codeShells.length,
      visibleText,
    }
  }, [...POST_507_CODE_REQUIRED_TEXTS])

const expectTextSetContainsPost507Code = (value: string, label: string) => {
  for (const requiredText of POST_507_CODE_REQUIRED_TEXTS) {
    expect(value, `${label} should contain ${requiredText}`).toContain(requiredText)
  }
}

export const expectPost507CodeGateSatisfied = async (
  page: Page,
  modifyCapture: Post507ModifyRequestCapture
) => {
  await expect(page.locator(".aq-code-shell").first()).toBeVisible({ timeout: 15_000 })
  const codeState = await expect
    .poll(async () => {
      const nextState = await readPost507CodeGateState(page)
      return {
        ...nextState,
        hasEditableCode: POST_507_CODE_REQUIRED_TEXTS.every((text) => nextState.editableText.includes(text)),
        hasHighlightCode: POST_507_CODE_REQUIRED_TEXTS.every((text) => nextState.highlightText.includes(text)),
        hasVisibleCode: POST_507_CODE_REQUIRED_TEXTS.every((text) => nextState.visibleText.includes(text)),
      }
    }, { timeout: 15_000 })
    .toEqual(
      expect.objectContaining({
        hasEditableCode: true,
        hasHighlightCode: true,
        hasVisibleCode: true,
      })
    )
    .then(() => readPost507CodeGateState(page))
  expect(codeState.shellCount).toBeGreaterThanOrEqual(2)
  expect(codeState.emptyShellCount).toBe(0)
  expectTextSetContainsPost507Code(codeState.visibleText, "visible code shell text")
  expectTextSetContainsPost507Code(codeState.highlightText, "highlight code text")
  expectTextSetContainsPost507Code(codeState.editableText, "editable code text")

  await page.getByRole("button", { name: "수정 반영" }).click()
  await expect(page.getByRole("heading", { name: "수정 설정" })).toBeVisible({ timeout: 5_000 })
  await page.getByRole("button", { name: "변경 반영" }).click()

  await expect
    .poll(() => modifyCapture.read(), { timeout: 5_000 })
    .toEqual(expect.objectContaining({ method: "PUT" }))
  await expect(page.getByRole("heading", { name: "수정 설정" })).toBeHidden({ timeout: 5_000 })
  const captured = modifyCapture.read()
  expect(captured).not.toBeNull()
  if (!captured) return
  expectTextSetContainsPost507Code(captured.content, "pre-save PUT content")
  expect(captured.content).toContain(post507FinalTableMarkdown)
}

const resolvePost507TextDragMetrics = async (
  target: Locator,
  label: string,
  text: string
): Promise<{ endX: number; startX: number; y: number }> =>
  target.evaluate(
    (element, { label, text }) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const startOffset = textNode.data.indexOf(text)
        if (startOffset < 0) continue
        const range = document.createRange()
        range.setStart(textNode, startOffset)
        range.setEnd(textNode, startOffset + text.length)
        const rect =
          Array.from(range.getClientRects()).find((candidate) => candidate.width > 2 && candidate.height > 2) ??
          range.getBoundingClientRect()
        if (rect.width <= 2 || rect.height <= 2) {
          throw new Error(`${label} text rect is too small`)
        }
        return {
          endX: rect.right - 2,
          startX: rect.left + 2,
          y: rect.top + rect.height / 2,
        }
      }
      throw new Error(`${label} text node is missing`)
    },
    { label, text }
  )

export const dragPost507TextRange = async (page: Page, target: Locator, label: string, text: string) => {
  const metrics = await resolvePost507TextDragMetrics(target, label, text)
  const beforeScrollTop = await readPost507ScrollTop(page)
  await page.mouse.move(metrics.startX, metrics.y)
  await page.mouse.down()
  await page.mouse.move(metrics.endX, metrics.y, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  return {
    afterScrollTop: await readPost507ScrollTop(page),
    beforeScrollTop,
    selectionText: await readPost507SelectionText(page),
  }
}

type Post507SelectionArtifactSample = {
  blockGhostCount: number
  blockOverlayCount: number
  dropIndicatorCount: number
  label: string
  selectedCellCount: number
}

const readPost507SelectionArtifactSample = (page: Page, label: string) =>
  page.evaluate((sampleLabel) => {
    const countUnique = (selectors: string[]) => {
      const elements = new Set<Element>()
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((element) => elements.add(element))
      }
      return elements.size
    }
    return {
      blockGhostCount: countUnique(["[data-testid='block-drag-ghost']", "[data-block-drag-ghost='true']"]),
      blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
      dropIndicatorCount: document.querySelectorAll("[data-testid='block-drop-indicator']").length,
      label: sampleLabel,
      selectedCellCount: document.querySelectorAll(".selectedCell").length,
    }
  }, label)

const dragPost507TextRangeWithArtifactSamples = async (
  page: Page,
  target: Locator,
  label: string,
  text: string,
  options: { endPaddingPx?: number } = {}
) => {
  const metrics = await resolvePost507TextDragMetrics(target, label, text)
  const beforeScrollTop = await readPost507ScrollTop(page)
  const artifactSamples: Post507SelectionArtifactSample[] = []
  const sample = async (sampleLabel: string) => {
    artifactSamples.push(await readPost507SelectionArtifactSample(page, `${label}:${sampleLabel}`))
  }

  await page.mouse.move(metrics.startX, metrics.y)
  await sample("before-down")
  await page.mouse.down()
  await sample("after-down")
  for (let step = 1; step <= 18; step += 1) {
    const progress = step / 18
    const targetEndX = metrics.endX + (options.endPaddingPx ?? 0)
    const x = metrics.startX + (targetEndX - metrics.startX) * progress
    await page.mouse.move(x, metrics.y)
    if (step === 1 || step === 6 || step === 12 || step === 18) {
      await sample(`move-${step}`)
    }
  }
  await page.mouse.up()
  await sample("after-up")
  await page.waitForTimeout(900)
  await sample("settled")

  return {
    afterScrollTop: await readPost507ScrollTop(page),
    artifactSamples,
    beforeScrollTop,
    selectionText: await readPost507SelectionText(page),
  }
}

const resolvePost507FinalTableRowMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const metrics = await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
        .filter((candidate) => {
          const text = candidate.textContent ?? ""
          return text.includes(targetCellText) && text.includes("재발급 로직")
        })
        .at(-1)
      const targetCell = Array.from(table?.querySelectorAll<HTMLElement>("td, th") ?? []).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      )
      if (!table || !targetCell) return null
      const tableRect = table.getBoundingClientRect()
      const cellRect = targetCell.getBoundingClientRect()
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        cellRect.width <= 0 ||
        cellRect.height <= 0 ||
        cellRect.bottom <= 8 ||
        cellRect.top >= window.innerHeight - 8
      ) {
        return null
      }
      const clickY = cellRect.top + Math.min(16, Math.max(6, cellRect.height / 2))
      return {
        cellX: cellRect.left + Math.min(36, Math.max(8, cellRect.width / 3)),
        cellY: clickY,
        hoverX: tableRect.left + 4,
        hoverY: clickY,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(100)
  }
  throw new Error("post 507 final table row metrics are missing")
}

const resolvePost507FinalTableColumnMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const metrics = await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
        .filter((candidate) => {
          const text = candidate.textContent ?? ""
          return text.includes(targetCellText) && text.includes("재발급 로직")
        })
        .at(-1)
      if (!table) return null
      const tableRect = table.getBoundingClientRect()
      const headerCells = Array.from(table.querySelectorAll<HTMLElement>("thead th, tr:first-child th, tr:first-child td"))
      const headerCell =
        headerCells.find((candidate) => candidate.textContent?.includes("점검 항목")) ?? headerCells[1] ?? headerCells[0]
      if (!headerCell) return null
      const headerRect = headerCell.getBoundingClientRect()
      if (headerRect.bottom <= 8 || headerRect.top >= window.innerHeight - 8) {
        headerCell.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        })
        return null
      }
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        headerRect.width <= 0 ||
        headerRect.height <= 0
      ) {
        return null
      }
      const clampYToViewport = (value: number) => Math.min(Math.max(value, 12), window.innerHeight - 12)
      return {
        cellX: headerRect.left + Math.min(40, Math.max(8, headerRect.width / 2)),
        cellY: clampYToViewport(headerRect.top + Math.min(16, Math.max(6, headerRect.height / 2))),
        hoverX: headerRect.left + headerRect.width / 2,
        hoverY: clampYToViewport(tableRect.top + 6),
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(100)
  }
  throw new Error("post 507 final table column metrics are missing")
}

export const clickPost507AxisHandle = async (
  page: Page,
  axis: "column" | "row",
  expectedSelectedCellCount: number
) => {
  const handleSelector = `[data-table-affordance='${axis === "row" ? "row-handle" : "column-handle"}']`
  const outlineTestId = axis === "row" ? "table-row-selection-outline" : "table-column-selection-outline"
  const menuTestId = axis === "row" ? "table-row-menu" : "table-column-menu"
  let lastDebug: unknown = null
  const resolveViewportHandlePoint = () =>
    page.locator(handleSelector).evaluateAll((handles) => {
      const candidates = handles
        .map((handle) => {
          const rect = handle.getBoundingClientRect()
          const style = window.getComputedStyle(handle)
          return {
            active: handle.getAttribute("data-active") === "true",
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 4 &&
              rect.left < window.innerWidth - 4 &&
              rect.bottom > 4 &&
              rect.top < window.innerHeight - 4 &&
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              Number(style.opacity || "1") > 0,
          }
        })
        .filter((candidate) => candidate.visible)
      return candidates.find((candidate) => candidate.active) ?? candidates[0] ?? null
    })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const metrics =
      axis === "row" ? await resolvePost507FinalTableRowMetrics(page) : await resolvePost507FinalTableColumnMetrics(page)
    await page.mouse.move(metrics.cellX, metrics.cellY)
    await page.mouse.move(metrics.hoverX, metrics.hoverY, { steps: 4 })
    await page.waitForTimeout(160)
    const handlePoint = await resolveViewportHandlePoint()
    if (!handlePoint) {
      lastDebug = await readPost507EditorDiagnostics(page, `${axis}-axis-handle-missing`)
      continue
    }
    await page.mouse.click(handlePoint.x, handlePoint.y)
    const selected = await expect
      .poll(
        async () => ({
          menuVisible: await page.getByTestId(menuTestId).isVisible().catch(() => false),
          outlineVisible: await page.getByTestId(outlineTestId).isVisible().catch(() => false),
          selectedCellCount: await page.getByTestId("block-editor-prosemirror").locator(".selectedCell").count(),
          selectionText: (await readPost507SelectionText(page)).trim(),
        }),
        { timeout: 900 }
      )
      .toEqual({
        menuVisible: true,
        outlineVisible: true,
        selectedCellCount: expectedSelectedCellCount,
        selectionText: "",
      })
      .then(() => true)
      .catch(async () => {
        lastDebug = await readPost507EditorDiagnostics(page, `${axis}-axis-not-selected`)
        return false
      })
    if (selected) return
  }
  throw new Error(`post 507 ${axis} axis selection did not settle: ${JSON.stringify(lastDebug)}`)
}

export const expectPost507AxisSelectionNoVisibleNativeTextChurn = async (
  page: Page,
  axis: "column" | "row",
  expectedSelectedCellCount: number,
  label: string
) => {
  const outlineTestId = axis === "row" ? "table-row-selection-outline" : "table-column-selection-outline"
  const menuTestId = axis === "row" ? "table-row-menu" : "table-column-menu"
  const samples: Array<{
    fallbackText: string
    menuVisible: boolean
    outlineVisible: boolean
    selectedCellCount: number
    selectedCellNativeSelectionHidden: boolean
    selectionInsideSelectedCells: boolean
    selectionText: string
  }> = []

  for (let index = 0; index < 8; index += 1) {
    samples.push(
      await page.evaluate(
        ({ menuTestId, outlineTestId }) => {
          const isVisible = (element: Element | null) => {
            if (!element) return false
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || "1") > 0
            )
          }
          const fallbackText =
            document.documentElement.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            ""
          const selection = window.getSelection()
          const elementFromNode = (node: Node | null) =>
            node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement ?? null
          let selectionInsideSelectedCells = true
          if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
              const range = selection.getRangeAt(rangeIndex)
              const startCell = elementFromNode(range.startContainer)?.closest(".selectedCell")
              const endCell = elementFromNode(range.endContainer)?.closest(".selectedCell")
              if (!startCell || !endCell) {
                selectionInsideSelectedCells = false
                break
              }
            }
          }
          const selectedCell = document.querySelector<HTMLElement>(".selectedCell")
          const selectedTextElement =
            selectedCell?.querySelector<HTMLElement>("p, span, strong, em, code, div") ?? selectedCell
          const selectionStyle = selectedTextElement ? window.getComputedStyle(selectedTextElement, "::selection") : null
          const selectionBackground = selectionStyle?.backgroundColor || ""

          return {
            fallbackText: fallbackText.replace(/\s+/g, " ").trim(),
            menuVisible: isVisible(document.querySelector(`[data-testid='${menuTestId}']`)),
            outlineVisible: isVisible(document.querySelector(`[data-testid='${outlineTestId}']`)),
            selectedCellCount: document.querySelectorAll(".selectedCell").length,
            selectedCellNativeSelectionHidden:
              selectionBackground === "rgba(0, 0, 0, 0)" || selectionBackground === "transparent",
            selectionInsideSelectedCells,
            selectionText: (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim(),
          }
        },
        { menuTestId, outlineTestId }
      )
    )
    await page.waitForTimeout(90)
  }

  expect(
    samples,
    `${label} should keep structural axis selection without visible native text selection churn`
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fallbackText: "",
        menuVisible: true,
        outlineVisible: true,
        selectedCellCount: expectedSelectedCellCount,
        selectedCellNativeSelectionHidden: true,
        selectionInsideSelectedCells: true,
      }),
    ])
  )
  expect(
    samples.every(
      (sample) =>
        sample.fallbackText === "" &&
        sample.menuVisible &&
        sample.outlineVisible &&
        sample.selectedCellCount === expectedSelectedCellCount &&
        sample.selectedCellNativeSelectionHidden &&
        sample.selectionInsideSelectedCells &&
        !POST_507_FINAL_TABLE_FORBIDDEN_TEXTS.some((forbiddenText) => sample.selectionText.includes(forbiddenText))
    ),
    `${label} axis samples: ${JSON.stringify(samples)}`
  ).toBe(true)
}

export const scrollPost507FinalTableTargetIntoView = async (page: Page) => {
  await expect
    .poll(
      () =>
        page.evaluate((targetCellText) => {
          const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
          const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
            .filter((candidate) => {
              const text = candidate.textContent ?? ""
              return text.includes(targetCellText) && text.includes("재발급 로직")
            })
            .at(-1)
          const targetCell = Array.from(table?.querySelectorAll<HTMLElement>("td, th") ?? []).find((candidate) =>
            candidate.textContent?.includes(targetCellText)
          )
          targetCell?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
          const rect = targetCell?.getBoundingClientRect()
          return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top >= 8 && rect.bottom <= window.innerHeight - 8)
        }, POST_507_FINAL_TABLE_TARGET_CELL),
      { timeout: 5_000 }
    )
    .toBe(true)
}

export const expectPost507WheelScrollsWithoutLock = async (page: Page, label: string) => {
  const beforeState = await page.evaluate(() => ({
    scrollHeight: Math.round(document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight),
    scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
    viewportHeight: Math.round(window.innerHeight),
  }))
  const viewport = page.viewportSize() ?? { height: 760, width: 1280 }
  await page.mouse.move(Math.max(32, Math.round(viewport.width / 2)), Math.max(32, viewport.height - 120))
  const samples: Array<{ beforeAttempt: number; delta: number; scrollTop: number }> = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const attemptState = await page.evaluate(() => ({
      scrollHeight: Math.round(document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight),
      scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
      viewportHeight: Math.round(window.innerHeight),
    }))
    const maxScrollTop = Math.max(0, attemptState.scrollHeight - attemptState.viewportHeight)
    const delta =
      attemptState.scrollTop >= maxScrollTop - 32 ? -420 : attemptState.scrollTop <= 32 ? 420 : attempt % 2 === 0 ? 420 : -420
    const beforeAttempt = attemptState.scrollTop
    await page.mouse.wheel(0, delta)
    await page.waitForTimeout(360)
    const afterAttempt = await readPost507ScrollTop(page)
    samples.push({ beforeAttempt, delta, scrollTop: afterAttempt })
    if (Math.abs(afterAttempt - beforeAttempt) > 80) return
    await page.waitForTimeout(140)
  }
  throw new Error(
    `${label} wheel did not move page scroll: ${JSON.stringify({
      beforeState,
      diagnostics: await readPost507EditorDiagnostics(page, `${label}-wheel-locked`),
      samples,
    })}`
  )
}

const expectPost507LowerBodyBlockDragStarts = async (page: Page, editor: Locator) => {
  const lowerBody = editor
    .locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." })
    .last()
  await lowerBody.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
  })
  let lowerBodyVisible = false
  let lowerBodyVisibilitySnapshot: unknown = null
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await lowerBody.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    })
    await page.waitForTimeout(120)
    const box = await lowerBody.boundingBox()
    const viewport = page.viewportSize() ?? { height: 760, width: 1280 }
    lowerBodyVisible = Boolean(box && box.y + box.height > 120 && box.y < viewport.height - 120)
    lowerBodyVisibilitySnapshot = { attempt, box, viewport }
    if (lowerBodyVisible) break
  }
  if (!lowerBodyVisible) {
    throw new Error(
      `post 507 lower body did not enter viewport: ${JSON.stringify({
        diagnostics: await readPost507EditorDiagnostics(page, "lower-body-scroll-into-view"),
        lowerBodyCount: await lowerBody.count(),
        snapshot: lowerBodyVisibilitySnapshot,
      })}`
    )
  }
  const bodyBox = await lowerBody.boundingBox()
  if (!bodyBox) throw new Error("post 507 lower body block metrics are missing")
  const handle = page.getByTestId("block-drag-handle")
  await expect
    .poll(
      async () => {
        const currentBox = await lowerBody.boundingBox()
        if (!currentBox) return false
        await page.mouse.move(currentBox.x + currentBox.width / 2, currentBox.y + Math.min(18, currentBox.height / 2))
        await page.mouse.move(currentBox.x + 24, currentBox.y + Math.min(18, currentBox.height / 2))
        await page.waitForTimeout(80)
        return (await handle.count()) > 0 && Boolean(await handle.boundingBox())
      },
      { timeout: 5_000 }
    )
    .toBe(true)
  const handleBox = await handle.boundingBox()
  if (!handleBox) {
    throw new Error(
      `post 507 lower body block handle metrics are missing: ${JSON.stringify({
        bodyBox,
        diagnostics: await readPost507EditorDiagnostics(page, "lower-body-block-handle-missing"),
      })}`
    )
  }
  const beforeScrollTop = await readPost507ScrollTop(page)
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 96, { steps: 8 })
  await expect(page.getByTestId("block-drag-ghost")).toBeVisible({ timeout: 2_000 })
  await page.mouse.up()
  await page.waitForTimeout(260)
  await expect(page.getByTestId("block-drag-ghost")).toHaveCount(0)
  await expect(editor.locator(".selectedCell")).toHaveCount(0)
  const afterScrollTop = await readPost507ScrollTop(page)
  const scrollDelta = afterScrollTop - beforeScrollTop
  if (Math.abs(scrollDelta) > 48) {
    throw new Error(
      `lower body block drag should not rollback scroll: ${JSON.stringify({
        afterScrollTop,
        beforeScrollTop,
        bodyAfterBox: await lowerBody.boundingBox().catch(() => null),
        bodyBeforeBox: bodyBox,
        diagnostics: await readPost507EditorDiagnostics(page, "lower-body-block-drag-scroll-jump"),
        scrollDelta,
      })}`
    )
  }
}

const expectPost507CodeBlockSelectAllInsideWorkflow = async (page: Page, editor: Locator) => {
  const codeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(user)" }).first()
  await expect(codeContent).toBeVisible({ timeout: 15_000 })
  let codeInViewport = false
  for (let attempt = 0; attempt < 56; attempt += 1) {
    const codeViewportState = await codeContent.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const viewportTop = 96
      const viewportBottom = window.innerHeight - 120
      return {
        bottom: rect.bottom,
        inViewport: rect.width > 0 && rect.height > 0 && rect.top >= viewportTop && rect.top <= viewportBottom,
        viewportBottom,
        viewportTop,
        top: rect.top,
      }
    })
    codeInViewport = codeViewportState.inViewport
    if (codeInViewport) break
    const deltaY = codeViewportState.top < codeViewportState.viewportTop ? -360 : 360
    await page.mouse.wheel(0, deltaY)
    await page.waitForTimeout(90)
  }
  if (!codeInViewport) {
    throw new Error(
      `post 507 lower workflow could not wheel back to code block: ${JSON.stringify({
        diagnostics: await readPost507EditorDiagnostics(page, "code-select-all-scroll-from-table"),
      })}`
    )
  }
  const codeBox = await codeContent.boundingBox()
  if (!codeBox) throw new Error("post 507 lower workflow code block metrics are missing")

  await page.mouse.click(codeBox.x + Math.min(180, codeBox.width / 2), codeBox.y + Math.min(28, codeBox.height / 3))
  await page.keyboard.press(SELECT_ALL_SHORTCUT)

  const readCodeSelectionState = () =>
    codeContent.evaluate((element, requiredTexts) => {
      const shell = element.closest<HTMLElement>(".aq-code-shell")
      const nativeSelection = window.getSelection()?.toString() ?? ""
      const fallbackSelection = shell?.getAttribute("data-code-drag-selection-text") ?? ""
      const selectionText = (nativeSelection || fallbackSelection).replace(/\s+/g, " ").trim()
      const rect = element.getBoundingClientRect()
      const pointElement = document.elementFromPoint(rect.left + Math.min(180, rect.width / 2), rect.top + Math.min(28, rect.height / 3))
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return {
        activeClass: String(activeElement?.className ?? ""),
        activeTag: activeElement?.tagName ?? "",
        blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
        codeRect: { bottom: rect.bottom, left: rect.left, top: rect.top },
        hasAllCodeText: requiredTexts.every((text) => selectionText.includes(text)),
        hasFinalTableText: selectionText.includes("Stateless 의미") || selectionText.includes("구현되어 있는가"),
        pointClass: String((pointElement as HTMLElement | null)?.className ?? ""),
        pointTag: pointElement?.tagName ?? "",
        selectedCellCount: document.querySelectorAll(".selectedCell").length,
        tableDragAttr: document.documentElement.getAttribute("data-table-drag-selection-text") ?? "",
        tableDragElementCount: document.querySelectorAll("[data-table-drag-selection-text]").length,
        selectionText,
      }
    }, [...POST_507_CODE_REQUIRED_TEXTS])
  try {
    await expect
      .poll(
        async () => {
          const state = await readCodeSelectionState()
          return {
            blockOverlayCount: state.blockOverlayCount,
            hasAllCodeText: state.hasAllCodeText,
            hasFinalTableText: state.hasFinalTableText,
            selectedCellCount: state.selectedCellCount,
          }
        },
        { timeout: 2_000 }
      )
      .toEqual({
        blockOverlayCount: 0,
        hasAllCodeText: true,
        hasFinalTableText: false,
        selectedCellCount: 0,
      })
  } catch (error) {
    throw new Error(
      `post 507 code Cmd/Ctrl+A kept stale table selection: ${JSON.stringify({
        diagnostics: await readPost507EditorDiagnostics(page, "code-select-all-stale-table-selection"),
        error: error instanceof Error ? error.message : String(error),
        state: await readCodeSelectionState(),
      })}`
    )
  }
}

const expectPost507LowerBodyTextSelectionAfterTableAxes = async (page: Page, editor: Locator) => {
  const lowerBody = editor
    .locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." })
    .last()
  await expect(lowerBody).toBeVisible({ timeout: 5_000 })
  const bodyDrag = await dragPost507TextRange(
    page,
    lowerBody,
    "post 507 lower body text selection after table axes",
    "서버가 아무것도 안 하는 구조"
  )
  if (!bodyDrag.selectionText.includes("서버가 아무것도 안 하는 구조")) {
    throw new Error(
      `post 507 lower body text selection lost after table axes: ${JSON.stringify({
        bodyDrag,
        diagnostics: await readPost507EditorDiagnostics(page, "lower-body-text-after-table-axes"),
      })}`
    )
  }
  expect(Math.abs(bodyDrag.afterScrollTop - bodyDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
  await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible({ timeout: 2_000 })
  await expect(editor.locator(".selectedCell")).toHaveCount(0)
  await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
}

export const expectPost507FinalReferenceTextSelectionStable = async (page: Page, editor: Locator) => {
  const finalReference = editor.locator("li", { hasText: POST_507_FINAL_REFERENCE_TEXT }).last()
  await expect(finalReference).toBeVisible({ timeout: 5_000 })
  await cancelPost507ScrollPreserveBeforeProgrammaticScroll(page)
  const referenceDrag = await dragPost507TextRangeWithArtifactSamples(
    page,
    finalReference,
    "post 507 final reference text selection",
    POST_507_FINAL_REFERENCE_TEXT,
    { endPaddingPx: 24 }
  )
  const diagnostics = await readPost507EditorDiagnostics(page, "final-reference-text-selection")
  const artifactLeaks = referenceDrag.artifactSamples.filter(
    (sample) =>
      sample.blockGhostCount > 0 ||
      sample.blockOverlayCount > 0 ||
      sample.dropIndicatorCount > 0 ||
      sample.selectedCellCount > 0
  )
  const fallbackTail = diagnostics.interactionTelemetry.fallbackTimeline.slice(-8).filter(
    (sample) =>
      sample.codeFallbackCount > 0 ||
      sample.tableFallbackCount > 0 ||
      Boolean(sample.codeFallbackText.trim()) ||
      Boolean(sample.tableFallbackText.trim())
  )
  const ownerState = await page.evaluate((targetText) => {
    const readOwnLabel = (item: HTMLElement) =>
      Array.from(item.childNodes)
        .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
        .map((node) => node.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    const targetItem =
      Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")).find(
        (item) => readOwnLabel(item) === targetText
      ) ?? null
    const selection = window.getSelection()
    const anchorElement =
      selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
    const focusElement =
      selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
    return {
      anchorInTarget: Boolean(targetItem && anchorElement && targetItem.contains(anchorElement)),
      focusInTarget: Boolean(targetItem && focusElement && targetItem.contains(focusElement)),
      selectionText: selection?.toString().replace(/\s+/g, " ").trim() ?? "",
      targetFound: Boolean(targetItem),
    }
  }, POST_507_FINAL_REFERENCE_TEXT)

  if (!referenceDrag.selectionText.includes("rfc7519")) {
    throw new Error(
      `post 507 final reference text selection lost: ${JSON.stringify({
        diagnostics,
        ownerState,
        referenceDrag,
      })}`
    )
  }
  if (!ownerState.targetFound || !ownerState.anchorInTarget || !ownerState.focusInTarget) {
    throw new Error(
      `post 507 final reference caret owner escaped target item: ${JSON.stringify({
        diagnostics,
        ownerState,
        referenceDrag,
      })}`
    )
  }
  expect(Math.abs(referenceDrag.afterScrollTop - referenceDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
  expect(artifactLeaks, "final reference text drag should not show block/table artifacts").toEqual([])
  expect(fallbackTail, "final reference text drag should leave no table/code fallback markers").toEqual([])
  expect(diagnostics.domSnapshot.dropIndicatorCount).toBe(0)
  expect(diagnostics.domSnapshot.blockGhostCount).toBe(0)
  expect(diagnostics.domSnapshot.blockOverlayCount).toBe(0)
  expect(diagnostics.domSnapshot.selectedCellCount).toBe(0)
  expect(diagnostics.selectionDebug.owner).toBe("body")
}

export const runPost507LowerRealWorkflowGate = async (
  page: Page,
  {
    editor,
    finalTable,
  }: {
    editor: Locator
    finalTable: Locator
  }
) => {
  await expect(finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()).toBeVisible()
  const resolveCurrentFinalTable = () =>
    editor
      .locator("table")
      .filter({ hasText: POST_507_FINAL_TABLE_TARGET_CELL })
      .filter({ hasText: "재발급 로직" })
      .last()

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await clearPost507SelectionState(page)
    const currentFinalTable = resolveCurrentFinalTable()
    await expect(currentFinalTable).toBeVisible({ timeout: 5_000 })
    await scrollPost507FinalTableTargetIntoView(page)
    await page.waitForTimeout(120)
    const targetCell = currentFinalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    const tableDrag = await dragPost507TextRange(
      page,
      targetCell,
      `post 507 final table text drag cycle ${cycle}`,
      POST_507_FINAL_TABLE_TARGET_CELL
    )
    if (!tableDrag.selectionText.includes(POST_507_FINAL_TABLE_TARGET_CELL)) {
      throw new Error(
        `post 507 final table text drag lost selection: ${JSON.stringify({
          diagnostics: await readPost507EditorDiagnostics(page, `table-text-drag-cycle-${cycle}`),
          tableDrag,
        })}`
      )
    }
    expect(Math.abs(tableDrag.afterScrollTop - tableDrag.beforeScrollTop)).toBeLessThanOrEqual(24)

    await expectPost507CodeBlockSelectAllInsideWorkflow(page, editor)
    await page.mouse.wheel(0, 720)
    await page.waitForTimeout(180)
    await scrollPost507FinalTableTargetIntoView(page)
    await page.waitForTimeout(120)

    await clickPost507AxisHandle(page, "row", 3)
    await expectPost507AxisSelectionNoVisibleNativeTextChurn(page, "row", 3, `post 507 row axis cycle ${cycle}`)
    await expectPost507WheelScrollsWithoutLock(page, `row axis cycle ${cycle}`)

    await page.keyboard.press("Escape")
    await clearPost507SelectionState(page)
    await scrollPost507FinalTableTargetIntoView(page)
    await page.waitForTimeout(120)
    await clickPost507AxisHandle(page, "column", 7)
    await expectPost507AxisSelectionNoVisibleNativeTextChurn(page, "column", 7, `post 507 column axis cycle ${cycle}`)
    await expectPost507WheelScrollsWithoutLock(page, `column axis cycle ${cycle}`)
    await page.keyboard.press("Escape")
  }

  await page.waitForTimeout(1_300)
  await expectPost507LowerBodyTextSelectionAfterTableAxes(page, editor)
  await expectPost507LowerBodyBlockDragStarts(page, editor)
}

const countMenuReopenTransitions = (menuCounts: number[]) => {
  let sawCloseAfterOpen = false
  let reopenCount = 0
  for (let index = 0; index < menuCounts.length; index += 1) {
    const count = menuCounts[index] ?? 0
    const previousCount = index > 0 ? menuCounts[index - 1] ?? 0 : 0
    if (previousCount > 0 && count === 0) sawCloseAfterOpen = true
    if (sawCloseAfterOpen && previousCount === 0 && count > 0) reopenCount += 1
  }
  return reopenCount
}

export const expectPost507LowerGateTelemetryStable = async (page: Page, label: string) => {
  const diagnostics = await readPost507EditorDiagnostics(page, label)
  const telemetry = diagnostics.interactionTelemetry
  const rowMenuCounts = telemetry.menuTimeline.map((sample) => sample.rowMenuVisibleCount)
  const columnMenuCounts = telemetry.menuTimeline.map((sample) => sample.columnMenuVisibleCount)
  const fallbackTail = telemetry.fallbackTimeline.slice(-8).filter(
    (sample) =>
      sample.codeFallbackCount > 0 ||
      sample.tableFallbackCount > 0 ||
      Boolean(sample.codeFallbackText.trim()) ||
      Boolean(sample.tableFallbackText.trim())
  )

  expect(telemetry.menuEverVisible.row || rowMenuCounts.some((count) => count > 0), `${label} should open a row axis menu`).toBe(true)
  expect(
    telemetry.menuEverVisible.column || columnMenuCounts.some((count) => count > 0),
    `${label} should open a column axis menu`
  ).toBe(true)
  expect(countMenuReopenTransitions(rowMenuCounts), `${label} row menu should not flicker closed/reopened`).toBe(0)
  expect(countMenuReopenTransitions(columnMenuCounts), `${label} column menu should not flicker closed/reopened`).toBe(0)
  expect(fallbackTail, `${label} should leave no trailing table/code fallback selection markers`).toEqual([])
  expect(diagnostics.domSnapshot.selectedCellCount, `${label} should finish without sticky structural cells`).toBe(0)
  expect(diagnostics.domSnapshot.blockOverlayCount, `${label} should finish without sticky block selection overlay`).toBe(0)
  expect(diagnostics.focusedElement === null || typeof diagnostics.focusedElement === "string").toBe(true)
}
