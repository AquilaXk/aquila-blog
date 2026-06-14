import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCookie, setCookie } from "cookies-next"
import { useCallback, useEffect } from "react"
import { CONFIG } from "site.config"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void

const isScheme = (value: unknown): value is SchemeType => value === "light" || value === "dark"

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
    initialData: fallbackScheme,
  })

  const setScheme = useCallback((scheme: SchemeType) => {
    setCookie("scheme", scheme)
    queryClient.setQueryData(queryKey.scheme(), scheme)
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined") return

    const cachedScheme = getCookie("scheme")
    const defaultScheme = followsSystemTheme
      ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light"
      : data
    const nextScheme = isScheme(cachedScheme) ? cachedScheme : defaultScheme
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
