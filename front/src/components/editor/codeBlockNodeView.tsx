import styled from "@emotion/styled"
import CodeBlock from "@tiptap/extension-code-block"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { NodeViewContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
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

type CodeLanguageOption = {
  value: string
  label: string
  keywords?: string[]
}

const CODE_LANGUAGE_STORAGE_KEY = "aq.editor.preferredCodeLanguage"
let preferredCodeLanguage = "text"

const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = [
  { value: "text", label: "TXT", keywords: ["plain text", "plaintext", "txt"] },
  { value: "bash", label: "Bash", keywords: ["shell", "sh"] },
  { value: "shell", label: "Shell", keywords: ["bash", "sh"] },
  { value: "javascript", label: "JavaScript", keywords: ["js"] },
  { value: "typescript", label: "TypeScript", keywords: ["ts"] },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML", keywords: ["yml"] },
  { value: "markdown", label: "Markdown", keywords: ["md"] },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python", keywords: ["py"] },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin", keywords: ["kt"] },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust", keywords: ["rs"] },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby", keywords: ["rb"] },
  { value: "swift", label: "Swift" },
  { value: "objectivec", label: "Objective-C", keywords: ["objc"] },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#", keywords: ["cs"] },
  { value: "matlab", label: "MATLAB" },
  { value: "powershell", label: "PowerShell", keywords: ["ps1"] },
  { value: "nix", label: "Nix" },
  { value: "dockerfile", label: "Dockerfile", keywords: ["docker"] },
  { value: "mermaid", label: "Mermaid" },
]

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  txt: "text",
  plaintext: "text",
  "plain-text": "text",
  "plain text": "text",
  md: "markdown",
  yml: "yaml",
  sh: "shell",
  kt: "kotlin",
  py: "python",
  ts: "typescript",
  js: "javascript",
}

export const normalizeCodeLanguage = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() || "text"
  return CODE_LANGUAGE_ALIASES[normalized] || normalized
}

export const getPreferredCodeLanguage = () => {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(CODE_LANGUAGE_STORAGE_KEY)
    if (stored?.trim()) {
      preferredCodeLanguage = normalizeCodeLanguage(stored)
    }
  }
  return preferredCodeLanguage
}

const rememberPreferredCodeLanguage = (value?: string | null) => {
  preferredCodeLanguage = normalizeCodeLanguage(value)
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CODE_LANGUAGE_STORAGE_KEY, preferredCodeLanguage)
  }
}

const isPrimarySelectAllShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.toLowerCase() === "a"
}

const selectDomTextContents = (root: HTMLElement | null) => {
  if (!root) return false
  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.selectNodeContents(root)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
  return true
}

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

  const selectCodeBlockText = useCallback(() => {
    if (typeof getPos !== "function") return false
    const codeBlockPos = getPos()
    if (typeof codeBlockPos !== "number") return false
    const from = codeBlockPos + 1
    const to = codeBlockPos + Math.max(1, node.nodeSize - 1)
    const nextSelection = TextSelection.create(editor.state.doc, from, to)
    editor.view.dispatch(editor.state.tr.setSelection(nextSelection).scrollIntoView())
    editor.view.focus()
    return true
  }, [editor, getPos, node.nodeSize])

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
        (anchorElement instanceof Element && contentRoot.contains(anchorElement))
      if (!isInsideCodeBlock) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (selectCodeBlockText()) return
      selectDomTextContents(contentRoot)
    }

    const observer = new MutationObserver(() => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncLiveCodeSource()
      })
    })

    document.addEventListener("keydown", handleDocumentSelectAll, true)
    observer.observe(contentRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      document.removeEventListener("keydown", handleDocumentSelectAll, true)
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [selectCodeBlockText, selected])

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

  const filteredLanguageOptions = useMemo(() => {
    const keyword = languageSearch.trim().toLowerCase()
    if (!keyword) return CODE_LANGUAGE_OPTIONS

    return CODE_LANGUAGE_OPTIONS.filter((option) => {
      const haystacks = [option.value, option.label, ...(option.keywords || [])]
      return haystacks.some((candidate) => candidate.toLowerCase().includes(keyword))
    })
  }, [languageSearch])

  const exactSearchMatch = filteredLanguageOptions.some(
    (option) => option.value === languageSearch.trim().toLowerCase()
  )

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

    const { selection } = editor.state
    let replaceRange: { from: number; to: number } | null = null

    if (selection instanceof NodeSelection && selection.node.type.name === "codeBlock") {
      replaceRange = {
        from: selection.from + 1,
        to: selection.to - 1,
      }
    } else {
      const { $from } = selection
      for (let depth = $from.depth; depth >= 0; depth -= 1) {
        if ($from.node(depth).type.name !== "codeBlock") continue
        replaceRange = {
          from: selection.from,
          to: selection.to,
        }
        break
      }
    }

    if (!replaceRange && typeof getPos === "function") {
      const codeBlockPos = getPos()
      if (typeof codeBlockPos === "number") {
        replaceRange = {
          from: codeBlockPos + 1,
          to: codeBlockPos + node.nodeSize - 1,
        }
      }
    }

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

    if (selectCodeBlockText()) return

    const contentRoot = shellRef.current?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
    if (selectDomTextContents(contentRoot)) return

    if (typeof getPos !== "function") return
    const codeBlockPos = getPos()
    if (typeof codeBlockPos !== "number") return
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, Math.max(0, codeBlockPos)))
    editor.view.dispatch(tr.scrollIntoView())
    editor.view.focus()
  }, [editor, getPos, selectCodeBlockText])

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
        <div ref={shellRef} className="aq-code-shell" onKeyDownCapture={handleCodeKeyDown} onPaste={handleCodePaste}>
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

