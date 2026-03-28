import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import CodeBlock from "@tiptap/extension-code-block"
import { NodeViewContent, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import AppIcon from "src/components/icons/AppIcon"
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import type { CalloutKind } from "src/libs/markdown/rendering"
import { clampImageWidthPx, normalizeImageAlign, toLanguageLabel } from "src/libs/markdown/rendering"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

const RAW_BLOCK_REASON_LABELS: Record<string, string> = {
  "unsupported-mermaid": "Mermaid 원문 블록",
  "unsupported-callout": "콜아웃 원문 블록",
  "unsupported-toggle": "토글 원문 블록",
  "manual-raw": "원문 블록",
}

const IMAGE_ALIGN_OPTIONS = [
  { value: "left", label: "좌측" },
  { value: "center", label: "가운데" },
  { value: "wide", label: "와이드" },
  { value: "full", label: "전체 폭" },
] as const

const CALLOUT_KIND_OPTIONS: Array<{ value: CalloutKind; label: string; emoji: string }> = [
  { value: "tip", label: "팁", emoji: "💡" },
  { value: "info", label: "안내", emoji: "ℹ️" },
  { value: "warning", label: "주의", emoji: "⚠️" },
  { value: "outline", label: "정리", emoji: "📋" },
  { value: "example", label: "예시", emoji: "✅" },
  { value: "summary", label: "요약", emoji: "📚" },
]

const DEFAULT_IMAGE_WIDTH = 720
const RESIZE_MIN_WIDTH = 240
const TEXTAREA_DEBOUNCE_MS = 180
const MERMAID_PREVIEW_ROOT_MARGIN = "240px 0px"
type CodeLanguageOption = {
  value: string
  label: string
  keywords?: string[]
}

const CODE_LANGUAGE_STORAGE_KEY = "aq.editor.preferredCodeLanguage"
let preferredCodeLanguage = "text"

const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = [
  { value: "text", label: "일반 텍스트", keywords: ["plain text", "plaintext"] },
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
const MERMAID_TEMPLATE = ["flowchart TD", "  A[사용자 요청] --> B{검증}", "  B -->|OK| C[처리]", "  B -->|Fail| D[오류 반환]"].join(
  "\n"
)

const useAutosizeTextarea = (ref: { current: HTMLTextAreaElement | null }, value: string) => {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = "0px"
    element.style.height = `${Math.max(element.scrollHeight, 88)}px`
  }, [ref, value])
}

const useDebouncedAttributeCommit = (
  updateAttributes: NodeViewProps["updateAttributes"],
  delay = TEXTAREA_DEBOUNCE_MS
) => {
  const debounceRef = useRef<number | null>(null)
  const latestAttrsRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const cancel = () => {
    if (typeof window !== "undefined" && debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  const flush = () => {
    if (!latestAttrsRef.current) return
    cancel()
    updateAttributes(latestAttrsRef.current)
    latestAttrsRef.current = null
  }

  const schedule = (attrs: Record<string, unknown>) => {
    latestAttrsRef.current = attrs
    if (typeof window === "undefined") {
      updateAttributes(attrs)
      return
    }

    cancel()

    debounceRef.current = window.setTimeout(() => {
      if (latestAttrsRef.current) {
        updateAttributes(latestAttrsRef.current)
        latestAttrsRef.current = null
      }
      debounceRef.current = null
    }, delay)
  }

  return {
    schedule,
    flush,
    cancel,
  }
}

const MermaidBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftSource, setDraftSource] = useState(String(node.attrs?.source || MERMAID_TEMPLATE))
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRootRef = useRef<HTMLDivElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(textareaRef, draftSource)

  useEffect(() => {
    setDraftSource(String(node.attrs?.source || MERMAID_TEMPLATE))
  }, [node.attrs?.source])

  useEffect(() => {
    const target = previewRootRef.current
    if (!target || typeof window === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsPreviewVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: MERMAID_PREVIEW_ROOT_MARGIN }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const normalizedSource = useMemo(() => extractNormalizedMermaidSource(draftSource).trim(), [draftSource])
  useMermaidEffect(previewRootRef, `editor-mermaid:${normalizedSource}`, isPreviewVisible && normalizedSource.length > 0)

  return (
    <RichBlockWrapper data-selected={selected}>
      <RichBlockHeader>
        <div>
          <strong>Mermaid</strong>
        </div>
      </RichBlockHeader>
      <BlockTextarea
        ref={textareaRef}
        value={draftSource}
        spellCheck={false}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextValue = event.target.value
          setDraftSource(nextValue)
          scheduleCommit({ source: nextValue })
        }}
      />
      <MermaidPreviewCard ref={previewRootRef}>
        {normalizedSource ? (
          isPreviewVisible ? (
            <pre className="aq-mermaid" data-aq-mermaid="true" data-mermaid-rendered="pending">
              <code>{normalizedSource}</code>
              <div className="aq-mermaid-stage" />
            </pre>
          ) : (
            <MermaidPreviewPlaceholder>스크롤 구간에 들어오면 다이어그램 미리보기를 렌더합니다.</MermaidPreviewPlaceholder>
          )
        ) : (
          <MermaidPreviewPlaceholder>Mermaid 원문을 입력하면 다이어그램 미리보기가 표시됩니다.</MermaidPreviewPlaceholder>
        )}
      </MermaidPreviewCard>
    </RichBlockWrapper>
  )
}

const CodeBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [draftLanguage, setDraftLanguage] = useState(normalizeCodeLanguage(String(node.attrs?.language || "")))
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState("")

  useEffect(() => {
    setDraftLanguage(normalizeCodeLanguage(String(node.attrs?.language || "")))
  }, [node.attrs?.language])

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

  return (
    <CodeBlockEditorWrapper data-selected={selected}>
      <CodeBlockEditorHeader>
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
        <NodeViewContent className="aq-code-editor-content" />
      </CodeBlockEditorSurface>
    </CodeBlockEditorWrapper>
  )
}

const CalloutBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftKind, setDraftKind] = useState<CalloutKind>((node.attrs?.kind as CalloutKind) || "tip")
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerId = useId()
  const [isKindMenuOpen, setIsKindMenuOpen] = useState(false)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody)

  useEffect(() => {
    setDraftKind((node.attrs?.kind as CalloutKind) || "tip")
    setDraftTitle(String(node.attrs?.title || ""))
    setDraftBody(String(node.attrs?.body || ""))
  }, [node.attrs?.kind, node.attrs?.title, node.attrs?.body])

  useEffect(() => {
    if (!isKindMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && pickerRef.current?.contains(target)) return
      setIsKindMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setIsKindMenuOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isKindMenuOpen])

  const commit = (next: Partial<{ kind: CalloutKind; title: string; body: string }>) => {
    const nextAttrs = {
      kind: next.kind ?? draftKind,
      title: next.title ?? draftTitle,
      body: next.body ?? draftBody,
    }
    scheduleCommit(nextAttrs)
  }

  const activeKindOption =
    CALLOUT_KIND_OPTIONS.find((option) => option.value === draftKind) ?? CALLOUT_KIND_OPTIONS[0]

  return (
    <CalloutEditorWrapper data-selected={selected} data-kind={draftKind}>
      <CalloutEditorCard data-kind={draftKind}>
        <CalloutEditorHeader data-kind={draftKind}>
          <CalloutEmojiPicker ref={pickerRef}>
            <CalloutEmojiTrigger
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isKindMenuOpen}
              aria-controls={`${pickerId}-callout-kind-menu`}
              title={activeKindOption.label}
              onClick={() => setIsKindMenuOpen((prev) => !prev)}
            >
              <span aria-hidden="true">{activeKindOption.emoji}</span>
              <AppIcon name="chevron-down" aria-hidden="true" />
            </CalloutEmojiTrigger>
            {isKindMenuOpen ? (
              <CalloutEmojiPopover
                id={`${pickerId}-callout-kind-menu`}
                role="dialog"
                aria-label="콜아웃 종류 선택"
              >
                <CalloutEmojiOptionList role="listbox" aria-label="콜아웃 종류">
                  {CALLOUT_KIND_OPTIONS.map((option) => (
                    <CalloutEmojiOptionButton
                      key={option.value}
                      type="button"
                      data-active={draftKind === option.value}
                      onClick={() => {
                        setDraftKind(option.value)
                        commit({ kind: option.value })
                        setIsKindMenuOpen(false)
                      }}
                    >
                      <span className="emoji" aria-hidden="true">
                        {option.emoji}
                      </span>
                      <span className="label">{option.label}</span>
                      {draftKind === option.value ? <AppIcon name="check-circle" aria-hidden="true" /> : null}
                    </CalloutEmojiOptionButton>
                  ))}
                </CalloutEmojiOptionList>
              </CalloutEmojiPopover>
            ) : null}
          </CalloutEmojiPicker>
          <CalloutTitleInput
            value={draftTitle}
            placeholder="제목"
            onBlur={flushCommit}
            onChange={(event) => {
              const nextTitle = event.target.value
              setDraftTitle(nextTitle)
              commit({ title: nextTitle })
            }}
          />
        </CalloutEditorHeader>
        <CalloutEditorBody>
          <CalloutBodyTextarea
            ref={bodyRef}
            value={draftBody}
            placeholder="본문"
            spellCheck={false}
            rows={3}
            onBlur={flushCommit}
            onChange={(event) => {
              const nextBody = event.target.value
              setDraftBody(nextBody)
              commit({ body: nextBody })
            }}
          />
        </CalloutEditorBody>
      </CalloutEditorCard>
    </CalloutEditorWrapper>
  )
}

const ToggleBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || "제목"))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody)

  useEffect(() => {
    setDraftTitle(String(node.attrs?.title || "제목"))
    setDraftBody(String(node.attrs?.body || ""))
  }, [node.attrs?.title, node.attrs?.body])

  const commit = (next: Partial<{ title: string; body: string }>) => {
    scheduleCommit({
      title: next.title ?? draftTitle,
      body: next.body ?? draftBody,
    })
  }

  return (
    <ToggleEditorWrapper data-selected={selected}>
      <ToggleEditorCard open={isPreviewOpen} data-selected={selected}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            setIsPreviewOpen((prev) => !prev)
          }}
        >
          <ToggleSummaryInner>
            <ToggleChevron aria-hidden="true">{isPreviewOpen ? "▾" : "▸"}</ToggleChevron>
            <ToggleTitleInput
              value={draftTitle}
              placeholder="제목"
              onClick={(event) => event.stopPropagation()}
              onBlur={flushCommit}
              onChange={(event) => {
                const nextTitle = event.target.value
                setDraftTitle(nextTitle)
                commit({ title: nextTitle })
              }}
            />
          </ToggleSummaryInner>
        </summary>
        <ToggleEditorBody data-open={isPreviewOpen}>
          {isPreviewOpen ? (
            <ToggleBodyTextarea
              ref={bodyRef}
              value={draftBody}
              placeholder="본문"
              spellCheck={false}
              rows={3}
              onBlur={flushCommit}
              onChange={(event) => {
                const nextBody = event.target.value
                setDraftBody(nextBody)
                commit({ body: nextBody })
              }}
            />
          ) : null}
        </ToggleEditorBody>
      </ToggleEditorCard>
    </ToggleEditorWrapper>
  )
}

const RawMarkdownBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draft, setDraft] = useState(String(node.attrs?.markdown || ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const reason = String(node.attrs?.reason || "manual-raw")
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes, 220)

  useAutosizeTextarea(textareaRef, draft)

  useEffect(() => {
    setDraft(String(node.attrs?.markdown || ""))
  }, [node.attrs?.markdown])

  return (
    <RawBlockWrapper data-selected={selected}>
      <RawBlockHeader>
        <RawBlockToolbarLeft aria-hidden="true">
          <RawBlockDot data-tone="red" />
          <RawBlockDot data-tone="yellow" />
          <RawBlockDot data-tone="green" />
        </RawBlockToolbarLeft>
        <strong>{RAW_BLOCK_REASON_LABELS[reason] || "원문 블록"}</strong>
      </RawBlockHeader>
      <RawBlockBody>
        <RawBlockTextarea
          ref={textareaRef}
          value={draft}
          onBlur={flushCommit}
          onChange={(event) => {
            const nextValue = event.target.value
            setDraft(nextValue)
            scheduleCommit({ markdown: nextValue })
          }}
          spellCheck={false}
        />
      </RawBlockBody>
    </RawBlockWrapper>
  )
}

