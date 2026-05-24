import CodeBlock from "@tiptap/extension-code-block"
import { NodeSelection } from "@tiptap/pm/state"
import { NodeViewContent, type NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react"
import {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import AppIcon from "src/components/icons/AppIcon"
import { extractPlainTextFromHtml } from "src/libs/markdown/htmlToMarkdown"
import {
  highlightCodeToHtml,
  renderImmediateCodeToHtml,
} from "src/libs/markdown/prismRuntime"
import { toLanguageLabel } from "src/libs/markdown/rendering"
import {
  CodeBlockEditorHeader,
  CodeBlockEditorSurface,
  CodeBlockEditorWrapper,
  CodeLanguageButton,
  CodeLanguageOptionButton,
  CodeLanguageOptionList,
  CodeLanguagePicker,
  CodeLanguagePopover,
  CodeLanguageSearchInput,
  CodeWindowDots,
} from "./codeBlockNodeViewStyles"
import {
  filterCodeLanguageOptions,
  hasExactCodeLanguageSearchMatch,
  normalizeCodeLanguage,
  rememberPreferredCodeLanguage,
} from "./codeBlockNodeViewLanguageModel"
import {
  isPrimarySelectAllShortcut,
  resolveCodeBlockPasteRange,
  selectCodeBlockText,
  selectDomTextContents,
} from "./codeBlockNodeViewSelectionModel"
import { focusElementWithoutScroll } from "./blockEditorEngineDocumentModel"
import { preserveWindowScrollForRichBlockSelectAll } from "./blockHandleLayoutModel"

export { getPreferredCodeLanguage, normalizeCodeLanguage } from "./codeBlockNodeViewLanguageModel"
export { CodeBlockEditorStyles } from "./codeBlockNodeViewStyles"

let lastActiveCodeBlockContentRoot: HTMLElement | null = null

export const CodeBlockView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const [draftLanguage, setDraftLanguage] = useState(normalizeCodeLanguage(String(node.attrs?.language || "")))
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState("")
  const initialCodeSource = node.textContent || ""
  const [liveCodeSource, setLiveCodeSource] = useState(initialCodeSource)
  const [highlightedCodeHtml, setHighlightedCodeHtml] = useState(() =>
    renderImmediateCodeToHtml({
      source: initialCodeSource,
      language: normalizeCodeLanguage(String(node.attrs?.language || "")),
    }).html
  )

  const selectCurrentCodeBlockText = useCallback(
    () => selectCodeBlockText({ editor, getPos, nodeSize: node.nodeSize }),
    [editor, getPos, node.nodeSize]
  )

  const ensureCodeDomTextSelection = useCallback((contentRoot: HTMLElement | null) => {
    if (!contentRoot || typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      if (!contentRoot.isConnected) return
      const selectedText = window.getSelection()?.toString() || ""
      if (selectedText.trim()) return
      if (!(contentRoot.textContent || "").trim()) return
      selectDomTextContents(contentRoot)
    })
  }, [])

  useEffect(() => {
    setDraftLanguage(normalizeCodeLanguage(String(node.attrs?.language || "")))
  }, [node.attrs?.language])

  useEffect(() => {
    setLiveCodeSource(node.textContent || "")
  }, [node.textContent])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || typeof document === "undefined" || typeof window === "undefined") return

    const resolveEditorContent = () => shell.querySelector<HTMLElement>(".aq-code-editor-content")
    const contentRoot = resolveEditorContent()
    if (!contentRoot) return

    let frameId: number | null = null

    const syncLiveCodeSource = () => {
      const nextValue = resolveEditorContent()?.textContent || ""
      setLiveCodeSource((current) => (current === nextValue ? current : nextValue))
    }

    syncLiveCodeSource()

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (contentRoot.contains(target)) {
        lastActiveCodeBlockContentRoot = contentRoot
      } else if (lastActiveCodeBlockContentRoot === contentRoot) {
        lastActiveCodeBlockContentRoot = null
      }
    }

    const handleDocumentSelectAll = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "a") return
      const activeElement = document.activeElement
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement ?? null
      const isInsideCodeBlock =
        (activeElement instanceof Element && contentRoot.contains(activeElement)) ||
        (anchorElement instanceof Element && contentRoot.contains(anchorElement)) ||
        (lastActiveCodeBlockContentRoot === contentRoot && contentRoot.isConnected)
      if (!isInsideCodeBlock) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (selectCurrentCodeBlockText()) {
        ensureCodeDomTextSelection(contentRoot)
        return
      }
      selectDomTextContents(contentRoot)
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
      if (lastActiveCodeBlockContentRoot === contentRoot) {
        lastActiveCodeBlockContentRoot = null
      }
    }
  }, [ensureCodeDomTextSelection, selectCurrentCodeBlockText, selected])

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

  const applyLanguage = (value: string) => {
    const normalizedLanguage = normalizeCodeLanguage(value)
    setDraftLanguage(normalizedLanguage)
    rememberPreferredCodeLanguage(normalizedLanguage)
    updateAttributes({ language: normalizedLanguage || null })
    setIsLanguageMenuOpen(false)
    setLanguageSearch("")
  }

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

  const handleCodeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimarySelectAllShortcut(event)) return

    event.preventDefault()
    event.stopPropagation()

    const contentRoot = shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
    if (selectCurrentCodeBlockText()) {
      ensureCodeDomTextSelection(contentRoot)
      return
    }
    if (selectDomTextContents(contentRoot)) return

    if (typeof getPos !== "function") return
    const codeBlockPos = getPos()
    if (typeof codeBlockPos !== "number") return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, Math.max(0, codeBlockPos)))
    preserveWindowScrollForRichBlockSelectAll()
    editor.view.dispatch(tr)
    focusElementWithoutScroll(editor.view.dom as HTMLElement)
  }, [editor, getPos, ensureCodeDomTextSelection, selectCurrentCodeBlockText])

  return (
    <CodeBlockEditorWrapper data-selected={selected} data-code-block-wrapper="true">
      <CodeBlockEditorHeader data-code-block-header="true">
        <CodeWindowDots aria-hidden="true">
          <span data-tone="red" />
          <span data-tone="yellow" />
          <span data-tone="green" />
        </CodeWindowDots>
        <CodeLanguagePicker ref={menuRef}>
          <CodeLanguageButton
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isLanguageMenuOpen}
            aria-controls={`${menuId}-language-menu`}
            onClick={() => {
              setIsLanguageMenuOpen((prev) => !prev)
              setLanguageSearch("")
            }}
          >
            <span>{toLanguageLabel(draftLanguage)}</span>
            <AppIcon name="chevron-down" aria-hidden="true" />
          </CodeLanguageButton>
          {isLanguageMenuOpen ? (
            <CodeLanguagePopover id={`${menuId}-language-menu`} role="dialog" aria-label="코드 언어 선택">
              <CodeLanguageSearchInput
                ref={searchInputRef}
                value={languageSearch}
                placeholder="언어를 검색하세요"
                aria-label="언어 검색"
                onChange={(event) => setLanguageSearch(event.target.value)}
              />
              <CodeLanguageOptionList>
                {filteredLanguageOptions.map((option) => (
                  <CodeLanguageOptionButton
                    key={option.value}
                    type="button"
                    data-active={draftLanguage === option.value}
                    onClick={() => applyLanguage(option.value)}
                  >
                    <span>{option.label}</span>
                    {draftLanguage === option.value ? <AppIcon name="check-circle" aria-hidden="true" /> : null}
                  </CodeLanguageOptionButton>
                ))}
                {languageSearch.trim() && !exactSearchMatch ? (
                  <CodeLanguageOptionButton type="button" onClick={() => applyLanguage(languageSearch)}>
                    <span>{languageSearch.trim()}</span>
                    <small>직접 입력</small>
                  </CodeLanguageOptionButton>
                ) : null}
              </CodeLanguageOptionList>
            </CodeLanguagePopover>
          ) : null}
        </CodeLanguagePicker>
      </CodeBlockEditorHeader>
      <CodeBlockEditorSurface>
        <div
          ref={shellRef}
          className="aq-code-shell"
          onPointerDownCapture={() => {
            lastActiveCodeBlockContentRoot =
              shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
          }}
          onKeyDownCapture={handleCodeKeyDown}
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