const CodeBlockEditorWrapper = styled(NodeViewWrapper)`
  --aq-code-block-radius: 14px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  align-self: stretch;
  overflow: visible;
  margin: 1rem 0;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: var(--aq-code-block-radius);
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "#2b2d3a")};
  position: relative;
  z-index: 0;
  background-clip: padding-box;

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(148, 163, 184, 0.28)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(59, 130, 246, 0.18)" : "0 0 0 1px rgba(226, 232, 240, 0.12)"};
  }
`

const CodeBlockEditorHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  border-bottom: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) =>
    theme.scheme === "light" ? `linear-gradient(180deg, ${theme.colors.gray2}, ${theme.colors.gray3})` : "linear-gradient(180deg, #3a3f59, #363b54)"};
  border-top-left-radius: var(--aq-code-block-radius);
  border-top-right-radius: var(--aq-code-block-radius);
  overflow: visible;
`

const CodeWindowDots = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;

  span {
    width: 0.92rem;
    height: 0.92rem;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }

  span[data-tone="red"] {
    background: #ff5f56;
  }

  span[data-tone="yellow"] {
    background: #ffbd2e;
  }

  span[data-tone="green"] {
    background: #27c93f;
  }
`

const CodeLanguagePicker = styled.div`
  position: relative;
  justify-self: end;
  min-width: 0;
`

const CodeLanguageButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.1rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.12)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.04)")};
  color: #ff9d62;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0 0.8rem;
  text-transform: uppercase;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;

  svg {
    width: 0.95rem;
    height: 0.95rem;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(255, 255, 255, 0.62)")};
  }
`

const CodeLanguagePopover = styled.div`
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 40;
  width: min(20rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(30, 31, 36, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 14px 28px rgba(15, 23, 42, 0.12)" : "0 18px 36px rgba(0, 0, 0, 0.3)"};
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;
`

const CodeLanguageSearchInput = styled.input`
  min-height: 2.6rem;
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(59, 130, 246, 0.6)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(17, 24, 39, 0.88)")};
  color: var(--color-gray12);
  font-size: 0.96rem;
  padding: 0 0.95rem;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;
`

const CodeLanguageOptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 18rem;
  overflow-y: auto;
`

const CodeLanguageOptionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.6rem;
  border-radius: 0.75rem;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 0.96rem;
  font-weight: 600;
  padding: 0 0.7rem;
  text-align: left;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;

  small {
    color: var(--color-gray10);
    font-size: 0.76rem;
    font-weight: 700;
    -webkit-text-fill-color: currentColor;
    -webkit-text-security: none;
  }

  span {
    -webkit-text-fill-color: currentColor;
    -webkit-text-security: none;
  }

  svg {
    width: 1rem;
    height: 1rem;
    color: #e5e7eb;
  }

  &[data-active="true"],
  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray3 : "rgba(255, 255, 255, 0.08)")};
  }
`

const CodeBlockEditorSurface = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 0 0 var(--aq-code-block-radius) var(--aq-code-block-radius);

  .aq-code-shell {
    position: relative;
    display: grid;
    align-items: start;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
  }

  .aq-code-highlight-layer,
  .aq-code-editor-content {
    width: max-content;
    min-width: 100%;
    max-width: none;
    grid-area: 1 / 1;
    margin: 0;
    overflow: visible;
    padding: 1.05rem 1.18rem 1.6rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    white-space: pre;
  }

  .aq-code-highlight-layer {
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    background: transparent;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#a9b7c6")};

    .line {
      display: block;
      min-height: calc(0.88rem * 1.65);
    }

    .token.comment,
    .token.prolog,
    .token.doctype,
    .token.cdata {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#808b99" : "#6a7280")};
      font-style: italic;
    }

    .token.punctuation {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#a9b7c6" : "#495367")};
    }

    .token.property,
    .token.tag,
    .token.constant,
    .token.symbol,
    .token.deleted {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#b45309")};
    }

    .token.boolean,
    .token.number {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#6897bb" : "#1d4ed8")};
    }

    .token.selector,
    .token.attr-name,
    .token.string,
    .token.char,
    .token.builtin,
    .token.inserted {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#6aab73" : "#047857")};
    }

    .token.operator,
    .token.entity,
    .token.url,
    .token.variable {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#9876aa" : "#7c3aed")};
    }

    .token.atrule,
    .token.attr-value,
    .token.keyword,
    .token.annotation,
    .token.decorator {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#1d4ed8")};
      font-weight: 600;
    }

    .token.function,
    .token.class-name {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#ffc66d" : "#be185d")};
    }

    .token.regex,
    .token.important {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#bbb529" : "#92400e")};
    }
  }

  .aq-code-editor-content {
    position: relative;
    z-index: 1;
    background: transparent;
    color: transparent !important;
    caret-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray12 : "#f8fafc")};
    text-shadow: none;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content > div {
    display: block;
    min-height: 5rem;
    outline: none;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .aq-code-editor-content,
  .aq-code-editor-content * {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content::selection,
  .aq-code-editor-content *::selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content::-moz-selection,
  .aq-code-editor-content *::-moz-selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
  }

  @media (max-width: 768px) {
    .aq-code-highlight-layer,
    .aq-code-editor-content {
      font-size: 0.86rem;
      line-height: 1.54;
      padding: 0.86rem 0.74rem 1.1rem;
    }
  }
`

export const CodeBlockEditorStyles = {
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
}
