import { useQuery, useQueryClient } from "@tanstack/react-query"
import { setCookie } from "cookies-next"
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

const resolveBootstrapScheme = (): SchemeType | null => {
  const scheme = globalThis.document?.documentElement.dataset.aquilaScheme
  return isScheme(scheme) ? scheme : null
}

const clearSchemeBootstrapStyle = (scheme: SchemeType) => {
  const root = document.documentElement
  root.dataset.aquilaScheme = scheme
  root.style.colorScheme = scheme
  root.removeAttribute("data-aquila-scheme-bootstrap")
  root.removeAttribute("data-aquila-scheme-bootstrap-source")
  root.style.removeProperty("background-color")
  document.querySelector('style[data-aquila-scheme-bootstrap-style="true"]')?.remove()
}

const clearSchemeBootstrapAfterHydration = (scheme: SchemeType) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (document.documentElement.dataset.aquilaScheme === scheme) {
          clearSchemeBootstrapStyle(scheme)
        }
      }, 160)
    })
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
    initialData: () => resolveBootstrapScheme() ?? fallbackScheme,
  })

  const setScheme = useCallback((scheme: SchemeType) => {
    setCookie("scheme", scheme, { path: "/", sameSite: "lax" })
    queryClient.setQueryData(queryKey.scheme(), scheme)
    clearSchemeBootstrapStyle(scheme)
  }, [queryClient])

  useEffect(() => {
    const bootstrapScheme =
      resolveBootstrapScheme() ??
      (followsSystemTheme ? resolveSystemScheme() : fallbackScheme)
    if (bootstrapScheme !== data) {
      queryClient.setQueryData(queryKey.scheme(), bootstrapScheme)
      return
    }
    clearSchemeBootstrapAfterHydration(data)
  }, [data, fallbackScheme, followsSystemTheme, queryClient])

  return [data, setScheme]
}

export default useScheme
