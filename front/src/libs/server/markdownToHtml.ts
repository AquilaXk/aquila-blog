import { toHtml } from "hast-util-to-html"
import rehypePrettyCode from "rehype-pretty-code"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
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
  if (!markdown.trim()) return ""

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypePrettyCode as never, prettyCodeOptions as never)
  const parsed = processor.parse(markdown)
  const transformed = await processor.run(parsed)

  return toHtml(transformed, { allowDangerousHtml: false })
}
