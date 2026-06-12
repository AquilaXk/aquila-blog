
import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import {
  formatReadableFileSize,
  inferLinkProvider,
  resolveEmbedPreviewUrl,
} from "src/libs/unfurl/extractMeta"
import type { FileBlockAttrs } from "./serialization"
import {
  CompactBlockTextarea,
  useAutosizeTextarea,
  useDebouncedAttributeCommit,
} from "./editorNodeViewShared"

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
  editor,
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
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(
    updateAttributes,
    undefined,
    editor.view.dom
  )

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

export const LinkCardNodeViewStyles = {
  ChecklistActionButton,
  LinkCardEditorWrapper,
  LinkCardEditorHeader,
  LinkCardFieldInput,
  LinkCardTextarea,
  LinkCardPreview,
  LinkCardPreviewThumb,
  LinkCardPreviewCopy,
  LinkCardPreviewHint,
}
