import CodeBlock from "@tiptap/extension-code-block"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { NodeViewContent, type NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react"
import {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { extractPlainTextFromHtml } from "src/libs/markdown/htmlToMarkdown"
import { highlightCodeToHtml, renderImmediateCodeToHtml } from "src/libs/markdown/prismRuntime"
import {
  CodeBlockEditorHeader,
  CodeBlockEditorSurface,
  CodeBlockEditorWrapper,
  CodeWindowDots,
} from "./codeBlockNodeViewStyles"
import { CodeLanguageControl } from "./CodeLanguageControl"
import {
  filterCodeLanguageOptions,
  hasExactCodeLanguageSearchMatch,
  normalizeCodeLanguage,
  rememberPreferredCodeLanguage,
} from "./codeBlockNodeViewLanguageModel"
import {
  isPrimarySelectAllShortcut,
  preventInternalCodeDrop,
  preventNativeCodeDragStart,
  resolveCodeBlockPasteRange,
  resolveCodeBlockCopyText,
  resolveVisibleCodeRootForSelectAll,
  selectCodeBlockText,
  selectCodeDomTextContents,
  selectDomTextContents,
  selectDomTextOffsetRange,
} from "./codeBlockNodeViewSelectionModel"
import { focusElementWithoutScroll } from "./blockEditorEngineDocumentModel"
import {
  markNextEditorPointerAfterCodeSelection,
  preserveWindowScrollForRichBlockSelectAll,
  preserveWindowScrollPositionAcrossFrames,
  type WindowScrollAnchor,
} from "./blockHandleLayoutModel"
export { getPreferredCodeLanguage, normalizeCodeLanguage } from "./codeBlockNodeViewLanguageModel"
export { CodeBlockEditorStyles } from "./codeBlockNodeViewStyles"
let codeDomTextRangePreserveGeneration = 0
let lastActiveCodeSelectionText = ""
let lastActiveCodeSelectionAt = 0
let lastCodePointerClientX = 0
let lastCodePointerClientY = 0
let lastCodePointerAt = 0
let lastCodePointerScrollAnchor: WindowScrollAnchor | null = null
let lastCodePointerScrollAnchorAt = 0
let activeCodeSelectionOwnerRoot: HTMLElement | null = null
let lastCodeDragSelectionCompletedAt = 0
let lastCodeDragSelectionCompletedX = 0
let lastCodeDragSelectionCompletedY = 0
const CODE_SCROLL_PRESERVE_MIN_MS = 4_800
const CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200
const CODE_SELECT_ALL_ACTIVE_GRACE_MS = 4_000
const shouldCancelCodeScrollPreserve =
  (scrollAnchor: WindowScrollAnchor) => () =>
    Math.abs(window.scrollX - scrollAnchor.x) >
      CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX ||
    Math.abs(
      (document.scrollingElement?.scrollTop ?? window.scrollY) - scrollAnchor.y
    ) > CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX
const rememberCodePointerScrollAnchor = (scrollAnchor: WindowScrollAnchor) => {
  lastCodePointerScrollAnchor = scrollAnchor
  lastCodePointerScrollAnchorAt =
    typeof performance !== "undefined" ? performance.now() : Date.now()
}
const resolveRecentCodePointerScrollAnchor = () => {
  if (!lastCodePointerScrollAnchor) return null
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now()
  return now - lastCodePointerScrollAnchorAt <= CODE_SELECT_ALL_ACTIVE_GRACE_MS
    ? lastCodePointerScrollAnchor
    : null
}
const isSyntheticClickAfterCodeDragRelease = (
  clientX: number,
  clientY: number
) => {
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now()
  const completedAt = lastCodeDragSelectionCompletedAt
  const matches =
    now - completedAt < 600 &&
    Math.hypot(
      clientX - lastCodeDragSelectionCompletedX,
      clientY - lastCodeDragSelectionCompletedY
    ) <= 8
  if (matches) {
    window.setTimeout(() => {
      if (lastCodeDragSelectionCompletedAt === completedAt) {
        lastCodeDragSelectionCompletedAt = 0
      }
    }, 0)
  }
  return matches
}
const preserveCodeScrollAcrossFrames = (
  scrollAnchor: WindowScrollAnchor,
  replaceActivePreserve = false
) => {
  preserveWindowScrollPositionAcrossFrames(
    scrollAnchor,
    240,
    4,
    CODE_SCROLL_PRESERVE_MIN_MS,
    false,
    false,
    true,
    false,
    false,
    shouldCancelCodeScrollPreserve(scrollAnchor),
    replaceActivePreserve
  )
}
type CodeDragSelectionSession = {
  active: boolean
  anchorPos: number
  lastHeadPos?: number
  scrollAnchor: { x: number; y: number }
  startX: number
  startY: number
}
export const CodeBlockView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const codeDragSelectionRef = useRef<CodeDragSelectionSession | null>(null)
  const isActiveCodeBlockRef = useRef(false)
  const lastCodePointerContentRootRef = useRef<HTMLElement | null>(null)
  const [draftLanguage, setDraftLanguage] = useState(normalizeCodeLanguage(String(node.attrs?.language || "")))
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState("")
  const nodeCodeSource = node.textContent || ""
  const nodeCodeSourceRef = useRef(nodeCodeSource)
  const [liveCodeSource, setLiveCodeSource] = useState(nodeCodeSource)
  const [highlightedCodeHtml, setHighlightedCodeHtml] = useState(() => renderImmediateCodeToHtml({
    source: nodeCodeSource,
    language: normalizeCodeLanguage(String(node.attrs?.language || "")),
  }).html)
  const rememberActiveCodeContentRoot = useCallback(() => {
    const contentRoot =
      shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
    isActiveCodeBlockRef.current = contentRoot?.isConnected ?? false
    lastCodePointerContentRootRef.current = contentRoot?.isConnected ? contentRoot : null
    activeCodeSelectionOwnerRoot = contentRoot?.isConnected ? contentRoot : activeCodeSelectionOwnerRoot
    const shell = shellRef.current
    const highlightText = shell?.querySelector<HTMLElement>(".aq-code-highlight-layer")?.textContent || ""
    const activeText = contentRoot?.textContent || nodeCodeSourceRef.current || highlightText || ""
    if (activeText.trim()) {
      lastActiveCodeSelectionText = activeText
      lastActiveCodeSelectionAt = typeof performance !== "undefined" ? performance.now() : Date.now()
    }
    return contentRoot
  }, [])
  const selectCurrentCodeBlockText = useCallback(
    () => selectCodeBlockText({ editor, getPos, nodeSize: node.nodeSize }),
    [editor, getPos, node.nodeSize]
  )
  const preserveCodeSelectAllScroll = useCallback(() => {
    lastCodeDragSelectionCompletedAt = 0
    const scrollAnchor =
      resolveRecentCodePointerScrollAnchor() ?? {
        x: window.scrollX,
        y: document.scrollingElement?.scrollTop ?? window.scrollY,
      }
    preserveCodeScrollAcrossFrames(scrollAnchor, true)
    return scrollAnchor
  }, [])
  const preserveCodePointerFocusScroll = useCallback((scrollAnchor: { x: number; y: number }) => {
    preserveCodeScrollAcrossFrames(scrollAnchor, true)
    preserveCodeScrollAcrossFrames(scrollAnchor)
  }, [])
  const resolveCodeTextPosFromPointer = useCallback(
    (clientX: number, clientY: number, contentRoot: HTMLElement | null) => {
      if (typeof getPos !== "function") return
      const codeBlockPos = getPos()
      if (typeof codeBlockPos !== "number") return
      const from = codeBlockPos + 1
      const to = codeBlockPos + Math.max(1, node.nodeSize - 1)
      let pointerPos: number | null = null
      const ownerDocument = editor.view.dom.ownerDocument as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
      }
      const caretPosition = ownerDocument.caretPositionFromPoint?.(clientX, clientY)
      const caretRange = caretPosition ? null : ownerDocument.caretRangeFromPoint?.(clientX, clientY)
      const caretNode = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null
      const caretOffset = caretPosition?.offset ?? caretRange?.startOffset ?? null
      const measureTextOffset = (root: Node, node: Node, offset: number) => {
        const range = ownerDocument.createRange()
        range.setStart(root, 0)
        range.setEnd(node, offset)
        return range.toString().length
      }
      const resolveContentTextDomPosition = (offset: number) => {
        if (!contentRoot) return null
        const walker = ownerDocument.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT)
        let remaining = offset
        let current = walker.nextNode()
        while (current) {
          const textLength = current.textContent?.length ?? 0
          if (remaining <= textLength) {
            return { node: current, offset: remaining }
          }
          remaining -= textLength
          current = walker.nextNode()
        }
        return null
      }
      const resolveHighlightTextOffset = (node: Node, offset: number) => {
        if (!contentRoot) return null
        const highlightRoot = contentRoot
          .closest(".aq-code-shell")
          ?.querySelector<HTMLElement>(".aq-code-highlight-layer")
        if (!highlightRoot?.contains(node)) return null
        const highlightOffset = measureTextOffset(highlightRoot, node, offset)
        const contentText = contentRoot.textContent ?? ""
        const highlightText = highlightRoot.textContent ?? ""
        const contentBaseOffset = highlightText ? Math.max(0, contentText.indexOf(highlightText)) : 0
        return Math.min(contentText.length, contentBaseOffset + highlightOffset)
      }
      if (contentRoot && caretNode && typeof caretOffset === "number" && contentRoot.contains(caretNode)) {
        try {
          pointerPos = editor.view.posAtDOM(caretNode, caretOffset)
        } catch {
          pointerPos = null
        }
      }
      if (pointerPos === null && caretNode && typeof caretOffset === "number") {
        const highlightTextOffset = resolveHighlightTextOffset(caretNode, caretOffset)
        const contentPosition =
          typeof highlightTextOffset === "number"
            ? resolveContentTextDomPosition(highlightTextOffset)
            : null
        if (contentPosition) {
          try {
            pointerPos = editor.view.posAtDOM(contentPosition.node, contentPosition.offset)
          } catch {
            pointerPos = null
          }
        }
      }
      if (pointerPos === null) {
        const coords = editor.view.posAtCoords({ left: clientX, top: clientY })
        pointerPos = coords?.pos ?? null
      }
      if (pointerPos === null) return
      return Math.min(Math.max(pointerPos, from), to)
    },
    [editor, getPos, node.nodeSize]
  )
  const selectCodeDomTextRange = useCallback(
    (contentRoot: HTMLElement | null, anchorPos: number, headPos: number) => {
      if (typeof getPos !== "function" || !contentRoot) return false
      const codeBlockPos = getPos()
      if (typeof codeBlockPos !== "number") return false
      const from = codeBlockPos + 1
      return selectDomTextOffsetRange(contentRoot, anchorPos - from, headPos - from)
    },
    [getPos]
  )
  const focusCodeTextPosition = useCallback((pos: number) => {
    const safePos = Math.max(0, Math.min(pos, editor.state.doc.content.size))
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, safePos)))
    focusElementWithoutScroll(editor.view.dom as HTMLElement)
  }, [editor])
  const persistCodeSelectionText = useCallback((contentRoot: HTMLElement | null, options: { allowContentFallback?: boolean } = {}) => {
    const shell = contentRoot?.closest<HTMLElement>(".aq-code-shell") ?? shellRef.current
    if (!shell) return ""
    const selectionText = window.getSelection()?.toString() || ""
    const existingText = shell.getAttribute("data-code-drag-selection-text") || ""
    const contentText = contentRoot?.textContent || ""
    const highlightText = shell.querySelector<HTMLElement>(".aq-code-highlight-layer")?.textContent || ""
    const nextText = selectionText || existingText || (options.allowContentFallback ? contentText || nodeCodeSourceRef.current || highlightText || "" : "")
    if (nextText.trim()) {
      markNextEditorPointerAfterCodeSelection()
      shell.setAttribute("data-code-drag-selection-text", nextText)
      lastActiveCodeSelectionText = nextText
      lastActiveCodeSelectionAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      activeCodeSelectionOwnerRoot = contentRoot?.isConnected ? contentRoot : activeCodeSelectionOwnerRoot
    } else {
      shell.removeAttribute("data-code-drag-selection-text")
    }
    return nextText
  }, [])
  const preserveCodeDomTextRange = useCallback(
    (contentRoot: HTMLElement | null, anchorPos: number, headPos: number) => {
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now()
      const preserveGeneration = ++codeDomTextRangePreserveGeneration
      let frame = 0
      let cancelled = false
      let cancelArmed = false
      const shell = contentRoot?.closest(".aq-code-shell")
      const rootTextSnapshot = (
        contentRoot?.innerText ||
        contentRoot?.textContent ||
        ""
      ).replace(/\s+/g, " ").trim()
      const resolveCurrentRoot = () => {
        if (shell?.isConnected) return shell.querySelector<HTMLElement>(".aq-code-editor-content") ?? contentRoot
        const textProbe = rootTextSnapshot.slice(0, 48)
        return Array.from(
          document.querySelectorAll<HTMLElement>(".aq-code-editor-content")
        ).find((candidate) =>
          (candidate.innerText || candidate.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .includes(textProbe)
        ) ?? contentRoot
      }
      const resolveCurrentShell = () => resolveCurrentRoot()?.closest(".aq-code-shell") ?? shell
      const cleanupCancel = () => {
        window.removeEventListener("pointerdown", cancel, true)
        window.removeEventListener("mousedown", cancel, true)
        window.removeEventListener("keydown", cancelForKeydown, true)
        window.removeEventListener("wheel", cancelForKeydown, true)
        document.removeEventListener("selectionchange", cancelOnSelectionChange, true)
      }
      const cancelPreserve = () => {
        cancelled = true
        codeDomTextRangePreserveGeneration += 1
        resolveCurrentShell()?.removeAttribute("data-code-drag-selection-text")
        cleanupCancel()
      }
      const cancel = (event: Event) => {
        if (!cancelArmed) return
        const currentShell = resolveCurrentShell()
        if (!(event.target instanceof Node) || !currentShell?.contains(event.target)) {
          cancelPreserve()
        }
      }
      const cancelForKeydown = () => { if (cancelArmed) cancelPreserve() }
      const cancelOnSelectionChange = () => {
        if (!cancelArmed) return
        const selection = window.getSelection()
        const anchor =
          selection?.anchorNode instanceof Element
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement ?? null
        const focus =
          selection?.focusNode instanceof Element
            ? selection.focusNode
            : selection?.focusNode?.parentElement ?? null
        const currentShell = resolveCurrentShell()
        const selectionLeftCode =
          selection?.toString().trim() &&
          (!anchor ||
            !focus ||
            !currentShell?.contains(anchor) ||
            !currentShell.contains(focus))
        if (selectionLeftCode) cancelPreserve()
      }
      const selectRange = () => {
        const currentRoot = resolveCurrentRoot()
        if (!currentRoot?.isConnected) return
        if (!selectCodeDomTextRange(currentRoot, anchorPos, headPos) && anchorPos !== headPos) {
          selectDomTextContents(currentRoot)
        }
        persistCodeSelectionText(currentRoot, { allowContentFallback: true })
      }
      const restore = () => {
        if (cancelled || preserveGeneration !== codeDomTextRangePreserveGeneration) return
        selectRange()
        frame += 1
        const elapsedMs =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          startedAt
        if (frame < 168 || elapsedMs < CODE_SCROLL_PRESERVE_MIN_MS) window.requestAnimationFrame(restore)
        else { codeDomTextRangePreserveGeneration += 1; cleanupCancel() }
      }
      window.addEventListener("pointerdown", cancel, { capture: true, passive: true })
      window.addEventListener("mousedown", cancel, { capture: true, passive: true })
      window.addEventListener("keydown", cancelForKeydown, true)
      window.addEventListener("wheel", cancelForKeydown, { capture: true, passive: true })
      document.addEventListener("selectionchange", cancelOnSelectionChange, true)
      preserveCodePointerFocusScroll(scrollAnchor)
      window.requestAnimationFrame(() => { cancelArmed = true })
      restore()
    },
    [persistCodeSelectionText, preserveCodePointerFocusScroll, selectCodeDomTextRange]
  )
  const startCodeDragSelection = useCallback(
    (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>) => {
      const shell = shellRef.current
      const contentRoot = shell?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      const codePointerHandled = (
        event.nativeEvent as Event & { __aqCodePointerHandled?: boolean }
      ).__aqCodePointerHandled
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        codePointerHandled
      )
        return
      if (!shell || !contentRoot || !(event.target instanceof Node) || !shell.contains(event.target)) return
      const targetElement = event.target instanceof Element ? event.target : event.target.parentElement
      const contentRect = contentRoot.getBoundingClientRect()
      const isInsideContentBox =
        event.clientX >= contentRect.left &&
        event.clientX <= contentRect.right &&
        event.clientY >= contentRect.top &&
        event.clientY <= contentRect.bottom
      const isCodeTextSurfaceTarget =
        contentRoot.contains(event.target) ||
        Boolean(targetElement?.closest(".aq-code-highlight-layer")) ||
        (targetElement === shell && isInsideContentBox)
      if (!isCodeTextSurfaceTarget) return
      const anchorPos = resolveCodeTextPosFromPointer(event.clientX, event.clientY, contentRoot)
      if (typeof anchorPos !== "number") return
      event.stopPropagation()
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      rememberCodePointerScrollAnchor(scrollAnchor)
      preserveCodePointerFocusScroll(scrollAnchor)
      const selection = window.getSelection()
      const persistedCodeSelectionText =
        shell.getAttribute("data-code-drag-selection-text")?.trim() || ""
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement ?? null
      const focusElement =
        selection?.focusNode instanceof Element
          ? selection.focusNode
          : selection?.focusNode?.parentElement ?? null
      const selectedText = selection?.toString().trim() || ""
      const contentText = contentRoot.textContent?.trim() || ""
      const existingCodeSelectionText = selectedText || persistedCodeSelectionText
      const hasExistingCodeSelection = Boolean(
        (selectedText &&
          anchorElement &&
          focusElement &&
          contentRoot.contains(anchorElement) &&
          contentRoot.contains(focusElement)) ||
          (persistedCodeSelectionText &&
            contentText.includes(persistedCodeSelectionText.slice(0, 48)))
      )
      if (hasExistingCodeSelection) {
        codeDomTextRangePreserveGeneration += 1
        selection?.removeAllRanges()
        shell.removeAttribute("data-code-drag-selection-text")
        lastActiveCodeSelectionText = ""
        lastActiveCodeSelectionAt = 0
        activeCodeSelectionOwnerRoot = null
      } else {
        if (!selectCodeDomTextRange(contentRoot, anchorPos, anchorPos)) selection?.removeAllRanges()
      }
      preserveCodeScrollAcrossFrames(scrollAnchor, true)
      codeDragSelectionRef.current = {
        active: false,
        anchorPos,
        scrollAnchor,
        startX: event.clientX,
        startY: event.clientY,
      }
      if (hasExistingCodeSelection) focusElementWithoutScroll(contentRoot)
    },
    [preserveCodePointerFocusScroll, resolveCodeTextPosFromPointer, selectCodeDomTextRange]
  )

  const handleCodePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      rememberActiveCodeContentRoot()
      if (event.pointerType && event.pointerType !== "mouse") return
      startCodeDragSelection(event)
    },
    [rememberActiveCodeContentRoot, startCodeDragSelection]
  )

  const handleCodeMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      rememberActiveCodeContentRoot()
      if (codeDragSelectionRef.current) {
        event.stopPropagation()
        return
      }
      startCodeDragSelection(event)
    },
    [rememberActiveCodeContentRoot, startCodeDragSelection]
  )

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const preserveNativeCodeTextPointerScroll = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 0 || ("pointerType" in event && event.pointerType && event.pointerType !== "mouse")) return
      const contentRoot = shell.querySelector<HTMLElement>(".aq-code-editor-content")
      if (!contentRoot || !(event.target instanceof Node) || !shell.contains(event.target)) return
      const targetElement = event.target instanceof Element ? event.target : event.target.parentElement
      if (targetElement?.closest("[data-code-block-header='true'], button, input, textarea, select")) return
      const contentRect = contentRoot.getBoundingClientRect()
      const insideContentBox =
        event.clientX >= contentRect.left &&
        event.clientX <= contentRect.right &&
        event.clientY >= contentRect.top &&
        event.clientY <= contentRect.bottom
      const isCodeTextTarget =
        contentRoot.contains(event.target) ||
        Boolean(targetElement?.closest(".aq-code-highlight-layer")) ||
        (targetElement === shell && insideContentBox)
      if (!isCodeTextTarget) return
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const selection = window.getSelection()
        const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
        const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
        const hasNativeCodeTextSelection = Boolean(
          selection?.toString().trim() &&
            (contentRoot.contains(anchorElement) || contentRoot.contains(focusElement))
        )
        const hasPersistedCodeSelection = Boolean(shell.getAttribute("data-code-drag-selection-text")?.trim())
        if (hasNativeCodeTextSelection || hasPersistedCodeSelection) {
          codeDomTextRangePreserveGeneration += 1
          selection?.removeAllRanges()
          shell.removeAttribute("data-code-drag-selection-text")
        }
      }
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      rememberCodePointerScrollAnchor(scrollAnchor)
      preserveCodePointerFocusScroll(scrollAnchor)
    }
    shell.addEventListener("pointerdown", preserveNativeCodeTextPointerScroll, true)
    shell.addEventListener("mousedown", preserveNativeCodeTextPointerScroll, true)
    return () => {
      shell.removeEventListener("pointerdown", preserveNativeCodeTextPointerScroll, true)
      shell.removeEventListener("mousedown", preserveNativeCodeTextPointerScroll, true)
    }
  }, [preserveCodePointerFocusScroll])

  const handleCodeClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isSyntheticClickAfterCodeDragRelease(event.clientX, event.clientY)) return
    const contentRoot = rememberActiveCodeContentRoot()
    const selection = window.getSelection()
    const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
    const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
    const shell = contentRoot?.closest(".aq-code-shell")
    const hasPersistedCodeSelection = Boolean(shell?.getAttribute("data-code-drag-selection-text")?.trim())
    const hasNativeCodeTextSelection = Boolean(
      selection?.toString().trim() &&
        (contentRoot?.contains(anchorElement) || contentRoot?.contains(focusElement))
    )
    if (hasNativeCodeTextSelection || hasPersistedCodeSelection) {
      codeDomTextRangePreserveGeneration += 1
      selection?.removeAllRanges()
      document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
        element.removeAttribute("data-code-drag-selection-text")
      })
    }
  }, [rememberActiveCodeContentRoot])

  useEffect(() => {
    if (typeof window === "undefined") return
    const resolveFallbackHeadPos = (anchorPos: number) => {
      const codeBlockPos = typeof getPos === "function" ? getPos() : undefined
      if (typeof codeBlockPos !== "number") return anchorPos
      const from = codeBlockPos + 1, to = codeBlockPos + Math.max(1, node.nodeSize - 1)
      return anchorPos <= (from + to) / 2 ? to : from
    }
    const handleWindowMouseMove = (event: MouseEvent | PointerEvent) => {
      const session = codeDragSelectionRef.current
      if (!session) return
      const contentRoot =
        shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
      if (!session.active && distance < 3) return
      const resolvedHeadPos = resolveCodeTextPosFromPointer(event.clientX, event.clientY, contentRoot)
      const headPos = typeof resolvedHeadPos === "number" ? resolvedHeadPos : resolveFallbackHeadPos(session.anchorPos)
      session.active = true
      session.lastHeadPos = headPos
      event.preventDefault()
      event.stopPropagation()
      preserveCodeDomTextRange(contentRoot, session.anchorPos, headPos)
    }
    const handleWindowMouseUp = (event: MouseEvent | PointerEvent) => {
      const session = codeDragSelectionRef.current
      if (!session) return
      codeDragSelectionRef.current = null
      const contentRoot =
        shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      if (!session.active) {
        const selection = window.getSelection()
        const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
        const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
        const hasPersistedCodeSelection = Boolean(contentRoot?.closest(".aq-code-shell")?.getAttribute("data-code-drag-selection-text")?.trim())
        const hasNativeCodeTextSelection = Boolean(
          selection?.toString().trim() &&
            (contentRoot?.contains(anchorElement) || contentRoot?.contains(focusElement))
        )
        if (hasNativeCodeTextSelection || hasPersistedCodeSelection) {
          codeDomTextRangePreserveGeneration += 1
          selection?.removeAllRanges()
          document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
            element.removeAttribute("data-code-drag-selection-text")
          })
        }
        preserveCodePointerFocusScroll(session.scrollAnchor)
        focusCodeTextPosition(session.anchorPos)
        preserveCodePointerFocusScroll(session.scrollAnchor)
        return
      }
      const resolvedHeadPos = resolveCodeTextPosFromPointer(event.clientX, event.clientY, contentRoot)
      const headPos = typeof resolvedHeadPos === "number" ? resolvedHeadPos : session.lastHeadPos ?? resolveFallbackHeadPos(session.anchorPos)
      event.preventDefault()
      preserveCodeDomTextRange(contentRoot, session.anchorPos, headPos)
      lastCodeDragSelectionCompletedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      lastCodeDragSelectionCompletedX = event.clientX; lastCodeDragSelectionCompletedY = event.clientY
      event.stopPropagation()
    }
    window.addEventListener("mousemove", handleWindowMouseMove, true)
    window.addEventListener("pointermove", handleWindowMouseMove, true)
    window.addEventListener("mouseup", handleWindowMouseUp, true)
    window.addEventListener("pointerup", handleWindowMouseUp, true)
    window.addEventListener("pointercancel", handleWindowMouseUp, true)
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove, true)
      window.removeEventListener("pointermove", handleWindowMouseMove, true)
      window.removeEventListener("mouseup", handleWindowMouseUp, true)
      window.removeEventListener("pointerup", handleWindowMouseUp, true)
      window.removeEventListener("pointercancel", handleWindowMouseUp, true)
    }
  }, [focusCodeTextPosition, getPos, node.nodeSize, preserveCodeDomTextRange, preserveCodePointerFocusScroll, resolveCodeTextPosFromPointer])
  const ensureCodeDomTextSelection = useCallback((
    contentRoot: HTMLElement | null,
    scrollAnchor?: { x: number; y: number }
  ) => {
    if (!contentRoot || typeof window === "undefined") return
    if (scrollAnchor) preserveCodeScrollAcrossFrames(scrollAnchor, true)
    const codeShell = contentRoot.closest(".aq-code-shell")
    const rootTextSnapshot = (
      contentRoot.innerText ||
      contentRoot.textContent ||
      ""
    ).replace(/\s+/g, " ").trim()
    const resolveCurrentRoot = () => {
      if (codeShell?.isConnected) return codeShell.querySelector<HTMLElement>(".aq-code-editor-content") ?? contentRoot
      const textProbe = rootTextSnapshot.slice(0, 48)
      return Array.from(
        document.querySelectorAll<HTMLElement>(".aq-code-editor-content")
      ).find((candidate) =>
        (candidate.innerText || candidate.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .includes(textProbe)
      ) ?? contentRoot
    }
    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    const preserveGeneration = ++codeDomTextRangePreserveGeneration
    let cancelled = false
    let frameId: number | null = null
    let armed = false
    const cleanup = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = null
      window.removeEventListener("pointerdown", cancel, true)
      window.removeEventListener("mousedown", cancel, true)
      window.removeEventListener("click", cancel, true)
      window.removeEventListener("keydown", cancel, true)
      window.removeEventListener("wheel", cancel, true)
    }
    const cancel = (event?: Event) => {
      if (!armed) return
      if (
        event?.type === "pointerdown" ||
        event?.type === "mousedown" ||
        event?.type === "click"
      ) {
        const currentRoot = resolveCurrentRoot()
        currentRoot?.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
        window.getSelection()?.removeAllRanges()
        lastActiveCodeSelectionText = ""
        lastActiveCodeSelectionAt = 0
        activeCodeSelectionOwnerRoot = null
      }
      cancelled = true
      codeDomTextRangePreserveGeneration += 1
      cleanup()
    }
    const restore = () => {
      if (cancelled) return
      const currentRoot = resolveCurrentRoot()
      if (
        !currentRoot.isConnected ||
        preserveGeneration !== codeDomTextRangePreserveGeneration
      ) {
        cleanup()
        return
      }
      const selection = window.getSelection()
      const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
      const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
      const selectionInsideCode = Boolean(
        selection?.toString().trim() &&
          anchorElement &&
          focusElement &&
          currentRoot.contains(anchorElement) &&
          currentRoot.contains(focusElement)
      )
      if (selectionInsideCode) {
        persistCodeSelectionText(currentRoot)
      } else if (persistCodeSelectionText(currentRoot, { allowContentFallback: true }).trim()) {
        selectCodeDomTextContents(currentRoot)
        persistCodeSelectionText(currentRoot)
      }
      if (scrollAnchor) preserveCodeScrollAcrossFrames(scrollAnchor, true)
      const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
      if (elapsedMs < 240) {
        frameId = window.requestAnimationFrame(restore)
      } else {
        cleanup()
      }
    }
    armed = true
    window.addEventListener("pointerdown", cancel, true)
    window.addEventListener("mousedown", cancel, true)
    window.addEventListener("click", cancel, true)
    window.addEventListener("wheel", cancel, { capture: true, passive: true })
    frameId = window.requestAnimationFrame(() => {
      window.addEventListener("keydown", cancel, true)
      restore()
    })
  }, [persistCodeSelectionText])
  useEffect(() => {
    setDraftLanguage(normalizeCodeLanguage(String(node.attrs?.language || "")))
  }, [node.attrs?.language])

  useEffect(() => {
    nodeCodeSourceRef.current = nodeCodeSource
    setLiveCodeSource(nodeCodeSource)
  }, [nodeCodeSource])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || typeof document === "undefined" || typeof window === "undefined") return

    const resolveEditorContent = () => shell.querySelector<HTMLElement>(".aq-code-editor-content")

    let frameId: number | null = null

    const syncLiveCodeSource = () => {
      const contentText = resolveEditorContent()?.textContent || ""
      const sourceFromNode = nodeCodeSourceRef.current
      const nextValue = contentText.trim() || !sourceFromNode.trim() ? contentText : sourceFromNode
      setLiveCodeSource((current) => (current === nextValue ? current : nextValue))
    }

    syncLiveCodeSource()
    const handleDocumentCodePointer = (event: MouseEvent | PointerEvent) => {
      lastCodePointerClientX = event.clientX
      lastCodePointerClientY = event.clientY
      lastCodePointerAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      if (event.type === "click") {
        if (isSyntheticClickAfterCodeDragRelease(event.clientX, event.clientY)) return
        const selection = window.getSelection()
        const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
        const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
        const hasCodeSelection = Boolean(
          (selection?.toString().trim() && (anchorElement?.closest(".aq-code-shell") || focusElement?.closest(".aq-code-shell"))) ||
            document.querySelector("[data-code-drag-selection-text]")
        )
        if (hasCodeSelection) {
          codeDomTextRangePreserveGeneration += 1
          selection?.removeAllRanges()
          document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
            element.removeAttribute("data-code-drag-selection-text")
          })
          lastActiveCodeSelectionText = ""
          lastActiveCodeSelectionAt = 0
          activeCodeSelectionOwnerRoot = null
        }
      }
      const contentRoot = resolveEditorContent()
      if (!contentRoot) return
      const target = event.target
      if (!(target instanceof Node)) return
      const codeShell = contentRoot.closest(".aq-code-shell")
      const isThisCodeOwner = () =>
        activeCodeSelectionOwnerRoot === contentRoot ||
        Boolean(activeCodeSelectionOwnerRoot && codeShell?.contains(activeCodeSelectionOwnerRoot))
      const ownsActiveCodeSelection = isThisCodeOwner()
      const pointTarget = document.elementFromPoint(event.clientX, event.clientY)
      const contentRect = contentRoot.getBoundingClientRect()
      const shellRect = codeShell?.getBoundingClientRect()
      const isInsideContentPoint =
        event.clientX >= contentRect.left &&
        event.clientX <= contentRect.right &&
        event.clientY >= contentRect.top &&
        event.clientY <= contentRect.bottom
      const isInsideShellPoint = Boolean(
        shellRect &&
          event.clientX >= shellRect.left &&
          event.clientX <= shellRect.right &&
          event.clientY >= shellRect.top &&
          event.clientY <= shellRect.bottom
      )
      const isInsideCodePointer =
        contentRoot.contains(target) ||
        Boolean(codeShell?.contains(target)) ||
        Boolean(
          pointTarget &&
            (contentRoot.contains(pointTarget) || codeShell?.contains(pointTarget))
        ) ||
        isInsideContentPoint ||
        isInsideShellPoint
      const hasCodeTextSelection =
        window.getSelection()?.toString().trim() ||
        codeShell?.getAttribute("data-code-drag-selection-text")?.trim()
      if (
        event.type !== "click" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        isInsideCodePointer &&
        hasCodeTextSelection
      ) {
        codeDomTextRangePreserveGeneration += 1
        window.getSelection()?.removeAllRanges()
        codeShell?.removeAttribute("data-code-drag-selection-text")
        lastActiveCodeSelectionText = ""
        lastActiveCodeSelectionAt = 0
        activeCodeSelectionOwnerRoot = null
      }
      if (isInsideCodePointer) {
        if (event.type === "pointerdown" || event.type === "mousedown") {
          markNextEditorPointerAfterCodeSelection()
        }
        rememberActiveCodeContentRoot()
      } else if (isActiveCodeBlockRef.current && ownsActiveCodeSelection) {
        isActiveCodeBlockRef.current = false
        lastCodePointerContentRootRef.current = null
        activeCodeSelectionOwnerRoot = null
      }
      if (!codeShell?.contains(target) && ownsActiveCodeSelection) {
        markNextEditorPointerAfterCodeSelection()
        codeDragSelectionRef.current = null
        window.getSelection()?.removeAllRanges()
        document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
          element.removeAttribute("data-code-drag-selection-text")
        })
        lastActiveCodeSelectionText = ""
        lastActiveCodeSelectionAt = 0
        activeCodeSelectionOwnerRoot = null
      }
    }
    const handleShellPointerCapture = () => {
      rememberActiveCodeContentRoot()
    }

    const handleDocumentSelectAll = (event: KeyboardEvent) => {
      const contentRoot = resolveEditorContent()
      if (!contentRoot) return
      if (event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "a") return
      const activeElement = document.activeElement
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement ?? null
      const codeShell = contentRoot.closest(".aq-code-shell")
      const isProseMirrorRootFocused =
        activeElement instanceof HTMLElement &&
        activeElement.classList.contains("ProseMirror")
      const anchorTableCell = anchorElement?.closest("th, td")
      const hasTableDragSelectionText = document.documentElement.hasAttribute(
        "data-table-drag-selection-text"
      )
      if (
        (activeElement instanceof Element && activeElement.closest("th, td")) ||
        (hasTableDragSelectionText && !isProseMirrorRootFocused) ||
        (anchorTableCell && !isProseMirrorRootFocused)
      )
        return
      if (isProseMirrorRootFocused) {
        const visibleCodeRoot = resolveVisibleCodeRootForSelectAll({
          ignoreTableAnchor: true,
          ignoreTableDragSelectionText: true,
        })
        if (!visibleCodeRoot) return
        const now = typeof performance !== "undefined" ? performance.now() : Date.now()
        const visibleCodeRect = (
          visibleCodeRoot.closest<HTMLElement>(".aq-code-shell") ??
          visibleCodeRoot
        ).getBoundingClientRect()
        const recentCodePointerInsideVisibleRoot =
          now - lastCodePointerAt <= CODE_SELECT_ALL_ACTIVE_GRACE_MS &&
          lastCodePointerClientX >= visibleCodeRect.left &&
            lastCodePointerClientX <= visibleCodeRect.right &&
            lastCodePointerClientY >= visibleCodeRect.top &&
            lastCodePointerClientY <= visibleCodeRect.bottom
        if (!recentCodePointerInsideVisibleRoot) return
        if ((anchorTableCell || hasTableDragSelectionText) && !recentCodePointerInsideVisibleRoot) return
        const scrollAnchor = preserveCodeSelectAllScroll()
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        const preserveAfterSelectAll = () =>
          preserveCodeScrollAcrossFrames(scrollAnchor, true)
        if (selectCodeDomTextContents(visibleCodeRoot)) {
          persistCodeSelectionText(visibleCodeRoot, { allowContentFallback: true })
          preserveAfterSelectAll()
          ensureCodeDomTextSelection(visibleCodeRoot, scrollAnchor)
          return
        }
        persistCodeSelectionText(visibleCodeRoot, { allowContentFallback: true })
        preserveAfterSelectAll()
        return
      }
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      const contentRect = contentRoot.getBoundingClientRect()
      const shellRect = codeShell?.getBoundingClientRect()
      const activePointerPointMatch = Boolean(
        now - lastCodePointerAt <= CODE_SELECT_ALL_ACTIVE_GRACE_MS &&
          ((lastCodePointerClientX >= contentRect.left &&
            lastCodePointerClientX <= contentRect.right &&
            lastCodePointerClientY >= contentRect.top &&
            lastCodePointerClientY <= contentRect.bottom) ||
            (shellRect &&
              lastCodePointerClientX >= shellRect.left &&
              lastCodePointerClientX <= shellRect.right &&
              lastCodePointerClientY >= shellRect.top &&
              lastCodePointerClientY <= shellRect.bottom))
      )
      const activeCodeTextProbe = lastActiveCodeSelectionText.trim().slice(0, 48)
      const activeCodeTextMatch = Boolean(
        activeCodeTextProbe &&
          now - lastActiveCodeSelectionAt <= CODE_SELECT_ALL_ACTIVE_GRACE_MS &&
          codeShell?.textContent?.includes(activeCodeTextProbe)
      )
      const isActiveShellMatch =
        (isActiveCodeBlockRef.current ||
          lastCodePointerContentRootRef.current === contentRoot ||
          Boolean(lastCodePointerContentRootRef.current && codeShell?.contains(lastCodePointerContentRootRef.current)) ||
          activePointerPointMatch ||
          activeCodeTextMatch) &&
        codeShell?.isConnected &&
        contentRoot.isConnected
      const isRootFocusedWhileCodeHovered =
        activeElement instanceof Element &&
        activeElement.classList.contains("ProseMirror") &&
        codeShell instanceof HTMLElement &&
        codeShell.matches(":hover")
      const isInsideCodeBlock =
        (activeElement instanceof Element && contentRoot.contains(activeElement)) ||
        (anchorElement instanceof Element && contentRoot.contains(anchorElement)) ||
        (isActiveShellMatch && contentRoot.isConnected) ||
        isRootFocusedWhileCodeHovered
      if (!isInsideCodeBlock) return
      const scrollAnchor = preserveCodeSelectAllScroll()
      markNextEditorPointerAfterCodeSelection()
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      const preserveAfterSelectAll = () =>
        preserveCodeScrollAcrossFrames(scrollAnchor, true)
      if (selectCodeDomTextContents(contentRoot)) {
        persistCodeSelectionText(contentRoot, { allowContentFallback: true })
        preserveAfterSelectAll()
        ensureCodeDomTextSelection(contentRoot, scrollAnchor)
        return
      }
      if (selectCurrentCodeBlockText()) {
        persistCodeSelectionText(contentRoot, { allowContentFallback: true })
        preserveAfterSelectAll()
        ensureCodeDomTextSelection(contentRoot, scrollAnchor)
        return
      }
      persistCodeSelectionText(contentRoot, { allowContentFallback: true })
      preserveAfterSelectAll()
    }

    const observer = new MutationObserver(() => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncLiveCodeSource()
      })
    })

    shell.addEventListener("pointerdown", handleShellPointerCapture, true)
    shell.addEventListener("mousedown", handleShellPointerCapture, true)
    shell.addEventListener("click", handleShellPointerCapture, true)
    window.addEventListener("pointerdown", handleDocumentCodePointer, true)
    window.addEventListener("mousedown", handleDocumentCodePointer, true)
    window.addEventListener("click", handleDocumentCodePointer, true)
    document.addEventListener("pointerdown", handleDocumentCodePointer, true)
    document.addEventListener("mousedown", handleDocumentCodePointer, true)
    document.addEventListener("click", handleDocumentCodePointer, true)
    window.addEventListener("keydown", handleDocumentSelectAll, true)
    document.addEventListener("keydown", handleDocumentSelectAll, true)
    observer.observe(shell, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      shell.removeEventListener("pointerdown", handleShellPointerCapture, true)
      shell.removeEventListener("mousedown", handleShellPointerCapture, true)
      shell.removeEventListener("click", handleShellPointerCapture, true)
      window.removeEventListener("pointerdown", handleDocumentCodePointer, true)
      window.removeEventListener("mousedown", handleDocumentCodePointer, true)
      window.removeEventListener("click", handleDocumentCodePointer, true)
      document.removeEventListener("pointerdown", handleDocumentCodePointer, true)
      document.removeEventListener("mousedown", handleDocumentCodePointer, true)
      document.removeEventListener("click", handleDocumentCodePointer, true)
      window.removeEventListener("keydown", handleDocumentSelectAll, true)
      document.removeEventListener("keydown", handleDocumentSelectAll, true)
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      if (isActiveCodeBlockRef.current) {
        isActiveCodeBlockRef.current = false
      }
      if (activeCodeSelectionOwnerRoot && shell.contains(activeCodeSelectionOwnerRoot)) activeCodeSelectionOwnerRoot = null
      lastCodePointerContentRootRef.current = null
    }
  }, [ensureCodeDomTextSelection, persistCodeSelectionText, preserveCodeSelectAllScroll, rememberActiveCodeContentRoot, selectCurrentCodeBlockText])

  useEffect(() => {
    let disposed = false
    const nextSource = liveCodeSource
    setHighlightedCodeHtml(renderImmediateCodeToHtml({ source: nextSource, language: draftLanguage }).html)

    void highlightCodeToHtml({
      source: nextSource,
      language: draftLanguage,
    }).then((result) => {
      if (disposed) return
      setHighlightedCodeHtml(result.html)
    })

    return () => {
      disposed = true
    }
  }, [draftLanguage, liveCodeSource])

  useEffect(() => {
    if (!isLanguageMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && menuRef.current?.contains(target)) return
      setIsLanguageMenuOpen(false)
      setLanguageSearch("")
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setIsLanguageMenuOpen(false)
      setLanguageSearch("")
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isLanguageMenuOpen])

  useEffect(() => {
    if (!isLanguageMenuOpen) return
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [isLanguageMenuOpen])
  const filteredLanguageOptions = useMemo(() => filterCodeLanguageOptions(languageSearch), [languageSearch])

  const exactSearchMatch = hasExactCodeLanguageSearchMatch(filteredLanguageOptions, languageSearch)

  const toggleLanguageMenu = useCallback(() => {
    setIsLanguageMenuOpen((prev) => !prev)
    setLanguageSearch("")
  }, [])

  const applyLanguage = useCallback((value: string) => {
    const normalizedLanguage = normalizeCodeLanguage(value)
    setDraftLanguage(normalizedLanguage)
    rememberPreferredCodeLanguage(normalizedLanguage)
    updateAttributes({ language: normalizedLanguage || null })
    setIsLanguageMenuOpen(false)
    setLanguageSearch("")
  }, [updateAttributes])

  const handleCodePaste = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    const plainText = event.clipboardData.getData("text/plain") || ""
    const html = event.clipboardData.getData("text/html") || ""
    const nextText = plainText || (html ? extractPlainTextFromHtml(html) : "")
    if (!nextText) return

    const replaceRange = resolveCodeBlockPasteRange({ editor, getPos, nodeSize: node.nodeSize })
    if (!replaceRange) return

    event.preventDefault()
    event.stopPropagation()

    const normalizedText = nextText.replace(/\r\n?/g, "\n")
    const tr = editor.state.tr.insertText(normalizedText, replaceRange.from, replaceRange.to)
    editor.view.dispatch(tr.scrollIntoView())
    editor.view.focus()
  }, [editor, getPos, node.nodeSize])

  const handleCodeCopy = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    const copyText = resolveCodeBlockCopyText(shellRef.current)
    if (!copyText.trim()) return

    event.preventDefault()
    event.stopPropagation()
    event.clipboardData.setData("text/plain", copyText)
  }, [])
  const handleCodeWheelCapture = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    const scroller = document.scrollingElement
    if (!scroller) return

    const deltaMultiplier =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight
          : 1
    const deltaY = event.deltaY * deltaMultiplier
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const currentScrollTop = scroller.scrollTop
    const nextScrollTop = Math.min(Math.max(0, currentScrollTop + deltaY), maxScrollTop)
    if (Math.abs(nextScrollTop - currentScrollTop) < 0.5) return

    // The code shell is horizontally scrollable; Chromium otherwise keeps vertical wheel inside it.
    event.preventDefault()
    scroller.scrollTop = nextScrollTop
  }, [])
  const handleCodeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimarySelectAllShortcut(event)) return

    event.preventDefault()
    event.stopPropagation()

    const contentRoot = shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
    const scrollAnchor = preserveCodeSelectAllScroll()
    const preserveAfterSelectAll = () =>
      preserveCodeScrollAcrossFrames(scrollAnchor, true)
    if (selectCodeDomTextContents(contentRoot)) {
      persistCodeSelectionText(contentRoot, { allowContentFallback: true })
      preserveAfterSelectAll()
      ensureCodeDomTextSelection(contentRoot, scrollAnchor)
      return
    }
    if (selectCurrentCodeBlockText()) {
      persistCodeSelectionText(contentRoot, { allowContentFallback: true })
      preserveAfterSelectAll()
      ensureCodeDomTextSelection(contentRoot, scrollAnchor)
      return
    }
    persistCodeSelectionText(contentRoot, { allowContentFallback: true })

    if (typeof getPos !== "function") return
    const codeBlockPos = getPos()
    if (typeof codeBlockPos !== "number") return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, Math.max(0, codeBlockPos)))
    preserveWindowScrollForRichBlockSelectAll()
    editor.view.dispatch(tr)
    focusElementWithoutScroll(editor.view.dom as HTMLElement)
  }, [editor, getPos, ensureCodeDomTextSelection, persistCodeSelectionText, preserveCodeSelectAllScroll, selectCurrentCodeBlockText])
  return (
    <CodeBlockEditorWrapper data-selected={selected} data-code-block-wrapper="true">
      <CodeBlockEditorHeader data-code-block-header="true">
        <CodeWindowDots aria-hidden="true">
          <span data-tone="red" />
          <span data-tone="yellow" />
          <span data-tone="green" />
        </CodeWindowDots>
        <CodeLanguageControl
          applyLanguage={applyLanguage}
          draftLanguage={draftLanguage}
          exactSearchMatch={exactSearchMatch}
          filteredLanguageOptions={filteredLanguageOptions}
          isLanguageMenuOpen={isLanguageMenuOpen}
          languageSearch={languageSearch}
          menuId={menuId}
          menuRef={menuRef}
          searchInputRef={searchInputRef}
          setLanguageSearch={setLanguageSearch}
          toggleLanguageMenu={toggleLanguageMenu}
        />
      </CodeBlockEditorHeader>
      <CodeBlockEditorSurface>
        <div
          ref={shellRef}
          className="aq-code-shell"
          onPointerDownCapture={handleCodePointerDownCapture}
          onMouseDownCapture={handleCodeMouseDownCapture}
          onClickCapture={handleCodeClickCapture}
          onWheelCapture={handleCodeWheelCapture}
          onKeyDownCapture={handleCodeKeyDown}
          onDragStartCapture={(event) => preventNativeCodeDragStart(event, shellRef.current)}
          onDropCapture={(event) => preventInternalCodeDrop(event, shellRef.current)}
          onCopy={handleCodeCopy}
          onPaste={handleCodePaste}
        >
          <pre
            className="aq-code-highlight-layer"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightedCodeHtml }}
          />
          <NodeViewContent className="aq-code-editor-content" />
        </div>
      </CodeBlockEditorSurface>
    </CodeBlockEditorWrapper>
  )
}

export const EditorCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})
