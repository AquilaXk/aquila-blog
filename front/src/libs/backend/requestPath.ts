const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/
const ALLOWED_API_PATH_PREFIXES = ["/post/api/v1", "/member/api/v1", "/system/api/v1", "/signup"]

const hasPathTraversal = (pathname: string): boolean => {
  const segments = pathname.split("/")
  for (const segment of segments) {
    if (!segment) continue
    try {
      if (decodeURIComponent(segment) === "..") {
        return true
      }
    } catch {
      return true
    }
  }
  return false
}

const isAllowedApiPath = (pathname: string): boolean =>
  ALLOWED_API_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

export const normalizeApiRequestPath = (rawPath: string): string => {
  if (typeof rawPath !== "string") {
    throw new Error("API path must be a string.")
  }

  const path = rawPath.trim()
  if (!path) {
    throw new Error("API path must not be empty.")
  }

  if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith("//")) {
    throw new Error(`Absolute URL is not allowed for API path: ${path}`)
  }

  if (!path.startsWith("/") || path.includes("\\")) {
    throw new Error(`Invalid API path: ${path}`)
  }

  const parsed = new URL(path, "http://localhost")
  if (parsed.origin !== "http://localhost") {
    throw new Error(`Invalid API path origin: ${path}`)
  }

  if (hasPathTraversal(parsed.pathname)) {
    throw new Error(`Path traversal is not allowed: ${path}`)
  }

  if (!isAllowedApiPath(parsed.pathname)) {
    throw new Error(`Path is not allow-listed for server fetch: ${parsed.pathname}`)
  }

  return `${parsed.pathname}${parsed.search}`
}
