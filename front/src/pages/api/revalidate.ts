import { NextApiRequest, NextApiResponse } from "next"
import { getPosts } from "../../apis"

// Revalidate endpoint (POST only)
// - token: x-revalidate-token header only
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
  if (!expectedSecret) {
    return res.status(500).json({ message: "Missing revalidate token on server" })
  }

  const headerSecret =
    typeof req.headers["x-revalidate-token"] === "string"
      ? req.headers["x-revalidate-token"]
      : ""

  if (headerSecret !== expectedSecret) {
    return res.status(401).json({ message: "Invalid token" })
  }

  const pathFromQuery = typeof req.query.path === "string" ? req.query.path : ""
  const pathFromBody = typeof req.body?.path === "string" ? req.body.path : ""
  const targetPath = pathFromBody || pathFromQuery

  try {
    let paths: string[] = []

    if (targetPath) {
      const normalizedPath = targetPath.startsWith("/")
        ? targetPath
        : `/${targetPath}`
      await res.revalidate(normalizedPath)
      paths = [normalizedPath]
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
  } catch {
    return res.status(500).send("Error revalidating")
  }
}
