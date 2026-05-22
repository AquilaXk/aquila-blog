import styled from "@emotion/styled"
import { InputRule, Mark, Node, mergeAttributes } from "@tiptap/core"
import ListKeymap from "@tiptap/extension-list-keymap"
import ListItem from "@tiptap/extension-list-item"
import { Table } from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import { NodeViewContent, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import AppIcon from "src/components/icons/AppIcon"
import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { CalloutKind } from "src/libs/markdown/rendering"
import { clampImageWidthPx, normalizeImageAlign } from "src/libs/markdown/rendering"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"
import FormulaRender from "src/libs/markdown/FormulaRender"
import { TABLE_MIN_ROW_HEIGHT_PX } from "src/libs/markdown/tableMetadata"
import {
  formatReadableFileSize,
  inferLinkProvider,
  resolveEmbedPreviewUrl,
} from "src/libs/unfurl/extractMeta"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"
import type {
  BookmarkBlockAttrs,
  EmbedBlockAttrs,
  FileBlockAttrs,
  FormulaBlockAttrs,
  InlineFormulaAttrs,
} from "./serialization"

export { EditorCodeBlock, getPreferredCodeLanguage, normalizeCodeLanguage } from "./codeBlockNodeView"
export { MermaidBlock } from "./mermaidNodeView"

const RAW_BLOCK_REASON_LABELS: Record<string, string> = {
  "unsupported-mermaid": "Mermaid",
  "unsupported-callout": "콜아웃 원문 블록",
  "unsupported-toggle": "토글 원문 블록",
  "unsupported-table-alignment": "정렬 표 원문 블록",
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

const useAutosizeTextarea = (
  ref: { current: HTMLTextAreaElement | null },
  value: string,
  layoutVersion?: string | number | boolean
) => {
  const rafIdRef = useRef<number | null>(null)
  const metricsRef = useRef<{
    rows: number
    minHeightFromRows: number
  }>({
    rows: Number.NaN,
    minHeightFromRows: 0,
  })
  const previousLayoutVersionRef = useRef<string | number | boolean | undefined>(undefined)

  const cancelQueuedSync = useCallback(() => {
    if (typeof window === "undefined") return
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const syncHeight = useCallback((remeasureBase = false) => {
    const element = ref.current
    if (!element) return
    const rows = Number(element.getAttribute("rows") || 0)
    if (remeasureBase || metricsRef.current.rows !== rows) {
      const computedStyle = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight || "0")
      const paddingBlock =
        Number.parseFloat(computedStyle.paddingTop || "0") + Number.parseFloat(computedStyle.paddingBottom || "0")
      metricsRef.current = {
        rows,
        minHeightFromRows: rows > 0 && Number.isFinite(lineHeight) ? rows * lineHeight + paddingBlock : 0,
      }
    }
    element.style.height = "auto"
    element.style.height = `${Math.ceil(Math.max(element.scrollHeight + 6, metricsRef.current.minHeightFromRows + 6, 88))}px`
  }, [ref])

  const queueSyncHeight = useCallback((remeasureBase = false) => {
    cancelQueuedSync()
    if (typeof window === "undefined") return
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      syncHeight(remeasureBase)
    })
  }, [cancelQueuedSync, syncHeight])

  useLayoutEffect(() => {
    const remeasureBase = previousLayoutVersionRef.current !== layoutVersion
    previousLayoutVersionRef.current = layoutVersion
    syncHeight(remeasureBase)
    return cancelQueuedSync
  }, [cancelQueuedSync, layoutVersion, syncHeight, value])

  useEffect(() => {
    const element = ref.current
    if (!element || typeof window === "undefined") return

    const handleResize = () => queueSyncHeight(true)
    const handleFocus = () => queueSyncHeight(true)
    window.addEventListener("resize", handleResize)
    element.addEventListener("focus", handleFocus)
    element.addEventListener("click", handleFocus)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        queueSyncHeight(true)
      })
      if (element.parentElement) observer.observe(element.parentElement)
      observer.observe(element)
    }

    const fontSet = document.fonts
    let disposed = false
    if (fontSet?.ready) {
      void fontSet.ready.then(() => {
        if (!disposed) queueSyncHeight()
      })
    }

    return () => {
      disposed = true
      window.removeEventListener("resize", handleResize)
      element.removeEventListener("focus", handleFocus)
      element.removeEventListener("click", handleFocus)
      observer?.disconnect()
      cancelQueuedSync()
    }
  }, [cancelQueuedSync, queueSyncHeight, ref, value, layoutVersion])
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

