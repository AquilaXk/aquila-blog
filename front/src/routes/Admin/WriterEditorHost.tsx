import dynamic from "next/dynamic"
import { Profiler } from "react"
import type {
  BlockEditorFeatureOptions,
  BlockEditorProps,
  BlockEditorUploadAdapters,
} from "src/components/editor/blockEditorContract"

const LazyBlockEditorShell = dynamic(() => import("src/components/editor/BlockEditorShell"), {
  ssr: false,
  loading: () => <div style={{ padding: "1rem 1.1rem", color: "var(--color-gray10)" }}>블록 에디터 준비 중...</div>,
})

type WriterEditorHostProps = Pick<BlockEditorProps, "disabled"> & {
  canvasId: string
  markdown: string
  onMarkdownChange: BlockEditorProps["onChange"]
  onImageUpload: BlockEditorUploadAdapters["onUploadImage"]
  onFileUpload?: BlockEditorUploadAdapters["onUploadFile"]
  mermaidEnabled: NonNullable<BlockEditorFeatureOptions["enableMermaidBlocks"]>
  onCommitDuration?: (actualDuration: number) => void
}

export const WriterEditorHost = ({
  canvasId,
  markdown,
  onMarkdownChange,
  onImageUpload,
  onFileUpload,
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
    <LazyBlockEditorShell
      className="aq-block-editor--writer-surface"
      value={markdown}
      onChange={onMarkdownChange}
      onUploadImage={onImageUpload}
      onUploadFile={onFileUpload}
      enableMermaidBlocks={mermaidEnabled}
      disabled={disabled}
    />
  </Profiler>
)
