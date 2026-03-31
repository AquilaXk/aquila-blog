import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import type { GetServerSideProps, NextPage } from "next"
import { useEffect, useRef, useState } from "react"
import type { BlockEditorQaActions } from "src/components/editor/BlockEditorShell"

const LazyBlockEditorShell = dynamic(() => import("src/components/editor/BlockEditorShell"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        padding: "1rem 1.1rem",
        borderRadius: "1rem",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(15, 23, 42, 0.52)",
        color: "#cbd5e1",
      }}
    >
      블록 에디터 준비 중...
    </div>
  ),
})

type QaBlockEditorSlashPageProps = {
  enabled: boolean
}

export const getServerSideProps: GetServerSideProps<QaBlockEditorSlashPageProps> = async (context) => {
  const host = String(context.req.headers.host || "").toLowerCase()
  const isLocalQaHost =
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host === "localhost" ||
    host === "127.0.0.1"
  const qaRoutesEnabled =
    process.env.ENABLE_QA_ROUTES === "true" || process.env.NODE_ENV !== "production" || isLocalQaHost
  if (!qaRoutesEnabled) {
    return { notFound: true }
  }

  return {
    props: {
      enabled: true,
    },
  }
}

const QA_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="

const QaBlockEditorSlashPage: NextPage<QaBlockEditorSlashPageProps> = () => {
  const router = useRouter()
  const [markdown, setMarkdown] = useState("")
  const qaActionsRef = useRef<BlockEditorQaActions | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    const seed = typeof router.query.seed === "string" ? router.query.seed : ""
    if (!seed) return
    setMarkdown(seed.replace(/\\n/g, "\n"))
  }, [router.isReady, router.query.seed])

  useEffect(() => {
    if (typeof window === "undefined") return
    ;(window as unknown as { __qaMoveTaskItemInFirstTaskList?: (sourceIndex: number, insertionIndex: number) => void }).__qaMoveTaskItemInFirstTaskList =
      (sourceIndex, insertionIndex) => {
        qaActionsRef.current?.moveTaskItemInFirstTaskList(sourceIndex, insertionIndex)
      }

    return () => {
      delete (window as unknown as { __qaMoveTaskItemInFirstTaskList?: (sourceIndex: number, insertionIndex: number) => void })
        .__qaMoveTaskItemInFirstTaskList
    }
  }, [])

  return (
    <main
      style={{
        display: "grid",
        gap: "1.25rem",
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "2rem 1.25rem 4rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.25rem" }}>
        <strong>BlockEditorShell 엔진 QA</strong>
        <span style={{ color: "#8b95a7", fontSize: "0.92rem" }}>
          slash, rail, table, serialization 같은 에디터 엔진 동작만 검증합니다.
        </span>
        <span style={{ color: "#64748b", fontSize: "0.82rem" }}>
          실제 글쓰기 화면 레이아웃과 제목 입력칸 회귀는 <code>/editor</code> 전용 테스트에서 검증합니다.
        </span>
      </header>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
        }}
      >
        <button type="button" onClick={() => qaActionsRef.current?.selectTableAxis("column")}>
          QA 열 선택
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.setActiveTableCellAlign("center")}>
          QA 가운데
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.setActiveTableCellBackground("#fef3c7")}>
          QA 노랑 배경
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.addTableRowAfter()}>
          QA 행 추가
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.addTableColumnAfter()}>
          QA 열 추가
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.deleteSelectedTableRow()}>
          QA 행 삭제
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.deleteSelectedTableColumn()}>
          QA 열 삭제
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.resizeFirstTableRow(28)}>
          QA 행 리사이즈
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.resizeFirstTableColumn(28)}>
          QA 열 리사이즈
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.focusDocumentEnd()}>
          QA 끝으로 이동
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.appendCalloutBlock()}>
          QA 콜아웃
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.appendFormulaBlock()}>
          QA 수식
        </button>
        <button type="button" onClick={() => qaActionsRef.current?.moveTaskItemInFirstTaskList(2, 0)}>
          QA Task 3→1
        </button>
      </section>

      <LazyBlockEditorShell
        value={markdown}
        onChange={(next) => setMarkdown(next)}
        onUploadImage={async () => ({
          src: QA_IMAGE_DATA_URL,
          alt: "qa-image",
          title: "qa-image",
          widthPx: 640,
          align: "center",
        })}
        onUploadFile={async (file) => ({
          url: `https://example.com/files/${encodeURIComponent(file.name)}`,
          name: file.name,
          description: "",
          mimeType: file.type || "",
          sizeBytes: file.size,
        })}
        enableMermaidBlocks={true}
        onQaActionsReady={(actions) => {
          qaActionsRef.current = actions
        }}
      />

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
          {markdown || "(empty)"}
        </pre>
      </section>
    </main>
  )
}

export default QaBlockEditorSlashPage
