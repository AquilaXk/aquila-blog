import { useCallback, useState } from "react"
import { WriterEditorHost } from "./WriterEditorHost"

const QA_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
const QA_EXTERNAL_POST_MARKDOWN = "# 선택 글 제목\n\n선택 글 본문\n\n선택 글 둘째 문단"

type QaEditorHarnessProps = {
  seedMarkdown: string
}

export const QaEditorHarness = ({ seedMarkdown }: QaEditorHarnessProps) => {
  const [markdown, setMarkdown] = useState(() => seedMarkdown)
  const [editorReady, setEditorReady] = useState(false)
  const [commitSamples, setCommitSamples] = useState<number[]>([])
  const [flushMarkdown, setFlushMarkdown] = useState<(() => string) | null>(null)

  const handleMarkdownChange = useCallback((nextMarkdown: string) => {
    setMarkdown(nextMarkdown)
  }, [])

  const handleFlushReady = useCallback((flush: (() => string) | null) => {
    setFlushMarkdown(() => flush)
    setEditorReady(Boolean(flush))
  }, [])

  const handleCommitDuration = useCallback((actualDuration: number) => {
    setCommitSamples((samples) => [...samples.slice(-24), actualDuration])
    if (typeof window === "undefined") return
    const runtime = (window as unknown as {
      __AQ_RUNTIME_GUARD__?: { editorCommitSamples?: number[] }
    }).__AQ_RUNTIME_GUARD__
    if (!runtime) return
    runtime.editorCommitSamples = [...(runtime.editorCommitSamples ?? []), actualDuration]
  }, [])

  const handleExternalPostSelect = useCallback(() => {
    setMarkdown(QA_EXTERNAL_POST_MARKDOWN)
  }, [])

  const currentMarkdown = flushMarkdown?.() ?? markdown

  return (
    <main
      style={{
        display: "grid",
        gap: "1.25rem",
        maxWidth: "88rem",
        margin: "0 auto",
        padding: "2rem 1.25rem 4rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.25rem" }}>
        <strong>GitHub Markdown editor QA</strong>
        <span style={{ color: "#8b95a7", fontSize: "0.92rem" }}>
          작성 화면과 같은 Markdown editor, toolbar, preview 렌더링 경로를 검증합니다.
        </span>
      </header>

      <section style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
        <button type="button" onClick={handleExternalPostSelect}>
          QA 외부 글 선택
        </button>
        <button type="button" onClick={() => setMarkdown(`${currentMarkdown}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`)}>
          QA 표 추가
        </button>
        <button type="button" onClick={() => setMarkdown(`${currentMarkdown}\n\n\`\`\`js\nconsole.log("qa")\n\`\`\`\n`)}>
          QA 코드 추가
        </button>
      </section>

      <WriterEditorHost
        canvasId="qa-github-markdown-editor"
        markdown={markdown}
        onMarkdownChange={handleMarkdownChange}
        onFlushMarkdownReady={handleFlushReady}
        onImageUpload={async () => ({
          src: QA_IMAGE_DATA_URL,
          alt: "qa-image",
          title: "qa-image",
        })}
        mermaidEnabled={true}
        onCommitDuration={handleCommitDuration}
      />
      {editorReady ? <div data-testid="qa-editor-ready" hidden /> : null}

      <section style={{ display: "grid", gap: "0.45rem" }}>
        <strong>Markdown output</strong>
        <pre
          data-testid="qa-markdown-output"
          style={{
            margin: 0,
            padding: "1rem",
            borderRadius: "0.9rem",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            background: "rgba(15, 23, 42, 0.72)",
            color: "#e5e7eb",
            fontSize: "0.85rem",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {currentMarkdown || "(empty)"}
        </pre>
        <small style={{ color: "#64748b" }}>
          commit samples: {commitSamples.length}
        </small>
      </section>
    </main>
  )
}
