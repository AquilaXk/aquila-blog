import { NextRouter } from "next/router"

export const isNavigationCancelledError = (error: unknown): boolean => {
  if (!error) return false
  if (typeof error === "string") return error.toLowerCase().includes("cancelled")
  if (error instanceof Error) return error.message.toLowerCase().includes("cancelled")
  return false
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
