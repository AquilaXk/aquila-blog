import type { NextApiRequest, NextApiResponse } from "next"
import { renderMarkdownToHtml } from "src/libs/server/markdownToHtml"

type RenderRequestBody = {
  markdown?: unknown
}

type RenderResponse = {
  html: string
}

type RenderErrorResponse = {
  message: string
}

const MAX_MARKDOWN_LENGTH = 400_000

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RenderResponse | RenderErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const markdown = ((req.body as RenderRequestBody | undefined)?.markdown ?? "").toString()
  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    return res.status(413).json({ message: "Markdown payload is too large." })
  }

  try {
    const html = await renderMarkdownToHtml(markdown)
    return res.status(200).json({ html })
  } catch (error) {
    console.error("[api/markdown/render] failed to render markdown:", error)
    return res.status(500).json({ message: "Failed to render markdown." })
  }
}

