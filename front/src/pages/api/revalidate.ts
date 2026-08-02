import { NextApiRequest, NextApiResponse } from "next"
import { getPosts } from "../../apis"
import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"
import { fetchServerAdminSession } from "src/libs/server/authSession"

// Revalidate endpoint (POST only)
// - token: x-revalidate-token header only, or authenticated admin session
// - path: JSON body { path: "/target" } (or ?path=... fallback)
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const expectedSecret = process.env.TOKEN_FOR_REVALIDATE
  const headerSecret =
    typeof req.headers["x-revalidate-token"] === "string"
      ? req.headers["x-revalidate-token"]
      : ""
  const hasValidSecret = Boolean(expectedSecret) && headerSecret === expectedSecret
  const adminSession = hasValidSecret ? null : await fetchServerAdminSession(req)
  const isAdminRequest = adminSession?.isAdmin === true

  if (!hasValidSecret && !isAdminRequest) {
    return res.status(401).json({ message: "Invalid token or admin session required" })
  }

  const pathFromQuery = typeof req.query.path === "string" ? req.query.path : ""
  const pathFromBody = typeof req.body?.path === "string" ? req.body.path : ""
  const pathsFromBody =
    Array.isArray(req.body?.paths)
      ? req.body.paths.filter((value: unknown): value is string => typeof value === "string")
      : []
  const targetPaths = [pathFromBody || pathFromQuery, ...pathsFromBody].filter((value) => value.trim().length > 0)

  try {
    await invalidatePublicPostReadCaches()

    let paths: string[] = []

    if (targetPaths.length > 0) {
      const normalizedPaths = Array.from(
        new Set(
          targetPaths.map((path) => (path.startsWith("/") ? path : `/${path}`))
        )
      )
      await Promise.all(normalizedPaths.map((path) => res.revalidate(path)))
      paths = normalizedPaths
    } else {
      const posts = await getPosts()
      const pathsToRevalidate = new Set<string>(["/"])
      posts.forEach((row) => {
        if (row?.id) {
          pathsToRevalidate.add(`/posts/${row.id}`)
        }
      })
      paths = [...pathsToRevalidate]
      const revalidateRequests = paths.map((pathName) => res.revalidate(pathName))
      await Promise.all(revalidateRequests)
    }

    res.json({
      revalidated: true,
      count: paths.length,
      paths,
    })
  } catch (error) {
    // 실패를 로그로 남기지 않으면 재생성 실패가 stale 응답으로만 나타나 조용히 묻힌다.
    // 응답 본문에는 내부 정보를 담지 않고 서버 로그에만 남긴다.
    console.error("[api/revalidate] failed to revalidate:", {
      targetCount: targetPaths.length,
      error,
    })
    return res.status(500).send("Error revalidating")
  }
}
