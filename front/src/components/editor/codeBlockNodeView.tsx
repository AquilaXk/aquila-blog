import CodeBlock from "@tiptap/extension-code-block"
import { NodeSelection } from "@tiptap/pm/state"
import { NodeViewContent, type NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react"
import {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
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
  preventInternalCodeDrop, preventNativeCodeDragStart,
  resolveCodeBlockPasteRange,
  resolveCodeBlockCopyText,
  selectCodeBlockText,
  selectCodeDomTextContents, selectDomTextContents,
  selectDomTextOffsetRange,
} from "./codeBlockNodeViewSelectionModel"
import { focusElementWithoutScroll } from "./blockEditorEngineDocumentModel"
import {
  preserveWindowScrollForRichBlockSelectAll,
  preserveWindowScrollPositionAcrossFrames,
} from "./blockHandleLayoutModel"
export { getPreferredCodeLanguage, normalizeCodeLanguage } from "./codeBlockNodeViewLanguageModel"
export { CodeBlockEditorStyles } from "./codeBlockNodeViewStyles"
let codeDomTextRangePreserveGeneration = 0
const CODE_SCROLL_PRESERVE_MIN_MS = 4_800
type CodeDragSelectionSession = { active: boolean; anchorPos: number; lastHeadPos?: number; startX: number; startY: number }
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
  const selectCurrentCodeBlockText = useCallback(
    () => selectCodeBlockText({ editor, getPos, nodeSize: node.nodeSize }),
    [editor, getPos, node.nodeSize]
  )
  const preserveCodeSelectAllScroll = useCallback(() => {
    const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
    preserveWindowScrollPositionAcrossFrames(scrollAnchor, 192, 4, CODE_SCROLL_PRESERVE_MIN_MS, false, true, true)
    return scrollAnchor
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
  const preserveCodeDomTextRange = useCallback(
    (contentRoot: HTMLElement | null, anchorPos: number, headPos: number) => {
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now(), preserveGeneration = ++codeDomTextRangePreserveGeneration
      let frame = 0, cancelled = false, cancelArmed = false
      const shell = contentRoot?.closest(".aq-code-shell")
      const cleanupCancel = () => { window.removeEventListener("pointerdown", cancel, true); window.removeEventListener("mousedown", cancel, true); window.removeEventListener("keydown", cancelForKeydown, true); window.removeEventListener("wheel", cancelForKeydown, true); document.removeEventListener("selectionchange", cancelOnSelectionChange, true) }
      const cancelPreserve = () => { cancelled = true; codeDomTextRangePreserveGeneration += 1; shell?.removeAttribute("data-code-drag-selection-text"); cleanupCancel() }
      const cancel = (event: Event) => { if (!cancelArmed) return; if (!(event.target instanceof Node) || !shell?.contains(event.target)) cancelPreserve() }
      const cancelForKeydown = () => { if (cancelArmed) cancelPreserve() }
      const cancelOnSelectionChange = () => { if (!cancelArmed) return; const selection = window.getSelection(), anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, focus = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null; if (selection?.toString().trim() && (!anchor || !focus || !shell?.contains(anchor) || !shell.contains(focus))) cancelPreserve() }
      const selectRange = () => { if (!selectCodeDomTextRange(contentRoot, anchorPos, headPos) && anchorPos !== headPos) selectDomTextContents(contentRoot)
        const selectedText = window.getSelection()?.toString() || ""; if (selectedText) shell?.setAttribute("data-code-drag-selection-text", selectedText); else shell?.removeAttribute("data-code-drag-selection-text")
      }
      const restore = () => {
        if (cancelled || preserveGeneration !== codeDomTextRangePreserveGeneration) return
        selectRange(); frame += 1
        const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
        if (frame < 168 || elapsedMs < 2_800) window.requestAnimationFrame(restore)
        else { codeDomTextRangePreserveGeneration += 1; cleanupCancel() }
      }
      window.addEventListener("pointerdown", cancel, { capture: true, passive: true })
      window.addEventListener("mousedown", cancel, { capture: true, passive: true })
      window.addEventListener("keydown", cancelForKeydown, true)
      window.addEventListener("wheel", cancelForKeydown, { capture: true, passive: true })
      document.addEventListener("selectionchange", cancelOnSelectionChange, true)
      preserveWindowScrollPositionAcrossFrames(scrollAnchor, 192, 4, CODE_SCROLL_PRESERVE_MIN_MS, false, true, true)
      window.requestAnimationFrame(() => { cancelArmed = true })
      restore()
    },
    [selectCodeDomTextRange]
  )
  const startCodeDragSelection = useCallback(
    (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>) => {
      const shell = shellRef.current
      const contentRoot = shell?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented || (event.nativeEvent as Event & { __aqCodePointerHandled?: boolean }).__aqCodePointerHandled) return
      if (!shell || !contentRoot || !(event.target instanceof Node) || !shell.contains(event.target)) return
      const targetElement = event.target instanceof Element ? event.target : event.target.parentElement
      const contentRect = contentRoot.getBoundingClientRect()
      const isInsideContentBox = event.clientX >= contentRect.left && event.clientX <= contentRect.right && event.clientY >= contentRect.top && event.clientY <= contentRect.bottom
      const isCodeTextSurfaceTarget =
        contentRoot.contains(event.target) ||
        Boolean(targetElement?.closest(".aq-code-highlight-layer")) ||
        (targetElement === shell && isInsideContentBox)
      if (!isCodeTextSurfaceTarget) return
      const anchorPos = resolveCodeTextPosFromPointer(event.clientX, event.clientY, contentRoot)
      if (typeof anchorPos !== "number") return
      event.stopPropagation()
      const selection = window.getSelection(), persistedCodeSelectionText = shell.getAttribute("data-code-drag-selection-text")?.trim() || ""
      const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
      const selectedText = selection?.toString().trim() || "", contentText = contentRoot.textContent?.trim() || ""
      const existingCodeSelectionText = selectedText || persistedCodeSelectionText
      const hasExistingCodeSelection = Boolean((selectedText && anchorElement && focusElement && contentRoot.contains(anchorElement) && contentRoot.contains(focusElement)) || (persistedCodeSelectionText && contentText.includes(persistedCodeSelectionText.slice(0, 48))))
      if (hasExistingCodeSelection) {
        shell.setAttribute("data-code-drag-selection-text", existingCodeSelectionText)
        preserveCodeDomTextRange(contentRoot, anchorPos, anchorPos)
      } else {
        selection?.removeAllRanges()
      }
      preserveWindowScrollPositionAcrossFrames({ x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }, 192, 4, CODE_SCROLL_PRESERVE_MIN_MS, false, false, true)
      codeDragSelectionRef.current = {
        active: false,
        anchorPos,
        startX: event.clientX,
        startY: event.clientY,
      }
      focusElementWithoutScroll(contentRoot)
    },
    [preserveCodeDomTextRange, resolveCodeTextPosFromPointer]
  )

  const handleCodePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const contentRoot =
        shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      isActiveCodeBlockRef.current = contentRoot?.isConnected ?? false
      lastCodePointerContentRootRef.current = contentRoot?.isConnected ? contentRoot : null
      if (event.pointerType && event.pointerType !== "mouse") return
      startCodeDragSelection(event)
    },
    [startCodeDragSelection]
  )

  const handleCodeMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (codeDragSelectionRef.current) {
        event.stopPropagation()
        return
      }
      startCodeDragSelection(event)
    },
    [startCodeDragSelection]
  )

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
      if (!session.active) return
      const contentRoot =
        shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
      const resolvedHeadPos = resolveCodeTextPosFromPointer(event.clientX, event.clientY, contentRoot)
      const headPos = typeof resolvedHeadPos === "number" ? resolvedHeadPos : session.lastHeadPos ?? resolveFallbackHeadPos(session.anchorPos)
      event.preventDefault()
      preserveCodeDomTextRange(contentRoot, session.anchorPos, headPos)
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
  }, [getPos, node.nodeSize, preserveCodeDomTextRange, resolveCodeTextPosFromPointer])
  const ensureCodeDomTextSelection = useCallback((contentRoot: HTMLElement | null, scrollAnchor?: { x: number; y: number }) => {
    if (!contentRoot || typeof window === "undefined") return
    if (scrollAnchor) preserveWindowScrollPositionAcrossFrames(scrollAnchor, 192, 4, CODE_SCROLL_PRESERVE_MIN_MS, false, true, true)
    window.requestAnimationFrame(() => {
      if (!contentRoot.isConnected) return
      const selectedText = window.getSelection()?.toString() || ""
      if (selectedText.trim()) return
      if (!(contentRoot.textContent || "").trim()) return
      selectCodeDomTextContents(contentRoot)
      if (scrollAnchor) preserveWindowScrollPositionAcrossFrames(scrollAnchor, 192, 4, CODE_SCROLL_PRESERVE_MIN_MS, false, true, true)
    })
  }, [])
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
    const contentRoot = resolveEditorContent()
    if (!contentRoot) return

    let frameId: number | null = null

    const syncLiveCodeSource = () => {
      const contentText = resolveEditorContent()?.textContent || ""
      const sourceFromNode = nodeCodeSourceRef.current
      const nextValue = contentText.trim() || !sourceFromNode.trim() ? contentText : sourceFromNode
      setLiveCodeSource((current) => (current === nextValue ? current : nextValue))
    }

    syncLiveCodeSource()
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const codeShell = contentRoot.closest(".aq-code-shell")
      if (contentRoot.contains(target) || Boolean(codeShell?.contains(target))) {
        isActiveCodeBlockRef.current = contentRoot.isConnected
        lastCodePointerContentRootRef.current = contentRoot
      } else if (isActiveCodeBlockRef.current) {
        isActiveCodeBlockRef.current = false
        lastCodePointerContentRootRef.current = null
      }
      if (!codeShell?.contains(target)) codeDragSelectionRef.current = null
    }

    const handleDocumentSelectAll = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "a") return
      const activeElement = document.activeElement
      const scrollAnchor = preserveCodeSelectAllScroll()
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement ?? null
      const codeShell = contentRoot.closest(".aq-code-shell")
      const isActiveShellMatch =
        (isActiveCodeBlockRef.current || lastCodePointerContentRootRef.current === contentRoot) &&
        codeShell?.isConnected &&
        contentRoot.isConnected
      const isInsideCodeBlock =
        (activeElement instanceof Element && contentRoot.contains(activeElement)) ||
        (anchorElement instanceof Element && contentRoot.contains(anchorElement)) ||
        (isActiveShellMatch && contentRoot.isConnected)
      if (!isInsideCodeBlock) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (selectCurrentCodeBlockText()) {
        ensureCodeDomTextSelection(contentRoot, scrollAnchor)
        return
      }
      selectCodeDomTextContents(contentRoot)
    }

    const observer = new MutationObserver(() => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncLiveCodeSource()
      })
    })

    document.addEventListener("pointerdown", handleDocumentPointerDown, true)
    document.addEventListener("keydown", handleDocumentSelectAll, true)
    observer.observe(contentRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true)
      document.removeEventListener("keydown", handleDocumentSelectAll, true)
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      if (isActiveCodeBlockRef.current) {
        isActiveCodeBlockRef.current = false
      }
      lastCodePointerContentRootRef.current = null
    }
  }, [ensureCodeDomTextSelection, preserveCodeSelectAllScroll, selectCurrentCodeBlockText])

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
  const handleCodeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimarySelectAllShortcut(event)) return

    event.preventDefault()
    event.stopPropagation()

    const contentRoot = shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
    const scrollAnchor = preserveCodeSelectAllScroll()
    if (selectCurrentCodeBlockText()) {
      ensureCodeDomTextSelection(contentRoot, scrollAnchor)
      return
    }
    if (selectCodeDomTextContents(contentRoot)) return

    if (typeof getPos !== "function") return
    const codeBlockPos = getPos()
    if (typeof codeBlockPos !== "number") return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, Math.max(0, codeBlockPos)))
    preserveWindowScrollForRichBlockSelectAll()
    editor.view.dispatch(tr)
    focusElementWithoutScroll(editor.view.dom as HTMLElement)
  }, [editor, getPos, ensureCodeDomTextSelection, preserveCodeSelectAllScroll, selectCurrentCodeBlockText])
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
