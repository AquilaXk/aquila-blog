import { NextRouter } from "next/router"

type CancelledErrorLike = {
  cancelled?: unknown
  message?: unknown
}

const toCancelledErrorLike = (value: unknown): CancelledErrorLike | null => {
  if (typeof value !== "object" || value === null) return null
  return value as CancelledErrorLike
}

export const isNavigationCancelledError = (error: unknown): boolean => {
  if (!error) return false
  if (typeof error === "string") {
    const normalized = error.toLowerCase()
    return normalized.includes("cancelled") || normalized.includes("canceled")
  }

  const likeError = toCancelledErrorLike(error)
  if (likeError?.cancelled === true) return true

  if (typeof likeError?.message === "string") {
    const normalized = likeError.message.toLowerCase()
    return normalized.includes("cancelled") || normalized.includes("canceled")
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase()
    return normalized.includes("cancelled") || normalized.includes("canceled")
  }

  return false
}

type NextPathInput = string | string[] | undefined | null

const normalizeNextDataPath = (value: string, fallback: string): string => {
  const [pathname, search = ""] = value.split("?", 2)
  const segments = pathname.split("/")

  if (segments.length < 5) return fallback

  let routePath = `/${segments.slice(4).join("/")}`
  if (!routePath.endsWith(".json")) return fallback

  routePath = routePath.slice(0, -".json".length)
  if (routePath === "/index") {
    routePath = "/"
  } else {
    routePath = routePath.replace(/\/index$/, "") || "/"
  }

  const params = new URLSearchParams(search)
  params.delete("next")

  const query = params.toString()
  return query ? `${routePath}?${query}` : routePath
}

export const normalizeNextPath = (input: NextPathInput, fallback = "/"): string => {
  const raw = Array.isArray(input) ? input[0] : input

  if (typeof raw !== "string") return fallback

  const value = raw.trim()
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback

  if (value.startsWith("/_next/data/")) {
    return normalizeNextDataPath(value, fallback)
  }

  return value
}

export const toLoginPath = (nextPath: NextPathInput, fallback = "/") =>
  `/login?next=${encodeURIComponent(normalizeNextPath(nextPath, fallback))}`

export const toSignupPath = (nextPath: NextPathInput, fallback = "/") =>
  `/signup?next=${encodeURIComponent(normalizeNextPath(nextPath, fallback))}`

const toSafeClientRedirectTarget = (target: string, fallback = "/"): string => {
  if (typeof window === "undefined") return normalizeNextPath(target, fallback)

  const value = target.trim()
  if (!value) return fallback

  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback

    return normalizeNextPath(`${parsed.pathname}${parsed.search}${parsed.hash}`, fallback)
  } catch {
    return fallback
  }
}

export const replaceRoute = async (
  router: NextRouter,
  target: string,
  { preferHardNavigation = false }: { preferHardNavigation?: boolean } = {}
) => {
  const safeTarget = toSafeClientRedirectTarget(target, "/")

  if (preferHardNavigation && typeof window !== "undefined") {
    window.location.replace(safeTarget)
    return
  }

  try {
    await router.replace(safeTarget)
  } catch (error) {
    if (preferHardNavigation && typeof window !== "undefined") {
      window.location.replace(safeTarget)
      return
    }

    if (!isNavigationCancelledError(error)) {
      throw error
    }
  }
}

export const pushRoute = async (
  router: NextRouter,
  target: string,
  { preferHardNavigation = false }: { preferHardNavigation?: boolean } = {}
) => {
  const safeTarget = toSafeClientRedirectTarget(target, "/")

  if (preferHardNavigation && typeof window !== "undefined") {
    window.location.assign(safeTarget)
    return
  }

  try {
    await router.push(safeTarget)
  } catch (error) {
    if (preferHardNavigation && typeof window !== "undefined") {
      window.location.assign(safeTarget)
      return
    }

    if (!isNavigationCancelledError(error)) {
      throw error
    }
  }
}

type ShallowRouteQuery = Record<string, string | string[] | undefined>

type ReplaceShallowRouteOptions = {
  pathname?: string
  query: ShallowRouteQuery
}

export const replaceShallowRoutePreservingScroll = async (
  router: NextRouter,
  { pathname = router.pathname, query }: ReplaceShallowRouteOptions
) => {
  const scrollX = typeof window !== "undefined" ? window.scrollX : 0
  const scrollY = typeof window !== "undefined" ? window.scrollY : 0

  try {
    await router.replace(
      {
        pathname,
        query,
      },
      undefined,
      { shallow: true, scroll: false }
    )
  } catch (error) {
    if (!isNavigationCancelledError(error)) {
      throw error
    }
  }

  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" })
    })
  }
}
