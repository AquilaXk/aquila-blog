import { readFileSync } from "fs"
import path from "path"
import { expect, test } from "@playwright/test"
import {
  createBookmarkNode,
  createBlockquoteNode,
  createBulletListNode,
  createCalloutNode,
  createChecklistNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHorizontalRuleNode,
  createMermaidNode,
  createOrderedListNode,
  createTableNode,
  createToggleNode,
  detectUnsupportedMarkdownBlocks,
  parseMarkdownToEditorDoc,
  serializeEditorDocToMarkdown,
} from "src/components/editor/serialization"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import { resolveMarkdownRenderModel } from "src/libs/markdown/rendering"
import ts from "typescript"

const htmlToMarkdownModuleSource = readFileSync(
  path.resolve(__dirname, "../src/libs/markdown/htmlToMarkdown.ts"),
  "utf8"
)
const transpiledHtmlToMarkdownModule = ts.transpileModule(htmlToMarkdownModuleSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText

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

  test("직접 생성한 블록 노드도 markdown serializer 와 같은 canonical 결과를 만든다", () => {
    const doc = {
      type: "doc",
      content: [
        createCalloutNode({ kind: "tip", title: "핵심 포인트", body: "콜아웃 본문입니다." }),
        createChecklistNode([{ checked: false, text: "할 일" }]),
        createBookmarkNode({ url: "https://example.com", title: "링크 제목", description: "북마크 설명" }),
        createEmbedNode({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "임베드 제목", caption: "임베드 캡션" }),
        createFileBlockNode({ url: "https://example.com/files/spec.pdf", name: "spec.pdf", description: "첨부 설명" }),
        createFormulaNode({ formula: "\\int_0^1 x^2 \\, dx" }),
        createToggleNode({ title: "더 보기", body: "토글 본문입니다." }),
        createTableNode([
          ["항목", "값"],
          ["이름", "aquila"],
        ]),
        createBlockquoteNode("본문 인용"),
        createBulletListNode(["첫 번째"]),
        createOrderedListNode(["두 번째"], 1),
        createCodeBlockNode("text", "코드를 입력하세요."),
        createMermaidNode("flowchart TD\n  A[시작] --> B[처리]"),
        createHorizontalRuleNode(),
      ],
    } as const

    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toContain("> [!TIP] 핵심 포인트")
    expect(serialized).toContain("- [ ] 할 일")
    expect(serialized).toContain(":::bookmark https://example.com")
    expect(serialized).toContain(":::embed https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(serialized).toContain(":::file https://example.com/files/spec.pdf")
    expect(serialized).toContain("$$")
    expect(serialized).toContain(":::toggle 더 보기")
    expect(serialized).toContain("| 항목 | 값 |")
    expect(serialized).toContain("> 본문 인용")
    expect(serialized).toContain("- 첫 번째")
    expect(serialized).toContain("1. 두 번째")
    expect(serialized).toContain("```text")
    expect(serialized).toContain("```mermaid")
    expect(serialized).toContain("---")
  })

  test("노션 스타일 HTML 붙여넣기는 블록과 인라인 서식을 렌더 상태로 승격한다", async ({ page }) => {
    const html = `
      <div class="notion-page-content">
        <h1>문서 제목</h1>
        <div><strong>굵게</strong> 와 <em>기울임</em> 그리고 <a href="https://example.com/docs">문서 링크</a></div>
        <ul>
          <li>첫 번째 항목</li>
          <li><input type="checkbox" checked />체크 항목</li>
        </ul>
        <blockquote><p>인용 본문</p></blockquote>
        <pre><code class="language-ts">const answer = 42;</code></pre>
        <table>
          <tbody>
            <tr><th>항목</th><th>값</th></tr>
            <tr><td>이름</td><td>aquila</td></tr>
          </tbody>
        </table>
        <details open>
          <summary>더 보기</summary>
          <p>토글 본문입니다.</p>
        </details>
        <div><img src="https://example.com/image.png" alt="샘플 이미지" title="샘플" /></div>
      </div>
    `

    const markdown = await page.evaluate(
      ({ compiledSource, htmlSource }) => {
        const module = { exports: {} as { convertHtmlToMarkdown?: (html: string) => string } }
        const exports = module.exports
        const runner = new Function("module", "exports", compiledSource)
        runner(module, exports)
        return module.exports.convertHtmlToMarkdown?.(htmlSource) || ""
      },
      { compiledSource: transpiledHtmlToMarkdownModule, htmlSource: html }
    )

    expect(markdown).toContain("# 문서 제목")
    expect(markdown).toContain("**굵게** 와 *기울임*")
    expect(markdown).toContain("[문서 링크](https://example.com/docs)")
    expect(markdown).toContain("- 첫 번째 항목")
    expect(markdown).toContain("- [x] 체크 항목")
    expect(markdown).toContain("> 인용 본문")
    expect(markdown).toContain("```ts")
    expect(markdown).toContain("| 항목 | 값 |")
    expect(markdown).toContain(":::toggle 더 보기")
    expect(markdown).toContain("![샘플 이미지](https://example.com/image.png \"샘플\")")

    const doc = parseMarkdownToEditorDoc(markdown)
    expect(doc.content?.some((node) => node.type === "heading")).toBe(true)
    expect(doc.content?.some((node) => node.type === "bulletList")).toBe(true)
    expect(doc.content?.some((node) => node.type === "blockquote")).toBe(true)
    expect(doc.content?.some((node) => node.type === "codeBlock")).toBe(true)
    expect(doc.content?.some((node) => node.type === "table")).toBe(true)
    expect(doc.content?.some((node) => node.type === "toggleBlock")).toBe(true)
    expect(doc.content?.some((node) => node.type === "resizableImage")).toBe(true)
  })

  test("plain text markdown 문서 붙여넣기는 전체 블록을 자동 렌더 상태로 승격한다", async ({ page }) => {
    const markdownSource = [
      "# 시작하며",
      "",
      "- 첫 번째 항목",
      "- 두 번째 항목",
      "",
      "```mermaid",
      "sequenceDiagram",
      '  participant C as "Client"',
      '  participant S as "Server"',
      "  C->>S: connect",
      "```",
      "",
      "<aside>",
      "💡",
      "",
      "SSE의 핵심 가치는 서버에서 클라이언트로 흐르는 단방향 스트림을 HTTP 위에서 단순하게 유지하는 데 있습니다.",
      "",
      "운영 관점에서도 인증과 로깅 흐름을 그대로 재사용할 수 있습니다.",
      "</aside>",
    ].join("\n")

    const normalizedMarkdown = await page.evaluate(
      ({ compiledSource, plainText }) => {
        const module = {
          exports: {} as {
            normalizeStructuredMarkdownClipboard?: (value: string) => string
            looksLikeStructuredMarkdownDocument?: (value: string) => boolean
          },
        }
        const exports = module.exports
        const runner = new Function("module", "exports", compiledSource)
        runner(module, exports)

        return {
          normalized:
            module.exports.normalizeStructuredMarkdownClipboard?.(plainText) || "",
          looksStructured:
            module.exports.looksLikeStructuredMarkdownDocument?.(plainText) || false,
        }
      },
      { compiledSource: transpiledHtmlToMarkdownModule, plainText: markdownSource }
    )

    expect(normalizedMarkdown.looksStructured).toBe(true)
    expect(normalizedMarkdown.normalized).toContain("# 시작하며")
    expect(normalizedMarkdown.normalized).toContain("```mermaid")
    expect(normalizedMarkdown.normalized).toContain("> [!INFO] 참고")

    const doc = parseMarkdownToEditorDoc(normalizedMarkdown.normalized)
    expect(doc.content?.some((node) => node.type === "heading")).toBe(true)
    expect(doc.content?.some((node) => node.type === "bulletList")).toBe(true)
    expect(doc.content?.some((node) => node.type === "mermaidBlock")).toBe(true)
    expect(doc.content?.some((node) => node.type === "calloutBlock")).toBe(true)
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

  test("지원하지 않는 callout 타입도 info 블록으로 승격하고 원래 label 을 유지한다", () => {
    const markdown = ["> [!CUSTOM] 알 수 없는 콜아웃", "> 본문은 유지되어야 합니다."].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(doc.content?.[0]?.type).toBe("calloutBlock")
    expect(doc.content?.[0]?.attrs?.kind).toBe("info")
    expect(doc.content?.[0]?.attrs?.label).toBe("CUSTOM")
    expect(serialized).toBe(markdown)
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

  test("inline color token 은 parse/serialize round-trip 을 유지한다", () => {
    const markdown = "문장 중간 {{color:#60a5fa|강조 텍스트}} 와 일반 텍스트"

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toBe(markdown)
  })

  test("named inline color 는 canonical hex token 으로 정규화된다", () => {
    const markdown = "{{color:sky|강조 텍스트}}"

    const doc = parseMarkdownToEditorDoc(markdown)

    expect(serializeEditorDocToMarkdown(doc)).toBe("{{color:#60a5fa|강조 텍스트}}")
  })

  test("링크와 inline color mark 는 함께 round-trip 된다", () => {
    const markdown = "[{{color:#34d399|문서 링크}}](https://example.com/docs)"

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(serialized).toBe(markdown)
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

  test("정렬 지정 GFM 테이블은 table block 으로 승격되고 정렬 메타를 유지한다", () => {
    const markdown = ["| 항목 | 값 |", "| :--- | ---: |", "| 이름 | aquila |"].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const serialized = serializeEditorDocToMarkdown(doc)

    expect(doc.content?.[0]?.type).toBe("table")
    expect(doc.content?.[0]?.content?.[0]?.content?.[0]?.attrs?.textAlign).toBe("left")
    expect(doc.content?.[0]?.content?.[0]?.content?.[1]?.attrs?.textAlign).toBe("right")
    expect(serialized).toContain("| :--- | ---: |")
    expect(serialized).toContain("<!-- aq-table")
  })

  test("테이블 열 폭/행 높이 메타는 parse/serialize round-trip 을 유지한다", () => {
    const markdown = [
      '<!-- aq-table {"columnWidths":[220,320],"rowHeights":[52,68,44]} -->',
      "| 항목 | 값 |",
      "| --- | --- |",
      "| 이름 | aquila |",
      "| 역할 | Backend Developer |",
    ].join("\n")

    const doc = parseMarkdownToEditorDoc(markdown)
    const table = doc.content?.[0]

    expect(table?.type).toBe("table")
    expect(table?.content?.[0]?.attrs?.rowHeightPx).toBe(52)
    expect(table?.content?.[1]?.attrs?.rowHeightPx).toBe(68)
    expect(table?.content?.[0]?.content?.[0]?.attrs?.colwidth).toEqual([220])
    expect(table?.content?.[0]?.content?.[1]?.attrs?.colwidth).toEqual([320])
    expect(serializeEditorDocToMarkdown(doc)).toBe(markdown)
  })

  test("렌더 모델은 테이블 메타 comment 를 분리하고 본문 markdown 에서는 제거한다", () => {
    const markdown = [
      '<!-- aq-table {"columnWidths":[220,320],"rowHeights":[52,68,44]} -->',
      "| 항목 | 값 |",
      "| --- | --- |",
      "| 이름 | aquila |",
    ].join("\n")

    const model = resolveMarkdownRenderModel({ content: markdown })

    expect(model.normalizedContent).not.toContain("<!-- aq-table")
    expect(model.tableLayouts).toEqual([
      {
        columnWidths: [220, 320],
        rowHeights: [52, 68, 44],
      },
    ])
  })
})