export const InlineColorMark = Mark.create({
  name: "inlineColor",
  excludes: "inlineColor code",

  addAttributes() {
    return {
      color: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-inline-color]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken(
            (element as HTMLElement).getAttribute("data-inline-color") || ""
          )
          return color ? { color } : false
        },
      },
      {
        tag: "span[style]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken((element as HTMLElement).style.color || "")
          return color ? { color } : false
        },
      },
      {
        tag: "font[color]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken((element as HTMLElement).getAttribute("color") || "")
          return color ? { color } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const color = normalizeInlineColorToken(String(HTMLAttributes.color || ""))
    if (!color) return ["span", 0]

    const { color: _ignoredColor, style, ...rest } = HTMLAttributes
    const nextStyle = [style, `--aq-inline-color:${color}`, `color:${color}`].filter(Boolean).join("; ")

    return [
      "span",
      mergeAttributes(rest, {
        "data-inline-color": color,
        style: nextStyle,
      }),
      0,
    ]
  },
})

const CalloutBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftKind, setDraftKind] = useState<CalloutKind>((node.attrs?.kind as CalloutKind) || "tip")
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const pickerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pickerId = useId()
  const [isKindMenuOpen, setIsKindMenuOpen] = useState(false)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useEffect(() => {
    setDraftKind((node.attrs?.kind as CalloutKind) || "tip")
    setDraftTitle(String(node.attrs?.title || ""))
  }, [node.attrs?.kind, node.attrs?.title])

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

  const commit = (next: Partial<{ kind: CalloutKind; title: string }>) => {
    const nextAttrs = {
      kind: next.kind ?? draftKind,
      title: next.title ?? draftTitle,
    }
    scheduleCommit(nextAttrs)
  }

  const handleBodyKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimarySelectAllShortcut(event)) return

    event.preventDefault()
    event.stopPropagation()
    selectDomTextContents(bodyRef.current?.querySelector<HTMLElement>(".aq-callout-body-content__content") || null)
  }, [])

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
          <CalloutBodyContent
            ref={bodyRef}
            data-callout-body-content="true"
            onBlur={flushCommit}
            onKeyDownCapture={handleBodyKeyDown}
          >
            <NodeViewContent className="aq-callout-body-content__content" />
          </CalloutBodyContent>
        </CalloutEditorBody>
      </CalloutEditorCard>
    </CalloutEditorWrapper>
  )
}

const ToggleBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody, `${selected}-${isPreviewOpen}`)

  useEffect(() => {
    setDraftTitle(String(node.attrs?.title || ""))
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
          data-testid="toggle-block-summary"
          onClick={(event) => {
            event.preventDefault()
            setIsPreviewOpen((prev) => !prev)
          }}
        >
          <ToggleSummaryInner>
            <ToggleChevron data-testid="toggle-block-chevron" data-open={isPreviewOpen} aria-hidden="true" />
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

type LinkCardEditorProps = NodeViewProps & {
  kindLabel: string
  urlPlaceholder: string
  titlePlaceholder: string
  bodyPlaceholder: string
  bodyKey: "description" | "caption"
}

const LinkCardEditorView = ({
  node,
  updateAttributes,
  selected,
  kindLabel,
  urlPlaceholder,
  titlePlaceholder,
  bodyPlaceholder,
  bodyKey,
}: LinkCardEditorProps) => {
  const [draftUrl, setDraftUrl] = useState(String(node.attrs?.url || ""))
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || node.attrs?.name || ""))
  const [draftBody, setDraftBody] = useState(
    String(node.attrs?.description || node.attrs?.caption || "")
  )
  const [draftSiteName, setDraftSiteName] = useState(String(node.attrs?.siteName || ""))
  const [draftProvider, setDraftProvider] = useState(String(node.attrs?.provider || ""))
  const [draftThumbnailUrl, setDraftThumbnailUrl] = useState(String(node.attrs?.thumbnailUrl || ""))
  const [draftEmbedUrl, setDraftEmbedUrl] = useState(String(node.attrs?.embedUrl || ""))
  const [isUnfurling, setIsUnfurling] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody, selected)

  useEffect(() => {
    setDraftUrl(String(node.attrs?.url || ""))
    setDraftTitle(String(node.attrs?.title || node.attrs?.name || ""))
    setDraftBody(String(node.attrs?.description || node.attrs?.caption || ""))
    setDraftSiteName(String(node.attrs?.siteName || ""))
    setDraftProvider(String(node.attrs?.provider || ""))
    setDraftThumbnailUrl(String(node.attrs?.thumbnailUrl || ""))
    setDraftEmbedUrl(String(node.attrs?.embedUrl || ""))
  }, [
    node.attrs?.caption,
    node.attrs?.description,
    node.attrs?.embedUrl,
    node.attrs?.name,
    node.attrs?.provider,
    node.attrs?.siteName,
    node.attrs?.thumbnailUrl,
    node.attrs?.title,
    node.attrs?.url,
  ])

  const commit = (
    next: Partial<
      Record<
        "url" | "title" | "name" | "description" | "caption" | "siteName" | "provider" | "thumbnailUrl" | "embedUrl",
        string
      >
    >
  ) => {
    scheduleCommit({
      url: next.url ?? draftUrl,
      title: next.title ?? draftTitle,
      name: next.name ?? draftTitle,
      [bodyKey]: next[bodyKey] ?? draftBody,
      siteName: next.siteName ?? draftSiteName,
      provider: next.provider ?? draftProvider,
      thumbnailUrl: next.thumbnailUrl ?? draftThumbnailUrl,
      embedUrl: next.embedUrl ?? draftEmbedUrl,
    })
  }

  const hydrateFromUrl = async (force = false) => {
    const trimmedUrl = draftUrl.trim()
    if (!trimmedUrl || isUnfurling) return
    if (!force && draftTitle.trim() && draftBody.trim()) return

    setIsUnfurling(true)
    try {
      const response = await fetch(`/api/editor/unfurl?url=${encodeURIComponent(trimmedUrl)}`)
      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload?.data) return

      const nextTitle = force || !draftTitle.trim() ? String(payload.data.title || "").trim() : draftTitle
      const nextBody =
        force || !draftBody.trim() ? String(payload.data.description || "").trim() : draftBody
      const nextSiteName = String(payload.data.siteName || "").trim()
      const nextProvider = String(payload.data.provider || "").trim()
      const nextThumbnailUrl = String(payload.data.thumbnailUrl || "").trim()
      const nextEmbedUrl = String(payload.data.embedUrl || "").trim()

      if (nextTitle) setDraftTitle(nextTitle)
      if (nextBody) setDraftBody(nextBody)
      setDraftSiteName(nextSiteName)
      setDraftProvider(nextProvider)
      setDraftThumbnailUrl(nextThumbnailUrl)
      setDraftEmbedUrl(nextEmbedUrl)
      commit({
        url: trimmedUrl,
        title: nextTitle || draftTitle,
        name: nextTitle || draftTitle,
        [bodyKey]: nextBody || draftBody,
        siteName: nextSiteName,
        provider: nextProvider,
        thumbnailUrl: nextThumbnailUrl,
        embedUrl: nextEmbedUrl,
      })
    } finally {
      setIsUnfurling(false)
    }
  }

  const previewLabel = draftProvider || draftSiteName || inferLinkProvider(draftUrl)
  const previewEmbedUrl = bodyKey === "caption" ? draftEmbedUrl || resolveEmbedPreviewUrl(draftUrl) : ""

  return (
    <LinkCardEditorWrapper data-selected={selected}>
      <LinkCardEditorHeader>
        <strong>{kindLabel}</strong>
        <ChecklistActionButton type="button" onClick={() => void hydrateFromUrl(true)} disabled={isUnfurling}>
          {isUnfurling ? "불러오는 중..." : "메타 불러오기"}
        </ChecklistActionButton>
      </LinkCardEditorHeader>
      <LinkCardFieldInput
        value={draftUrl}
        placeholder={urlPlaceholder}
        onBlur={() => {
          flushCommit()
          void hydrateFromUrl(false)
        }}
        onChange={(event) => {
          const nextUrl = event.target.value
          setDraftUrl(nextUrl)
          commit({ url: nextUrl })
        }}
      />
      <LinkCardFieldInput
        value={draftTitle}
        placeholder={titlePlaceholder}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextTitle = event.target.value
          setDraftTitle(nextTitle)
          commit({ title: nextTitle, name: nextTitle })
        }}
      />
      <LinkCardTextarea
        ref={bodyRef}
        value={draftBody}
        rows={2}
        placeholder={bodyPlaceholder}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextBody = event.target.value
          setDraftBody(nextBody)
          commit({ [bodyKey]: nextBody })
        }}
      />
      {(previewLabel || draftThumbnailUrl || previewEmbedUrl) && draftUrl.trim() ? (
        <LinkCardPreview data-kind={bodyKey === "caption" ? "embed" : "bookmark"}>
          {draftThumbnailUrl ? (
            <LinkCardPreviewThumb aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draftThumbnailUrl} alt="" loading="lazy" decoding="async" />
            </LinkCardPreviewThumb>
          ) : null}
          <LinkCardPreviewCopy>
            {previewLabel ? <small>{previewLabel}</small> : null}
            <strong>{draftTitle || draftUrl}</strong>
            {draftBody ? <p>{draftBody}</p> : null}
            <span>{draftUrl}</span>
          </LinkCardPreviewCopy>
          {previewEmbedUrl ? (
            <LinkCardPreviewHint>지원 provider라 공개 페이지에서 인라인 임베드됩니다.</LinkCardPreviewHint>
          ) : null}
        </LinkCardPreview>
      ) : null}
    </LinkCardEditorWrapper>
  )
}

const BookmarkBlockView = (props: NodeViewProps) => (
  <LinkCardEditorView
    {...props}
    kindLabel="북마크"
    urlPlaceholder="https://example.com"
    titlePlaceholder="링크 제목"
    bodyPlaceholder="설명"
    bodyKey="description"
  />
)

const EmbedBlockView = (props: NodeViewProps) => (
  <LinkCardEditorView
    {...props}
    kindLabel="임베드"
    urlPlaceholder="https://www.youtube.com/watch?v=..."
    titlePlaceholder="임베드 제목"
    bodyPlaceholder="캡션"
    bodyKey="caption"
  />
)

const FileBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftUrl, setDraftUrl] = useState(String(node.attrs?.url || ""))
  const [draftName, setDraftName] = useState(String(node.attrs?.name || ""))
  const [draftDescription, setDraftDescription] = useState(String(node.attrs?.description || ""))
  const [draftMimeType, setDraftMimeType] = useState(String(node.attrs?.mimeType || ""))
  const [draftSizeBytes, setDraftSizeBytes] = useState<number | null>(
    typeof node.attrs?.sizeBytes === "number" && Number.isFinite(node.attrs.sizeBytes)
      ? Math.max(0, Math.round(node.attrs.sizeBytes))
      : null
  )
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftDescription, selected)

  useEffect(() => {
    setDraftUrl(String(node.attrs?.url || ""))
    setDraftName(String(node.attrs?.name || ""))
    setDraftDescription(String(node.attrs?.description || ""))
    setDraftMimeType(String(node.attrs?.mimeType || ""))
    setDraftSizeBytes(
      typeof node.attrs?.sizeBytes === "number" && Number.isFinite(node.attrs.sizeBytes)
        ? Math.max(0, Math.round(node.attrs.sizeBytes))
        : null
    )
  }, [node.attrs?.description, node.attrs?.mimeType, node.attrs?.name, node.attrs?.sizeBytes, node.attrs?.url])

  const commit = (next: Partial<FileBlockAttrs>) => {
    scheduleCommit({
      url: next.url ?? draftUrl,
      name: next.name ?? draftName,
      description: next.description ?? draftDescription,
      mimeType: next.mimeType ?? draftMimeType,
      sizeBytes: next.sizeBytes ?? draftSizeBytes,
    })
  }

  const fileMeta = [draftMimeType || "", formatReadableFileSize(draftSizeBytes)].filter(Boolean).join(" · ")

  return (
    <LinkCardEditorWrapper data-selected={selected}>
      <LinkCardEditorHeader>
        <strong>파일</strong>
      </LinkCardEditorHeader>
      <LinkCardFieldInput
        value={draftUrl}
        placeholder="https://example.com/files/spec.pdf"
        onBlur={flushCommit}
        onChange={(event) => {
          const nextUrl = event.target.value
          setDraftUrl(nextUrl)
          commit({ url: nextUrl })
        }}
      />
      <LinkCardFieldInput
        value={draftName}
        placeholder="파일명"
        onBlur={flushCommit}
        onChange={(event) => {
          const nextName = event.target.value
          setDraftName(nextName)
          commit({ name: nextName })
        }}
      />
      <LinkCardTextarea
        ref={bodyRef}
        value={draftDescription}
        rows={2}
        placeholder="설명"
        onBlur={flushCommit}
        onChange={(event) => {
          const nextDescription = event.target.value
          setDraftDescription(nextDescription)
          commit({ description: nextDescription })
        }}
      />
      {(draftUrl || fileMeta) ? (
        <LinkCardPreview data-kind="file">
          <LinkCardPreviewCopy>
            {fileMeta ? <small>{fileMeta}</small> : null}
            <strong>{draftName || "첨부 파일"}</strong>
            {draftDescription ? <p>{draftDescription}</p> : null}
            {draftUrl ? <span>{draftUrl}</span> : null}
          </LinkCardPreviewCopy>
        </LinkCardPreview>
      ) : null}
    </LinkCardEditorWrapper>
  )
}

const FormulaBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftFormula, setDraftFormula] = useState(String(node.attrs?.formula || ""))
  const formulaRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(formulaRef, draftFormula, selected)

  useEffect(() => {
    setDraftFormula(String(node.attrs?.formula || ""))
  }, [node.attrs?.formula])

  return (
    <FormulaEditorWrapper data-selected={selected}>
      <FormulaEditorHeader>
        <strong>수식</strong>
        <span>LaTeX 스타일 원문을 입력합니다.</span>
      </FormulaEditorHeader>
      <FormulaEditorTextarea
        ref={formulaRef}
        value={draftFormula}
        rows={3}
        spellCheck={false}
        placeholder={"\\int_0^1 x^2 \\, dx"}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextFormula = event.target.value
          setDraftFormula(nextFormula)
          scheduleCommit({ formula: nextFormula })
        }}
      />
      <FormulaPreview aria-hidden="true">{draftFormula || "수식 미리보기"}</FormulaPreview>
      {draftFormula ? (
        <FormulaRenderedPreview aria-hidden="true">
          <FormulaRender formula={draftFormula} displayMode />
        </FormulaRenderedPreview>
      ) : null}
    </FormulaEditorWrapper>
  )
}

