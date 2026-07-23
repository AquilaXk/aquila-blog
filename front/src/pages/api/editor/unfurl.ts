import type { NextApiRequest, NextApiResponse } from "next"
import { extractUnfurlMetadata } from "src/libs/unfurl/extractMeta"
import { fetchSafeUnfurlResponse, normalizeSafeUnfurlUrl } from "src/libs/unfurl/requestSafety"

const QA_UNFURL_FIXTURES: Record<
  string,
  {
    title: string
    description: string
    siteName: string
    provider: string
    thumbnailUrl: string
    embedUrl?: string
  }
> = {
  "https://github.com/aquilaxk/aquila-blog": {
    title: "aquila-blog",
    description: "에디터 개선 로그와 블로그 서비스를 담은 저장소",
    siteName: "GitHub",
    provider: "GitHub",
    thumbnailUrl: "https://opengraph.githubassets.com/aquila-blog.png",
  },
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ": {
    title: "Never Gonna Give You Up",
    description: "테스트용 고정 임베드 메타데이터",
    siteName: "YouTube",
    provider: "YouTube",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
}

const createError = (status: number, message: string) => ({
  status,
  body: {
    ok: false as const,
    message,
  },
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ ok: false, message: "허용되지 않은 메서드입니다." })
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url
  const targetUrl = String(rawUrl || "").trim()
  if (!targetUrl) {
    return res.status(400).json({ ok: false, message: "URL이 비어 있습니다." })
  }

  try {
    const parsedUrl = normalizeSafeUnfurlUrl(targetUrl)

    if (process.env.ENABLE_QA_ROUTES === "true") {
      const fixture = QA_UNFURL_FIXTURES[parsedUrl.toString()]
      if (fixture) {
        return res.status(200).json({
          ok: true,
          data: {
            url: parsedUrl.toString(),
            ...fixture,
          },
        })
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const { response, finalUrl } = await fetchSafeUnfurlResponse({
        initialUrl: parsedUrl.toString(),
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "aquila-editor-unfurl/1.0",
        },
      })

      if (!response.ok) {
        const { status, body } = createError(502, `unfurl 대상 응답이 비정상적입니다. (${response.status})`)
        return res.status(status).json(body)
      }

      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("text/html")) {
        const { status, body } = createError(415, "HTML 문서만 unfurl할 수 있습니다.")
        return res.status(status).json(body)
      }

      const html = (await response.text()).slice(0, 250_000)
      const metadata = extractUnfurlMetadata(finalUrl.toString(), html)
      return res.status(200).json({ ok: true, data: metadata })
    } catch (error) {
      const message = error instanceof Error ? error.message : "링크 메타데이터를 불러오지 못했습니다."
      const { status, body } = createError(504, message)
      return res.status(status).json(body)
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL 형식이 올바르지 않습니다."
    return res.status(400).json({ ok: false, message })
  }
}
