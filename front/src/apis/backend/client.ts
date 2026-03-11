const DEFAULT_API_BASE_URL = "http://localhost:8080"

const isServer = typeof window === "undefined"

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

export class ApiError extends Error {
  status: number
  url: string
  body: string

  constructor(status: number, url: string, body: string) {
    super(`API request failed (${status}) ${url}: ${body}`)
    this.name = "ApiError"
    this.status = status
    this.url = url
    this.body = body
  }
}

export const getApiBaseUrl = () => {
  const serverUrl = process.env.BACKEND_INTERNAL_URL
  const publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL

  if (isServer && serverUrl) return stripTrailingSlash(serverUrl)
  if (publicUrl) return stripTrailingSlash(publicUrl)

  // In production, infer API domain from current host when public URL is missing.
  if (!isServer && typeof window !== "undefined") {
    const { protocol, hostname } = window.location
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      const cookieDomain = hostname.replace(/^www\./, "")
      return `${protocol}//api.${cookieDomain}`
    }
  }

  return DEFAULT_API_BASE_URL
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const url = `${getApiBaseUrl()}${path}`
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new ApiError(response.status, url, body)
  }

  return response.json() as Promise<T>
}
