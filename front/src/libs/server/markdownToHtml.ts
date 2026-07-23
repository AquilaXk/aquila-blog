import { toHtml } from "hast-util-to-html"
import rehypePrettyCode from "rehype-pretty-code"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { normalizeMarkdownForRender } from "src/libs/markdown/rendering"
import { unified } from "unified"

const prettyCodeOptions = {
  theme: {
    dark: "github-dark",
    light: "github-light",
  },
  keepBackground: false,
  defaultLang: {
    block: "text",
    inline: "text",
  },
}

export const renderMarkdownToHtml = async (markdown: string): Promise<string> => {
  // 서버는 정적 HTML/pretty-code만 담당하고, interactive block 조합 책임은 클라이언트에 둔다.
  const normalizedMarkdown = normalizeMarkdownForRender(markdown)
  if (!normalizedMarkdown.trim()) return ""

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypePrettyCode as never, prettyCodeOptions as never)
  const parsed = processor.parse(normalizedMarkdown)
  const transformed = await processor.run(parsed)

  return toHtml(transformed, { allowDangerousHtml: false })
}
