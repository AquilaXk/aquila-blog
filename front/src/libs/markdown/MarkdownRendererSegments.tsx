import type { ReactNode } from "react"
import type { MarkdownSegment } from "src/libs/markdown/rendering"
import FormulaRender from "src/libs/markdown/FormulaRender"
import { MarkdownImageFigure } from "src/libs/markdown/MarkdownRendererImage"
import type { MarkdownImageWidthCommitPayload } from "src/libs/markdown/MarkdownRenderer.types"
import { formatReadableFileSize, inferLinkProvider, resolveEmbedPreviewUrl } from "src/libs/unfurl/extractMeta"

type RenderMarkdownBlock = (markdown: string, key: string, inCallout?: boolean, inlineOnly?: boolean) => ReactNode

type RenderMarkdownSegmentPayload = {
  segment: MarkdownSegment
  index: number
  imageIndex: number
  editableImages: boolean
  onImageWidthCommit?: (payload: MarkdownImageWidthCommitPayload) => void
  renderMarkdown: RenderMarkdownBlock
}

export const renderMarkdownSegment = ({
  segment,
  index,
  imageIndex,
  editableImages,
  onImageWidthCommit,
  renderMarkdown,
}: RenderMarkdownSegmentPayload) => {
  if (segment.type === "toggle") {
    return (
      <details className="aq-toggle" key={`toggle-${index}`}>
        <summary>
          <span className="aq-toggle__caret" aria-hidden="true" />
          <span className="aq-toggle__title">{segment.title}</span>
        </summary>
        <div className="aq-toggle__body">{renderMarkdown(segment.content, `toggle-body-${index}`)}</div>
      </details>
    )
  }

  if (segment.type === "callout") {
    return (
      <div
        key={`callout-${index}`}
        className={`aq-callout aq-callout-box aq-admonition aq-admonition-${segment.kind}`}
      >
        <div className="aq-callout-box-text">
          <div className="aq-callout-head" data-has-title={segment.title ? "true" : "false"}>
            <span className="aq-callout-emoji" aria-hidden="true">
              {segment.emoji}
            </span>
            {segment.title ? <strong className="aq-callout-title">{segment.title}</strong> : null}
          </div>
          {renderMarkdown(segment.content, `callout-body-${index}`, true)}
        </div>
      </div>
    )
  }

  if (segment.type === "bookmark") {
    const providerLabel = segment.provider || segment.siteName || inferLinkProvider(segment.url)
    return (
      <div key={`bookmark-${index}`} className="aq-bookmark-card">
        <a href={segment.url} target="_blank" rel="noreferrer">
          {segment.thumbnailUrl ? (
            <div className="aq-link-card-thumb" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={segment.thumbnailUrl} alt="" loading="lazy" decoding="async" />
            </div>
          ) : null}
          <div className="aq-link-card-copy">
            {providerLabel ? <small>{providerLabel}</small> : null}
            <strong>{segment.title || segment.url}</strong>
            <span>{segment.url}</span>
            {segment.description ? <p>{segment.description}</p> : null}
          </div>
        </a>
      </div>
    )
  }

  if (segment.type === "embed") {
    const previewUrl = segment.embedUrl || resolveEmbedPreviewUrl(segment.url)
    const providerLabel = segment.provider || segment.siteName || inferLinkProvider(segment.url)
    return (
      <div key={`embed-${index}`} className="aq-embed-card">
        <div className="aq-embed-header">
          <div className="aq-embed-copy">
            {providerLabel ? <small>{providerLabel}</small> : null}
            <strong>{segment.title || "임베드"}</strong>
          </div>
          <a href={segment.url} target="_blank" rel="noreferrer">
            원본 열기
          </a>
        </div>
        {previewUrl ? (
          <div className="aq-embed-frame">
            <iframe
              src={previewUrl}
              title={segment.title || segment.url}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="aq-embed-fallback">
            <p>이 사이트는 인라인 임베드를 지원하지 않아 링크 카드로 대체했습니다.</p>
          </div>
        )}
        {segment.thumbnailUrl && !previewUrl ? (
          <div className="aq-embed-thumb" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={segment.thumbnailUrl} alt="" loading="lazy" decoding="async" />
          </div>
        ) : null}
        {segment.caption ? <p className="aq-embed-caption">{segment.caption}</p> : null}
      </div>
    )
  }

  if (segment.type === "file") {
    const meta = [segment.mimeType || "", formatReadableFileSize(segment.sizeBytes)].filter(Boolean).join(" · ")
    return (
      <div key={`file-${index}`} className="aq-file-card">
        <a href={segment.url} target="_blank" rel="noreferrer">
          <div className="aq-link-card-copy">
            {meta ? <small>{meta}</small> : null}
            <strong>{segment.name || "첨부 파일"}</strong>
            <span>{segment.url}</span>
          </div>
        </a>
        {segment.description ? <p>{segment.description}</p> : null}
      </div>
    )
  }

  if (segment.type === "formula") {
    return (
      <div key={`formula-${index}`} className="aq-formula-card">
        <FormulaRender className="aq-formula-render" formula={segment.formula} displayMode />
      </div>
    )
  }

  if (segment.type === "image") {
    return (
      <MarkdownImageFigure
        key={`image-${imageIndex}-${segment.src}`}
        alt={segment.alt}
        src={segment.src}
        widthPx={segment.widthPx}
        eager={imageIndex === 0}
        editable={editableImages}
        imageIndex={imageIndex}
        onWidthCommit={onImageWidthCommit}
      />
    )
  }

  return renderMarkdown(segment.content, `markdown-${index}`)
}
