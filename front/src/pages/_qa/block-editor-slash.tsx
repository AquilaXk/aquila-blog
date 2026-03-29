import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import type { GetServerSideProps, NextPage } from "next"
import { useEffect, useState } from "react"

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

export const getServerSideProps: GetServerSideProps<QaBlockEditorSlashPageProps> = async () => {
  if (process.env.ENABLE_QA_ROUTES !== "true") {
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

  useEffect(() => {
    if (!router.isReady) return
    const seed = typeof router.query.seed === "string" ? router.query.seed : ""
    if (!seed) return
    setMarkdown(seed.replace(/\\n/g, "\n"))
  }, [router.isReady, router.query.seed])

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
        <strong>Block Editor Slash QA</strong>
        <span style={{ color: "#8b95a7", fontSize: "0.92rem" }}>
          slash command 상호작용 검증용 로컬 페이지
        </span>
      </header>

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
        })}
        enableMermaidBlocks={true}
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