const InlineFormulaView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftFormula, setDraftFormula] = useState(String(node.attrs?.formula || ""))
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraftFormula(String(node.attrs?.formula || ""))
  }, [node.attrs?.formula])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = () => {
    updateAttributes({ formula: draftFormula.trim() })
    setEditing(false)
  }

  return (
    <InlineFormulaWrapper as="span" data-selected={selected}>
      <InlineFormulaChip
        type="button"
        contentEditable={false}
        onMouseDown={(event) => {
          event.preventDefault()
          setEditing(true)
        }}
        aria-label="인라인 수식 편집"
      >
        <FormulaRender formula={draftFormula || "x^2"} displayMode={false} />
      </InlineFormulaChip>
      {(editing || selected) && (
        <InlineFormulaPopover contentEditable={false}>
          <strong>인라인 수식</strong>
          <InlineFormulaInput
            ref={inputRef}
            value={draftFormula}
            spellCheck={false}
            placeholder="x^2 + y^2"
            onChange={(event) => setDraftFormula(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setDraftFormula(String(node.attrs?.formula || ""))
                setEditing(false)
              }
            }}
          />
        </InlineFormulaPopover>
      )}
    </InlineFormulaWrapper>
  )
}

const RawMarkdownBlockView = ({ node, selected }: NodeViewProps) => {
  const [copied, setCopied] = useState(false)
  const markdown = String(node.attrs?.markdown || "")
  const reason = String(node.attrs?.reason || "manual-raw")
  const helperText =
    reason === "manual-raw"
      ? "이 블록은 원문 보존 전용입니다. 일반 작성은 다른 블록을 사용하세요."
      : reason === "unsupported-mermaid"
        ? "이전 원문 보존 카드입니다. 블록을 다시 열면 Mermaid 편집 블록으로 전환할 수 있습니다."
      : "현재 편집기에서 안전하게 구조화할 수 없어 원문을 보존했습니다."
  const preview = markdown.trim() || "(빈 원문 블록)"

  const copyMarkdown = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
  }

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

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
        <RawBlockSummary>
          <p>{helperText}</p>
          <RawBlockActionButton type="button" onClick={() => void copyMarkdown()} disabled={!markdown.trim()}>
            {copied ? "원문 복사됨" : "원문 복사"}
          </RawBlockActionButton>
        </RawBlockSummary>
        <RawBlockPreview role="note">{preview}</RawBlockPreview>
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

export const EditorTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeightPx: {
        default: null,
        parseHTML: (element) => {
          const attrValue = element.getAttribute("data-row-height")
          const styleValue = element instanceof HTMLElement ? element.style.height : ""
          const parsedValue =
            Number.parseInt(attrValue || "", 10) || Number.parseInt(styleValue.replace(/px$/, ""), 10)

          return Number.isFinite(parsedValue) && parsedValue > 0
            ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, parsedValue)
            : null
        },
        renderHTML: (attributes) => {
          const rowHeightPx = Number.parseInt(String(attributes.rowHeightPx || ""), 10)
          if (!Number.isFinite(rowHeightPx) || rowHeightPx <= 0) return {}

          return {
            "data-row-height": Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx),
            style: `height: ${Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx)}px;`,
          }
        },
      },
    }
  },
})

const TABLE_CELL_BACKGROUND_PATTERN = /^.+$/

const buildStyledTableCellAttributes = () => ({
  textAlign: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.style.textAlign || element.getAttribute("data-text-align") || ""
      return value === "left" || value === "center" || value === "right" ? value : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const textAlign = String(attributes.textAlign || "")
      if (textAlign !== "left" && textAlign !== "center" && textAlign !== "right") return {}
      return {
        "data-text-align": textAlign,
        style: `text-align: ${textAlign};`,
      }
    },
  },
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value =
        element.style.backgroundColor || element.getAttribute("data-background-color") || ""
      return TABLE_CELL_BACKGROUND_PATTERN.test(value.trim()) ? value.trim() || null : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const backgroundColor = String(attributes.backgroundColor || "").trim()
      if (!backgroundColor) return {}
      return {
        "data-background-color": backgroundColor,
        style: `background-color: ${backgroundColor};`,
      }
    },
  },
})

export const EditorTableCell = TableCell.extend({
  content: "paragraph+",
  addAttributes() {
    return {
      ...this.parent?.(),
      ...buildStyledTableCellAttributes(),
    }
  },
})

export const EditorTableHeader = TableHeader.extend({
  content: "paragraph+",
  addAttributes() {
    return {
      ...this.parent?.(),
      ...buildStyledTableCellAttributes(),
    }
  },
})

export const EditorTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      overflowMode: {
        default: "normal",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-overflow-mode") || ""
          return value === "wide" ? "wide" : "normal"
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const overflowMode = String(attributes.overflowMode || "normal")
          if (overflowMode !== "wide") return {}
          return {
            "data-overflow-mode": "wide",
          }
        },
      },
    }
  },
  addExtensions() {
    return [EditorTableRow, EditorTableHeader, EditorTableCell]
  },
})

export const EditorTaskList = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-task-list": {
        default: "true",
      },
    }
  },
}).configure({
  HTMLAttributes: {
    "data-task-list": "true",
  },
})

export const EditorTaskItem = TaskItem.extend({
  draggable: true,
}).configure({
  nested: true,
  HTMLAttributes: {
    draggable: "true",
    "data-task-item": "true",
  },
})

export const EditorListItem = ListItem.extend({
  draggable: true,
}).configure({
  HTMLAttributes: {
    draggable: "true",
    "data-list-item": "true",
  },
})

