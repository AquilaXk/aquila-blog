import { Profiler } from "react"
import { GitHubMarkdownEditor } from "src/components/markdown-editor/GitHubMarkdownEditor"

type WriterEditorHostProps = {
  canvasId: string
  markdown: string
  onMarkdownChange: (markdown: string, meta?: { editorFocused: boolean }) => void
  onFlushMarkdownReady: (flush: (() => string) | null) => void
  onImageUpload: (file: File) => Promise<{ alt?: string; title?: string; url?: string; src?: string }>
  onFileUpload?: (file: File) => Promise<unknown>
  mermaidEnabled: boolean
  disabled?: boolean
  onCommitDuration?: (actualDuration: number) => void
}

export const WriterEditorHost = ({
  canvasId,
  markdown,
  onMarkdownChange,
  onFlushMarkdownReady,
  onImageUpload,
  mermaidEnabled,
  disabled = false,
  onCommitDuration,
}: WriterEditorHostProps) => (
  <Profiler
    id={canvasId}
    onRender={(_id, _phase, actualDuration) => {
      onCommitDuration?.(actualDuration)
    }}
  >
    <GitHubMarkdownEditor
      value={markdown}
      onChange={onMarkdownChange}
      onFlushMarkdownReady={onFlushMarkdownReady}
      onUploadImage={onImageUpload}
      disableMermaid={!mermaidEnabled}
      disabled={disabled}
    />
  </Profiler>
)
