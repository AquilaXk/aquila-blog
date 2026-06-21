import { Profiler } from "react"
import { RecoverableSurfaceBoundary } from "src/components/error/ErrorBoundary"
import { MarkdownEditor } from "src/components/markdown-editor/MarkdownEditor"

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
    <RecoverableSurfaceBoundary surface="editor" resetKey={canvasId}>
      <MarkdownEditor
        value={markdown}
        onChange={onMarkdownChange}
        onFlushMarkdownReady={onFlushMarkdownReady}
        onUploadImage={onImageUpload}
        disableMermaid={!mermaidEnabled}
        disabled={disabled}
      />
    </RecoverableSurfaceBoundary>
  </Profiler>
)
