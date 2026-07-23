export type MarkdownImageWidthCommitPayload = {
  src: string
  alt: string
  index: number
  widthPx: number
}

export type MarkdownRendererProps = {
  content?: string
  contentHtml?: string
  disableMermaid?: boolean
  forceScheme?: "dark" | "light"
  editableImages?: boolean
  onImageWidthCommit?: (payload: MarkdownImageWidthCommitPayload) => void
}

export type MarkdownImageFigureProps = {
  alt: string
  src: string
  widthPx?: number
  eager?: boolean
  editable?: boolean
  imageIndex: number
  onWidthCommit?: (payload: MarkdownImageWidthCommitPayload) => void
}
