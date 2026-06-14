import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCookie, setCookie } from "cookies-next"
import { useCallback, useEffect } from "react"
import { CONFIG } from "site.config"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void

const isScheme = (value: unknown): value is SchemeType => value === "light" || value === "dark"

const resolveSystemScheme = (): SchemeType => {
  if (typeof window === "undefined") return "light"
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
}

const resolveCachedScheme = (): SchemeType | null => {
  const cachedScheme = getCookie("scheme")
  return isScheme(cachedScheme) ? cachedScheme : null
}

const clearSchemeBootstrapStyle = () => {
  document.documentElement.removeAttribute("data-aquila-scheme-bootstrap")
  document.querySelector('style[data-aquila-scheme-bootstrap-style="true"]')?.remove()
}

const clearSchemeBootstrapAfterHydration = () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(clearSchemeBootstrapStyle)
  })
}

const useScheme = (): [SchemeType, SetScheme] => {
  const queryClient = useQueryClient()
  const followsSystemTheme = CONFIG.blog.scheme === "system"
  const fallbackScheme = (CONFIG.blog.scheme === "system" ? "light" : CONFIG.blog.scheme) as SchemeType

  const { data } = useQuery<SchemeType>({
    queryKey: queryKey.scheme(),
    queryFn: () => fallbackScheme,
    enabled: false,
    staleTime: Infinity,
    // Keep the first client render equal to the server render; _document bootstrap owns pre-hydration colors.
    initialData: fallbackScheme,
  })

  const setScheme = useCallback((scheme: SchemeType) => {
    setCookie("scheme", scheme, { path: "/", sameSite: "lax" })
    queryClient.setQueryData(queryKey.scheme(), scheme)
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined") return

    const defaultScheme = followsSystemTheme ? resolveSystemScheme() : data
    const nextScheme = resolveCachedScheme() ?? defaultScheme
    if (nextScheme !== data) {
      setScheme(nextScheme)
      clearSchemeBootstrapAfterHydration()
      return
    }
    clearSchemeBootstrapAfterHydration()
  }, [data, followsSystemTheme, setScheme])

  return [data, setScheme]
}

export default useScheme
