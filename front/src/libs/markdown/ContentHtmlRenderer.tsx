import { FC, useMemo, useRef } from "react"
import useInlineColorEffect from "src/libs/markdown/hooks/useInlineColorEffect"
import useMermaidEffect from "src/libs/markdown/hooks/useMermaidEffect"
import usePrismEffect from "src/libs/markdown/hooks/usePrismEffect"
import useResponsiveTableEffect from "src/libs/markdown/hooks/useResponsiveTableEffect"
import MarkdownRendererRoot from "src/libs/markdown/components/MarkdownRendererRoot"
import { normalizeContentHtmlForMermaid } from "src/libs/markdown/rendering"

type Props = {
  contentHtml?: string
  disableMermaid?: boolean
}

const hashString = (value: string) => {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}

const ContentHtmlRenderer: FC<Props> = ({ contentHtml, disableMermaid = false }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const resolvedContentHtml = useMemo(
    () => normalizeContentHtmlForMermaid(contentHtml?.trim() || ""),
    [contentHtml]
  )
  const renderKey = useMemo(
    () => `html:${resolvedContentHtml.length}:${hashString(resolvedContentHtml)}`,
    [resolvedContentHtml]
  )

  useMermaidEffect(rootRef, renderKey, !disableMermaid)
  useResponsiveTableEffect(rootRef, renderKey)
  useInlineColorEffect(rootRef, renderKey)
  usePrismEffect(rootRef, renderKey, true)

  if (!resolvedContentHtml) return <MarkdownRendererRoot>본문이 없습니다.</MarkdownRendererRoot>

  return (
    <MarkdownRendererRoot
      ref={rootRef}
      className="aq-markdown"
      dangerouslySetInnerHTML={{ __html: resolvedContentHtml }}
    />
  )
}

export default ContentHtmlRenderer
