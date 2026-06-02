import { expect, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./editorAuthoringFlow"

export const POST_507_TITLE = "Stateless란 무엇인가?"
export const POST_507_FINAL_TABLE_TARGET_CELL = "Stateless 의미"
export const POST_507_FINAL_TABLE_END_CELL = "구현되어 있는가"
export const POST_507_FINAL_TABLE_HEADER_CELL = "영역"
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
      requiredSourceFragments: ["mockEditorRouteWithPost507", "userId", "코드 언어 선택"],
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
  ],
} as const

export type Post507EditorDiagnosticSnapshot = {
  activeElement: string | null
  activePreserveOwner: string | null
  domSnapshot: {
    blockOverlayCount: number
    codeBlockCount: number
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
  scrollToCalls: Array<{ elapsedMs: number; targetX: number; targetY: number }>
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
      "[data-testid='block-drag-drop-indicator']",
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
    const selectionText =
      window.getSelection()?.toString() ||
      document.documentElement.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
      ""
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
        codeBlockCount: document.querySelectorAll("[data-code-block-wrapper='true'], .aq-code-shell").length,
        editorTextSample: (editor?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        selectedCellCount: document.querySelectorAll(".selectedCell").length,
        tableCount: document.querySelectorAll("table").length,
      },
      focusedElement: describeElement(document.querySelector(":focus")),
      interactionTelemetry: recordedTelemetry
        ? {
            fallbackTimeline: recordedTelemetry.fallbackTimeline.slice(-120),
            menuTimeline: recordedTelemetry.menuTimeline.slice(-120),
            scrollToCalls: recordedTelemetry.scrollToCalls.slice(-120),
            scrollTopTimeline: recordedTelemetry.scrollTopTimeline.slice(-120),
            selectionTimeline: recordedTelemetry.selectionTimeline.slice(-120),
          }
        : {
            fallbackTimeline: [readFallbackSample(snapshotLabel)],
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
      telemetry.fallbackTimeline.push(readFallbackSample(label))
      telemetry.menuTimeline.push(readMenuSample(label))
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
      telemetry.scrollToCalls.push({ elapsedMs: elapsedMs(), targetX: Math.round(targetX), targetY: Math.round(targetY) })
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
