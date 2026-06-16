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

const clearSchemeBootstrapStyle = (scheme?: SchemeType) => {
  const root = document.documentElement
  if (scheme) {
    root.dataset.aquilaScheme = scheme
  }
  root.removeAttribute("data-aquila-scheme-bootstrap")
  root.removeAttribute("data-aquila-scheme-bootstrap-source")
  root.style.removeProperty("color-scheme")
  root.style.removeProperty("background-color")
  document.querySelector('style[data-aquila-scheme-bootstrap-style="true"]')?.remove()
}

const clearSchemeBootstrapAfterHydration = (scheme: SchemeType) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => clearSchemeBootstrapStyle(scheme))
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
    clearSchemeBootstrapStyle(scheme)
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined") return

    const defaultScheme = followsSystemTheme ? resolveSystemScheme() : data
    const bootstrapScheme = resolveCachedScheme() ?? defaultScheme
    if (bootstrapScheme !== data) {
      queryClient.setQueryData(queryKey.scheme(), bootstrapScheme)
      return
    }
    clearSchemeBootstrapAfterHydration(data)
  }, [data, followsSystemTheme, queryClient])

  return [data, setScheme]
}

export default useScheme
