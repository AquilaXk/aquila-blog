import { NextRouter } from "next/router"

export const isNavigationCancelledError = (error: unknown): boolean => {
  if (!error) return false
  if (typeof error === "string") return error.toLowerCase().includes("cancelled")
  if (error instanceof Error) return error.message.toLowerCase().includes("cancelled")
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

export const replaceRoute = async (
  router: NextRouter,
  target: string,
  { preferHardNavigation = false }: { preferHardNavigation?: boolean } = {}
) => {
  if (preferHardNavigation && typeof window !== "undefined") {
    window.location.replace(target)
    return
  }

  try {
    await router.replace(target)
  } catch (error) {
    if (preferHardNavigation && typeof window !== "undefined") {
      window.location.replace(target)
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
  if (preferHardNavigation && typeof window !== "undefined") {
    window.location.assign(target)
    return
  }

  try {
    await router.push(target)
  } catch (error) {
    if (preferHardNavigation && typeof window !== "undefined") {
      window.location.assign(target)
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