export const EditorListKeymap = ListKeymap

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: "tip",
      },
      label: {
        default: null,
      },
      title: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout-block": "true" }), 0]
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
        default: "",
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

const createLinkCardBlock = (
  name: "bookmarkBlock" | "embedBlock" | "fileBlock",
  dataAttribute: string,
  view: (props: NodeViewProps) => JSX.Element
) =>
  Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    isolating: true,

    addAttributes() {
      return {
        url: {
          default: "",
        },
        title: {
          default: "",
        },
        name: {
          default: "",
        },
        description: {
          default: "",
        },
        caption: {
          default: "",
        },
        siteName: {
          default: "",
        },
        provider: {
          default: "",
        },
        thumbnailUrl: {
          default: "",
        },
        embedUrl: {
          default: "",
        },
        mimeType: {
          default: "",
        },
        sizeBytes: {
          default: null,
        },
      }
    },

    parseHTML() {
      return [{ tag: `div[${dataAttribute}]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { [dataAttribute]: "true" })]
    },

    addNodeView() {
      return ReactNodeViewRenderer(view)
    },
  })

export const BookmarkBlock = createLinkCardBlock("bookmarkBlock", "data-bookmark-block", BookmarkBlockView)

export const EmbedBlock = createLinkCardBlock("embedBlock", "data-embed-block", EmbedBlockView)

export const FileBlock = createLinkCardBlock("fileBlock", "data-file-block", FileBlockView)

export const FormulaBlock = Node.create({
  name: "formulaBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      formula: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-formula-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-formula-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaBlockView)
  },
})

export const InlineFormula = Node.create({
  name: "inlineFormula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      formula: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-inline-formula]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-inline-formula": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineFormulaView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(^|[\s([{])\$([^$\n]+)\$$/,
        handler: ({ chain, match, range }) => {
          const prefix = String(match[1] || "")
          const formula = String(match[2] || "").trim()
          if (!formula) return null

          const inlineContent = [
            ...(prefix ? [{ type: "text" as const, text: prefix }] : []),
            { type: "inlineFormula" as const, attrs: { formula } },
          ]

          chain().deleteRange(range).insertContentAt(range.from, inlineContent).run()
        },
      }),
    ]
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

const BlockTextarea = styled.textarea<{ rows?: number }>`
  min-height: ${({ rows }) => (rows ? `${Math.max(Number(rows) * 1.8, 6)}rem` : "6rem")};
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 0.95rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.92)")};
  color: ${({ theme }) => theme.colors.gray12};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.88rem;
  line-height: 1.6;
  padding: 1rem;
`

const CompactBlockTextarea = styled(BlockTextarea)`
  min-height: 4.5rem;
  padding: 0.9rem 1rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const CalloutEditorWrapper = styled(NodeViewWrapper)`
  --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
  --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
  --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
  --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  --ad-text: ${({ theme }) => (theme.scheme === "dark" ? "#e6edf6" : "#1f2937")};
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
  margin: 0.75rem 0;

  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  &[data-kind="tip"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  }

  &[data-kind="info"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
  }

  &[data-kind="warning"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#fb7185" : "#b42344")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.2)" : "#fdecef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.12)" : "#fff6f8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.38)" : "#e8a8b8")};
  }

  &[data-kind="outline"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#94a3b8" : "#475569")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "#eef2f6")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#f8fafc")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.34)" : "#c7d1dd")};
  }

  &[data-kind="example"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4ade80" : "#166534")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.2)" : "#e8f7ef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.12)" : "#f4fcf7")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.36)" : "#9fd9b4")};
  }

  &[data-kind="summary"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#a78bfa" : "#5b4ab8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.2)" : "#efecff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.12)" : "#f7f5ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.38)" : "#bfb3eb")};
  }
`

const CalloutEditorCard = styled.div`
  overflow: visible;
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
  border: 1px solid
    ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.12)")};
  border-radius: 999px;
  padding: 0 0.68rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.08)")};
  color: var(--ad-accent);
  font-size: 1rem;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;

  svg {
    width: 0.92rem;
    height: 0.92rem;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(255, 255, 255, 0.68)")};
  }

  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.12)")};
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray7 : "rgba(255, 255, 255, 0.18)")};
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
  border: 1px solid
    ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(30, 31, 36, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 14px 28px rgba(15, 23, 42, 0.12)" : "0 18px 36px rgba(0, 0, 0, 0.3)"};
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
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "#e5e7eb")};
  }

  &[data-active="true"],
  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray3 : "rgba(255, 255, 255, 0.08)")};
  }
`

const CalloutTitleInput = styled.input`
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ad-accent);
  font-size: ${articleTypographyScale.calloutTitleFontSize};
  font-weight: 700;
  line-height: ${articleTypographyScale.calloutTitleLineHeight};
  letter-spacing: -0.01em;

  &::placeholder {
    color: color-mix(in srgb, var(--ad-accent) 70%, transparent);
  }
`

const CalloutEditorBody = styled.div`
  padding: 1rem 1.15rem 1.05rem;
`

const CalloutBodyContent = styled.div`
  min-height: 5rem;
  color: var(--ad-text);
  cursor: text;

  .aq-callout-body-content__content {
    display: flex;
    flex-direction: column;
    gap: 0.62rem;
    min-height: 5rem;
    outline: none;
    color: inherit;
    font-size: ${articleTypographyScale.bodyFontSize};
    line-height: ${articleTypographyScale.bodyLineHeight};
  }

  .aq-callout-body-content__content > * {
    margin: 0;
  }

  .aq-callout-body-content__content p {
    font-size: inherit;
    line-height: inherit;
    color: inherit;
  }

  .aq-callout-body-content__content p:empty::before {
    content: "본문";
    color: var(--color-gray10);
  }

  .aq-callout-body-content__content ul,
  .aq-callout-body-content__content ol {
    margin: 0;
    padding-left: 1.1rem;
  }

  .aq-callout-body-content__content li,
  .aq-callout-body-content__content a,
  .aq-callout-body-content__content strong,
  .aq-callout-body-content__content em,
  .aq-callout-body-content__content code {
    color: inherit;
  }

  .aq-callout-body-content__content code {
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
  }

  @media (max-width: 768px) {
    .aq-callout-body-content__content {
      font-size: ${articleTypographyScale.bodyFontSizeMobile};
      line-height: ${articleTypographyScale.bodyLineHeightMobile};
    }

    .aq-callout-body-content__content code {
      font-size: ${articleTypographyScale.codeFontSizeMobile};
      line-height: ${articleTypographyScale.codeLineHeightMobile};
    }
  }
`

const ToggleEditorWrapper = styled(NodeViewWrapper)`
  margin: 1rem 0;
`

const ToggleEditorCard = styled.details`
  --toggle-caret-size: 0.94rem;
  --toggle-caret-hit: 1.38rem;
  --toggle-gap: 0.62rem;
  --toggle-summary-padding-x: 0.16rem;
  --toggle-indent: calc(var(--toggle-summary-padding-x) + var(--toggle-caret-hit) + var(--toggle-gap));
  margin: 0;

  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  summary {
    cursor: pointer;
    list-style: none;
    padding: 0.24rem var(--toggle-summary-padding-x);
    border-radius: 0.62rem;
    transition: background-color 140ms ease;
    user-select: none;
    -webkit-user-select: none;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      background: ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.12)"};
    }
  }
`

const ToggleSummaryInner = styled.div`
  display: flex;
  align-items: center;
  gap: var(--toggle-gap);
  min-height: 2.8rem;
`

const ToggleChevron = styled.span`
  width: var(--toggle-caret-hit);
  height: var(--toggle-caret-hit);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-gray10);
  line-height: 1;
  flex-shrink: 0;
  transition: color 140ms ease;

  &::before {
    content: "";
    width: var(--toggle-caret-size);
    height: var(--toggle-caret-size);
    background: currentColor;
    clip-path: polygon(26% 18%, 82% 50%, 26% 82%);
    transform-origin: center;
    transition: transform 140ms ease;
  }

  &[data-open="true"]::before {
    transform: rotate(90deg);
  }
`

const ToggleTitleInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 1.12rem;
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: -0.01em;
  padding: 0.16rem 0;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const ToggleEditorBody = styled.div`
  margin-top: 0.22rem;
  padding-left: var(--toggle-indent);
`

const ToggleBodyTextarea = styled(CompactBlockTextarea)`
  min-height: 5rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-gray11);
  font-family: inherit;
  font-size: 0.97rem;
  line-height: 1.7;
  padding: 0.06rem 0 0.08rem;
  resize: none;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const ChecklistActionButton = styled.button`
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.28)")};
  background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.08)" : "rgba(59, 130, 246, 0.12)")};
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue9 : "#dbeafe")};
  font-size: 0.76rem;
  font-weight: 700;
