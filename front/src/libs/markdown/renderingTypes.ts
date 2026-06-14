import type { MarkdownTableLayout } from "src/libs/markdown/tableMetadata"

export type CalloutKind = "tip" | "info" | "warning" | "outline" | "example" | "summary"

export type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "toggle"; title: string; content: string }
  | { type: "callout"; kind: CalloutKind; title: string; emoji: string; content: string; label?: string }
  | {
      type: "bookmark"
      url: string
      title: string
      description?: string
      siteName?: string
      provider?: string
      thumbnailUrl?: string
    }
  | {
      type: "embed"
      url: string
      title: string
      caption?: string
      siteName?: string
      provider?: string
      thumbnailUrl?: string
      embedUrl?: string
    }
  | {
      type: "file"
      url: string
      name: string
      description?: string
      mimeType?: string
      sizeBytes?: number | null
    }
  | { type: "formula"; formula: string }
  | {
      type: "image"
      alt: string
      src: string
      title: string
      widthPx?: number
      align?: "left" | "center" | "wide" | "full"
    }

export type MarkdownRenderModel = {
  normalizedContent: string
  resolvedContentHtml: string
  renderKey: string
  segments: MarkdownSegment[]
  tableLayouts: Array<MarkdownTableLayout | null>
}

export const markdownGuide = `### 작성 가이드
- 코드블록: \`\`\`ts
const x = 1
\`\`\`
- 체크리스트:
  - [ ] 할 일
  - [x] 완료한 일
- 글자색: \`{{color:#60a5fa|강조 텍스트}}\`
- 머메이드: \`\`\`mermaid
graph TD
  A[Start] --> B{Check}
\`\`\`
- 토글:
  :::toggle 토글 제목
  접기/펼치기 본문
  :::
- 북마크:
  :::bookmark https://example.com
  링크 제목
  설명
  :::
- 임베드:
  :::embed https://www.youtube.com/watch?v=dQw4w9WgXcQ
  영상 제목
  캡션
  :::
- 파일:
  :::file https://example.com/files/spec.pdf
  spec.pdf
  첨부 설명
  :::
- 수식:
  인라인: \`$a^2 + b^2 = c^2$\`
  블록:
  $$
  E = mc^2
  $$
- 콜아웃:
  > [!TIP]
  > 내용
  또는
  <aside>
  ℹ️
  내용
  </aside>
  허용 이모지 예시: 💡 ✨ / ℹ️ / ⚠️ 🚨 / 📋 📝 / ✅ / 📚 🧾
  지원 타입: TIP, INFO, WARNING, OUTLINE, EXAMPLE, SUMMARY
- 테이블:
  | name | value |
  | --- | --- |
  | a | 1 |`