const ResizableImageView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const frameRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const draftWidthRef = useRef<number | null>(null)
  const [draftWidth, setDraftWidth] = useState<number | null>(null)

  const align = normalizeImageAlign(String(node.attrs?.align || "")) || "center"
  const persistedWidth =
    typeof node.attrs?.widthPx === "number" ? clampImageWidthPx(Number(node.attrs.widthPx)) : null
  const effectiveWidth = draftWidth ?? persistedWidth ?? DEFAULT_IMAGE_WIDTH

  useEffect(() => {
    if (!draggingRef.current) {
      setDraftWidth(null)
      draftWidthRef.current = null
    }
  }, [node.attrs?.widthPx])

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const commitDraftWidth = () => {
    const nextWidth = draftWidthRef.current ?? persistedWidth ?? DEFAULT_IMAGE_WIDTH
    setDraftWidth(null)
    draftWidthRef.current = null
    updateAttributes({ widthPx: clampImageWidthPx(nextWidth) })
  }

  const handlePointerMove = (event: PointerEvent) => {
    const activeDrag = draggingRef.current
    if (!activeDrag) return
    const frameWidth = frameRef.current?.clientWidth || DEFAULT_IMAGE_WIDTH
    const nextWidth = clampImageWidthPx(
      Math.min(
        frameWidth,
        Math.max(RESIZE_MIN_WIDTH, activeDrag.startWidth + (event.clientX - activeDrag.startX))
      )
    )
    draftWidthRef.current = nextWidth
    if (typeof window !== "undefined" && rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        setDraftWidth(draftWidthRef.current)
      })
    }
  }

  const finalizePointer = () => {
    draggingRef.current = null
    commitDraftWidth()
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", finalizePointer)
      window.removeEventListener("pointercancel", finalizePointer)
    }
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const frameWidth = frameRef.current?.clientWidth || DEFAULT_IMAGE_WIDTH
    draggingRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: Math.min(frameWidth, effectiveWidth),
    }

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", finalizePointer)
      window.addEventListener("pointercancel", finalizePointer)
    }
  }

  const imageStyle = useMemo(() => {
    const widthStyle =
      align === "full"
        ? "100%"
        : align === "wide"
          ? `min(100%, ${Math.max(effectiveWidth, 860)}px)`
          : `${effectiveWidth}px`

    return {
      width: widthStyle,
      maxWidth: "100%",
    }
  }, [align, effectiveWidth])

  return (
    <ImageBlockWrapper data-selected={selected} data-align={align}>
      <ImageToolbar>
        <ImageToolbarGroup>
          {IMAGE_ALIGN_OPTIONS.map((option) => (
            <ImageToolbarButton
              key={option.value}
              type="button"
              data-active={align === option.value}
              onClick={() => updateAttributes({ align: option.value })}
            >
              {option.label}
            </ImageToolbarButton>
          ))}
        </ImageToolbarGroup>
        <ImageToolbarMeta>{`${Math.round(effectiveWidth)}px`}</ImageToolbarMeta>
      </ImageToolbar>
      <ImageFrame ref={frameRef} data-align={align}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={String(node.attrs?.src || "")}
          alt={String(node.attrs?.alt || "")}
          title={String(node.attrs?.title || "")}
          style={imageStyle}
          draggable={false}
        />
        <ImageResizeHandle
          type="button"
          aria-label="이미지 폭 조절"
          onPointerDown={handleResizePointerDown}
        />
      </ImageFrame>
    </ImageBlockWrapper>
  )
}

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      source: {
        default: MERMAID_TEMPLATE,
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-mermaid-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-mermaid-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView)
  },
})

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: "tip",
      },
      title: {
        default: "",
      },
      body: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView)
  },
})

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: "더 보기",
      },
      body: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-toggle-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlockView)
  },
})

export const RawMarkdownBlock = Node.create({
  name: "rawMarkdownBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      markdown: {
        default: "",
      },
      reason: {
        default: "manual-raw",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-raw-markdown-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-raw-markdown-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownBlockView)
  },
})

export const ResizableImage = Node.create({
  name: "resizableImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: {
        default: "",
      },
      alt: {
        default: "",
      },
      title: {
        default: "",
      },
      widthPx: {
        default: null,
      },
      align: {
        default: "center",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-resizable-image]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-resizable-image": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

export const EditorCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})

const sharedTextareaStyles = ({ minHeight = "6rem" }: { minHeight?: string } = {}) => `
  min-height: ${minHeight};
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.95rem;
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.6;
  padding: 1rem;
`

const BlockInput = styled.input`
  min-height: 2.75rem;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.95rem;
  background: rgba(10, 12, 16, 0.92);
  color: var(--color-gray12);
  font-size: 0.94rem;
  font-weight: 600;
  padding: 0 1rem;
`

const BlockTextarea = styled.textarea<{ rows?: number }>`
  ${({ rows }) =>
    sharedTextareaStyles({ minHeight: rows ? `${Math.max(Number(rows) * 1.8, 6)}rem` : "6rem" })}
`

const CompactBlockTextarea = styled(BlockTextarea)`
  min-height: 4.5rem;
  padding: 0.9rem 1rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const RichBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 0.85rem 0;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.95rem;
  background: rgba(18, 21, 26, 0.72);
  padding: 0.82rem 0.88rem;

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.28);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.08);
  }
`

const RichBlockHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  strong {
    display: block;
    font-size: 0.86rem;
    color: var(--color-gray12);
  }
`

const MermaidPreviewCard = styled.div`
  min-height: 8rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.9rem;
  background: rgba(13, 15, 18, 0.96);
  padding: 0.7rem;

  .aq-mermaid {
    margin: 0;
  }
`

const CodeBlockEditorWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  overflow: visible;
  margin: 1rem 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: #2b2d3a;
  position: relative;
  z-index: 0;

  &[data-selected="true"] {
    border-color: rgba(148, 163, 184, 0.28);
    box-shadow: 0 0 0 1px rgba(226, 232, 240, 0.12);
  }
`

const CodeBlockEditorHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, #3a3f59, #363b54);
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
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #ff9d62;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0 0.8rem;
  text-transform: uppercase;

  svg {
    width: 0.95rem;
    height: 0.95rem;
    color: rgba(255, 255, 255, 0.62);
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(30, 31, 36, 0.98);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.3);
`

const CodeLanguageSearchInput = styled.input`
  min-height: 2.6rem;
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid rgba(59, 130, 246, 0.6);
  background: rgba(17, 24, 39, 0.88);
  color: var(--color-gray12);
  font-size: 0.96rem;
  padding: 0 0.95rem;
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

  small {
    color: var(--color-gray10);
    font-size: 0.76rem;
    font-weight: 700;
  }

  svg {
    width: 1rem;
    height: 1rem;
    color: #e5e7eb;
  }

  &[data-active="true"],
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

const CodeBlockEditorSurface = styled.div`
  overflow: hidden;
  border-radius: 0 0 14px 14px;

  .aq-code-editor-content {
    overflow: auto;
    padding: 1.05rem 1.18rem 1.6rem;
    background: transparent;
    color: #a9b7c6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 1.65;
    white-space: pre;
  }

  .aq-code-editor-content > div {
    display: block;
    min-height: 5rem;
    outline: none;
    white-space: pre;
  }
`

const MermaidPreviewPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  color: var(--color-gray10);
  font-size: 0.78rem;
  text-align: center;
`

const CalloutEditorWrapper = styled(NodeViewWrapper)`
  --ad-accent: #f6ad55;
  --ad-header-bg: rgba(246, 173, 85, 0.15);
  --ad-body-bg: rgba(246, 173, 85, 0.07);
  --ad-border: rgba(246, 173, 85, 0.26);
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
  margin: 0.75rem 0;

  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  &[data-kind="tip"] {
    --ad-accent: #f6ad55;
    --ad-header-bg: rgba(246, 173, 85, 0.15);
    --ad-body-bg: rgba(246, 173, 85, 0.07);
    --ad-border: rgba(246, 173, 85, 0.26);
  }

  &[data-kind="info"] {
    --ad-accent: #38bdf8;
    --ad-header-bg: rgba(56, 189, 248, 0.14);
    --ad-body-bg: rgba(56, 189, 248, 0.06);
    --ad-border: rgba(56, 189, 248, 0.24);
  }

  &[data-kind="warning"] {
    --ad-accent: #fb7185;
    --ad-header-bg: rgba(251, 113, 133, 0.15);
    --ad-body-bg: rgba(251, 113, 133, 0.07);
    --ad-border: rgba(251, 113, 133, 0.26);
  }

  &[data-kind="outline"] {
    --ad-accent: #94a3b8;
    --ad-header-bg: rgba(148, 163, 184, 0.14);
    --ad-body-bg: rgba(148, 163, 184, 0.06);
    --ad-border: rgba(148, 163, 184, 0.22);
  }

  &[data-kind="example"] {
    --ad-accent: #4ade80;
    --ad-header-bg: rgba(74, 222, 128, 0.14);
    --ad-body-bg: rgba(74, 222, 128, 0.06);
    --ad-border: rgba(74, 222, 128, 0.24);
  }

  &[data-kind="summary"] {
    --ad-accent: #818cf8;
    --ad-header-bg: rgba(129, 140, 248, 0.14);
    --ad-body-bg: rgba(129, 140, 248, 0.06);
    --ad-border: rgba(129, 140, 248, 0.24);
  }
`

const CalloutEditorCard = styled.div`
  overflow: hidden;
  border: 1px solid var(--ad-border);
  border-left: 8px solid var(--ad-accent);
  border-radius: 0.95rem;
  background: var(--ad-body-bg);