`

const LinkCardEditorWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  margin: 0.9rem 0;
  padding: 1rem 1.05rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(17, 19, 24, 0.94)")};

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.32)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(37, 99, 235, 0.16)" : "0 0 0 1px rgba(96, 165, 250, 0.12)"};
  }
`

const LinkCardEditorHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  strong {
    color: var(--color-gray12);
    font-size: 0.92rem;
    font-weight: 700;
  }
`

const LinkCardFieldInput = styled.input`
  min-height: 2.6rem;
  width: 100%;
  border-radius: 0.88rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.03)")};
  color: var(--color-gray12);
  font-size: 0.94rem;
  padding: 0 0.92rem;
`

const LinkCardTextarea = styled(CompactBlockTextarea)`
  min-height: 4.6rem;
  border-radius: 0.88rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.03)")};
  font-family: inherit;
  font-size: 0.92rem;
`

const LinkCardPreview = styled.div`
  display: grid;
  gap: 0.72rem;
  grid-template-columns: minmax(0, 120px) 1fr;
  align-items: start;
  padding: 0.84rem 0.9rem;
  border-radius: 0.92rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.025)")};

  &[data-kind="file"] {
    grid-template-columns: 1fr;
  }
`

const LinkCardPreviewThumb = styled.div`
  overflow: hidden;
  border-radius: 0.82rem;
  aspect-ratio: 16 / 10;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray3 : "rgba(255, 255, 255, 0.05)")};

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const LinkCardPreviewCopy = styled.div`
  display: grid;
  gap: 0.32rem;
  min-width: 0;

  small {
    color: var(--color-gray10);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  strong {
    color: var(--color-gray12);
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.45;
    word-break: break-word;
  }

  p {
    margin: 0;
    color: var(--color-gray11);
    font-size: 0.85rem;
    line-height: 1.58;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.78rem;
    line-height: 1.45;
    word-break: break-all;
  }
`

