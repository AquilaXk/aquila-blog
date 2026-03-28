import { expect, test } from "@playwright/test"
import {
  detectUnsupportedMarkdownBlocks,
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
} from "src/components/editor/serialization"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

test.describe("block editor serialization", () => {
  test("mermaid 블록은 parse/serialize round-trip을 유지한다", () => {
    const markdown = ["## 플로우", "", "```mermaid", "flowchart TD", "  A[시작] --> B[처리]", "```"].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    expect(doc.content?.some((node) => node.type === "mermaidBlock")).toBe(true)

    const serialized = serializeEditorDocToMarkdown(doc)
    expect(serialized).toContain("```mermaid")
    expect(serialized).toContain("flowchart TD")
    expect(serialized).toContain("A[시작] --> B[처리]")
  })

  test("mermaid 라벨의 HTML 줄바꿈은 저장값을 유지한 채 파싱된다", () => {
    const markdown = ["```mermaid", "flowchart TD", "  A[첫 줄<br>둘째 줄] --> B[완료]", "```"].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(doc.content?.some((node) => node.type === "mermaidBlock")).toBe(true)
    expect(serialized).toContain("A[첫 줄<br>둘째 줄] --> B[완료]")
  })

  test("mermaid 렌더 소스는 HTML 줄바꿈을 개행으로 정규화한다", () => {
    const source = extractNormalizedMermaidSource(
      ["```mermaid", "flowchart TD", "  A[첫 줄<br>둘째 줄] --> B[완료]", "```"].join("\n")
    )

    expect(source).toContain("A[첫 줄\n둘째 줄] --> B[완료]")
  })

  test("callout 과 toggle 블록은 canonical markdown 로 round-trip 된다", () => {
    const markdown = [
      "> [!TIP] 핵심 포인트",
      "> 콜아웃 본문입니다.",
      "> 두 번째 줄입니다.",
      "",
      ":::toggle 더 보기",
      "토글 본문입니다.",
      "두 번째 줄입니다.",
      ":::",
    ].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    expect(doc.content?.some((node) => node.type === "calloutBlock")).toBe(true)
    expect(doc.content?.some((node) => node.type === "toggleBlock")).toBe(true)

    const serialized = serializeEditorDocToMarkdown(doc)
    expect(serialized).toContain("> [!TIP] 핵심 포인트")
    expect(serialized).toContain("> 콜아웃 본문입니다.")
    expect(serialized).toContain(":::toggle 더 보기")
    expect(serialized).toContain("토글 본문입니다.")
  })

  test("malformed mermaid fence 는 raw block 으로 보존된다", () => {
    const markdown = ["```mermaid", "flowchart TD", "  A[시작] --> B[실패]"].join("\n")

    const unsupported = detectUnsupportedMarkdownBlocks(markdown)
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]?.reason).toBe("unsupported-mermaid")
    expect(unsupported[0]?.markdown).toContain("```mermaid")
  })

  test("malformed toggle 은 raw block 으로 보존된다", () => {
    const markdown = [":::toggle 덜 닫힌 토글", "본문만 있고", "닫힘 없음"].join("\n")

    const unsupported = detectUnsupportedMarkdownBlocks(markdown)
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]?.reason).toBe("unsupported-toggle")
    expect(unsupported[0]?.markdown).toContain(":::toggle 덜 닫힌 토글")
  })

  test("지원하지 않는 callout 타입은 raw block 으로 보존된다", () => {
    const markdown = ["> [!CUSTOM] 알 수 없는 콜아웃", "> 본문은 유지되어야 합니다."].join("\n")

    const unsupported = detectUnsupportedMarkdownBlocks(markdown)
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]?.reason).toBe("unsupported-callout")
    expect(unsupported[0]?.markdown).toContain("> [!CUSTOM] 알 수 없는 콜아웃")
  })

  test("code block 언어와 image width/align 메타를 유지한다", () => {
    const markdown = [
      "```kotlin",
      "fun main() = println(\"hello\")",
      "```",
      "",
      "![diagram](https://example.com/image.png \"sample\") {width=640 align=wide}",
    ].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toContain("```kotlin")
    expect(serialized).toContain("fun main() = println(\"hello\")")
    expect(serialized).toContain("![diagram](https://example.com/image.png \"sample\") {width=640 align=wide}")
  })

  test("GFM 테이블은 parse/serialize round-trip 을 유지한다", () => {
    const markdown = [
      "| 항목 | 값 |",
      "| --- | --- |",
      "| 이름 | aquila |",
      "| 역할 | Backend Developer |",
    ].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toContain("| 항목 | 값 |")
    expect(serialized).toContain("| --- | --- |")
    expect(serialized).toContain("| 이름 | aquila |")
    expect(serialized).toContain("| 역할 | Backend Developer |")
  })

  test("GFM 테이블 직렬화는 셀의 백슬래시와 파이프를 함께 escape 한다", () => {
    const doc = parseMarkdownToEditorDoc(["| 항목 | 값 |", "| --- | --- |", "| 경로 | sample |"].join("\n"))

    const tableRow = doc.content?.[0]?.content?.[1]
    const cellNode = tableRow?.content?.[1]?.content?.[0]?.content?.[0]
    if (cellNode && cellNode.type === "text") {
      cellNode.text = "C:\\temp\\|draft"
    }

    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toContain("| 경로 | C:\\\\temp\\\\\\|draft |")
  })

  test("GFM 테이블의 escaped pipe/backslash 는 parse 후 재직렬화해도 보존된다", () => {
    const markdown = ["| 항목 | 값 |", "| --- | --- |", "| 경로 | C:\\\\temp\\\\\\|draft |"].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)
    const reparsed = parseMarkdownToEditorDoc(serialized)

    expect(serialized).toContain("| 경로 | C:\\\\temp\\\\\\|draft |")
    expect(serializeEditorDocToMarkdown(reparsed)).toBe(serialized)
  })

  test("정렬 지정 GFM 테이블은 raw markdown block 으로 보존한다", () => {
    const markdown = ["| 항목 | 값 |", "| :--- | ---: |", "| 이름 | aquila |"].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)

    expect(doc.content?.[0]?.type).toBe("rawMarkdownBlock")
    expect(serializeEditorDocToMarkdown(doc)).toBe(markdown)
  })
})