`

const CalloutEditorHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 3.3rem;
  padding: 0.7rem 1rem;
  background: var(--ad-header-bg);
  border-bottom: 1px solid var(--ad-border);
`

const CalloutEmojiPicker = styled.div`
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
`

const CalloutEmojiTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.32rem;
  min-width: 2.3rem;
  height: 2.3rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 0 0.68rem;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ad-accent);
  font-size: 1rem;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;

  svg {
    width: 0.92rem;
    height: 0.92rem;
    color: rgba(255, 255, 255, 0.68);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
  }
`

const CalloutEmojiPopover = styled.div`
  position: absolute;
  top: calc(100% + 0.55rem);
  left: 0;
  z-index: 40;
  min-width: 10.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(30, 31, 36, 0.98);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.3);
`

const CalloutEmojiOptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
`

const CalloutEmojiOptionButton = styled.button`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.7rem;
  min-height: 2.5rem;
  padding: 0 0.72rem;
  border: 0;
  border-radius: 0.75rem;
  background: transparent;
  color: var(--color-gray12);
  text-align: left;

  .emoji {
    font-size: 1rem;
    line-height: 1;
  }

  .label {
    font-size: 0.9rem;
    font-weight: 650;
  }

  svg {
    width: 0.98rem;
    height: 0.98rem;
    color: #e5e7eb;
  }

  &[data-active="true"],
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

const CalloutTitleInput = styled.input`
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ad-accent);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;

  &::placeholder {
    color: color-mix(in srgb, var(--ad-accent) 70%, transparent);
  }
`

const CalloutEditorBody = styled.div`
  padding: 1rem 1.15rem 1.05rem;
`

const CalloutBodyTextarea = styled(CompactBlockTextarea)`
  min-height: 5rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-gray12);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.65;
  padding: 0;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const ToggleEditorWrapper = styled(NodeViewWrapper)`
  margin: 1rem 0;
`

const ToggleEditorCard = styled.details`
  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  summary {
    cursor: pointer;
    list-style: none;
    padding: 0;

    &::-webkit-details-marker {
      display: none;
    }
  }
`

const ToggleSummaryInner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.45rem;
`

const ToggleChevron = styled.span`
  color: var(--color-gray10);
  font-size: 0.92rem;
  line-height: 1;
  flex-shrink: 0;
`

const ToggleTitleInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.5;
  padding: 0;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const ToggleEditorBody = styled.div`
  margin-top: 0.5rem;
`

const ToggleBodyTextarea = styled(CompactBlockTextarea)`
  min-height: 5.25rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-gray12);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.65;
  padding: 0;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const RawBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 1.2rem 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: transparent;
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.34);

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.08);
  }
`

const RawBlockHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  background: linear-gradient(180deg, #3a3f59, #363b54);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  strong {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ff9d62;
  }
`

const RawBlockToolbarLeft = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
`

const RawBlockDot = styled.span`
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);

  &[data-tone="red"] {
    background: #ff5f56;
  }

  &[data-tone="yellow"] {
    background: #ffbd2e;
  }

  &[data-tone="green"] {
    background: #27c93f;
  }
`

const RawBlockBody = styled.div`
  position: relative;
  background: #2b2d3a;
`

const RawBlockTextarea = styled(BlockTextarea)`
  min-height: 8rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-gray12);
  box-shadow: none;
  padding: 1.05rem 1.18rem 1.3rem;
`

const ImageBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1.25rem 0;
`

const ImageToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`

const ImageToolbarGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const ImageToolbarButton = styled.button`
  min-height: 2rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 21, 26, 0.95);
  color: var(--color-gray10);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.85rem;

  &[data-active="true"] {
    border-color: rgba(59, 130, 246, 0.54);
    background: rgba(37, 99, 235, 0.18);
    color: #93c5fd;
  }
`

const ImageToolbarMeta = styled.span`
  font-size: 0.82rem;
  color: var(--color-gray10);
`

const ImageFrame = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  padding-bottom: 1.1rem;

  &[data-align="left"] {
    justify-content: flex-start;
  }

  &[data-align="center"],
  &[data-align="wide"],
  &[data-align="full"] {
    justify-content: center;
  }

  img {
    display: block;
    border-radius: 1rem;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
    user-select: none;
  }
`

const ImageResizeHandle = styled.button`
  position: absolute;
  right: calc(50% - 1rem);
  bottom: 0;
  width: 2rem;
  height: 0.5rem;
  border: 0;
  border-radius: 999px;
  background: rgba(96, 165, 250, 0.92);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  cursor: ew-resize;
`