const LinkCardPreviewHint = styled.div`
  grid-column: 1 / -1;
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue9 : "#93c5fd")};
  font-size: 0.75rem;
  font-weight: 600;
`

const FormulaEditorWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  margin: 0.9rem 0;
  padding: 1rem 1.05rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(17, 19, 24, 0.94)")};

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.32)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(37, 99, 235, 0.16)" : "0 0 0 1px rgba(96, 165, 250, 0.12)"};
  }
`

const FormulaEditorHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;

  strong {
    color: var(--color-gray12);
    font-size: 0.92rem;
    font-weight: 700;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.76rem;
  }
`

const FormulaEditorTextarea = styled(CompactBlockTextarea)`
  min-height: 5rem;
  border-radius: 0.88rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.03)")};
`

const FormulaPreview = styled.div`
  padding: 0.9rem 1rem;
  border-radius: 0.88rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.03)")};
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#e5e7eb")};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.84rem;
  line-height: 1.65;
  white-space: pre-wrap;
`

const FormulaRenderedPreview = styled.div`
  padding: 1rem 1.05rem;
  border-radius: 0.88rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(10, 12, 16, 0.78)")};
  overflow-x: auto;

  .katex-display {
    margin: 0;
  }

  .aq-formula-fallback {
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#e5e7eb")};
  }
`

const InlineFormulaWrapper = styled(NodeViewWrapper)`
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
`

const InlineFormulaChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  min-height: 1.9rem;
  padding: 0.18rem 0.56rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.28)")};
  border-radius: 999px;
  background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.08)" : "rgba(59, 130, 246, 0.12)")};
  color: var(--color-gray12);
  cursor: pointer;

  .katex {
    font-size: 0.98rem;
  }
`

const InlineFormulaPopover = styled.span`
  position: absolute;
  left: 0;
  top: calc(100% + 0.45rem);
  z-index: 18;
  display: grid;
  gap: 0.42rem;
  min-width: 15rem;
  padding: 0.74rem;
  border-radius: 0.82rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.22)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 12px 24px rgba(15, 23, 42, 0.12)" : "0 18px 34px rgba(2, 6, 23, 0.28)"};

  strong {
    color: var(--color-gray11);
    font-size: 0.72rem;
    font-weight: 700;
  }
`

const InlineFormulaInput = styled.input`
  min-height: 2.3rem;
  width: 100%;
  border-radius: 0.72rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.04)")};
  color: var(--color-gray12);
  font-size: 0.9rem;
  padding: 0 0.78rem;
`

const RawBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 1.2rem 0;
  overflow: hidden;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 14px;
  background: transparent;
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 12px 24px rgba(15, 23, 42, 0.1)" : "0 18px 38px rgba(2, 6, 23, 0.34)"};

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
  background: ${({ theme }) =>
    theme.scheme === "light" ? `linear-gradient(180deg, ${theme.colors.gray2}, ${theme.colors.gray3})` : "linear-gradient(180deg, #3a3f59, #363b54)"};
  border-bottom: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};

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
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.1rem 1.15rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "#2b2d3a")};
`

const RawBlockSummary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;

  p {
    margin: 0;
    color: var(--color-gray10);
    font-size: 0.82rem;
    line-height: 1.55;
  }
`

const RawBlockActionButton = styled.button`
  min-height: 2.15rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? "rgba(217, 119, 6, 0.35)" : "rgba(255, 157, 98, 0.26)")};
  background: ${({ theme }) => (theme.scheme === "light" ? "rgba(245, 158, 11, 0.12)" : "rgba(255, 157, 98, 0.12)")};
  color: ${({ theme }) => (theme.scheme === "light" ? "#b45309" : "#ffbd93")};
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.9rem;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

const RawBlockPreview = styled.pre`
  margin: 0;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(11, 14, 20, 0.42)")};
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  padding: 0.95rem 1rem;
  white-space: pre-wrap;
  word-break: break-word;
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
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(18, 21, 26, 0.95)")};
  color: var(--color-gray10);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 0.85rem;

  &[data-active="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.42)" : "rgba(59, 130, 246, 0.54)")};
    background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.1)" : "rgba(37, 99, 235, 0.18)")};
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue9 : "#93c5fd")};
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
