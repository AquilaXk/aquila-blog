import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCookie, setCookie } from "cookies-next"
import { useCallback, useEffect } from "react"
import { CONFIG } from "site.config"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void

const isScheme = (value: unknown): value is SchemeType => value === "light" || value === "dark"

const resolveInitialBrowserScheme = (
  fallbackScheme: SchemeType,
  followsSystemTheme: boolean
): SchemeType => {
  if (typeof window === "undefined") return fallbackScheme

  const cachedScheme = getCookie("scheme")
  if (isScheme(cachedScheme)) return cachedScheme

  if (followsSystemTheme && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
    return "dark"
  }

  return fallbackScheme
}

const useScheme = (): [SchemeType, SetScheme] => {
  const queryClient = useQueryClient()
  const followsSystemTheme = CONFIG.blog.scheme === "system"
  const fallbackScheme = (CONFIG.blog.scheme === "system" ? "light" : CONFIG.blog.scheme) as SchemeType
  const initialScheme = resolveInitialBrowserScheme(fallbackScheme, followsSystemTheme)

  const { data } = useQuery<SchemeType>({
    queryKey: queryKey.scheme(),
    queryFn: () => initialScheme,
    enabled: false,
    staleTime: Infinity,
    initialData: initialScheme,
  })

  const setScheme = useCallback((scheme: SchemeType) => {
    setCookie("scheme", scheme)
    queryClient.setQueryData(queryKey.scheme(), scheme)
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined") return

    const cachedScheme = getCookie("scheme") as SchemeType
    const defaultScheme = followsSystemTheme
      ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light"
      : data
    const nextScheme = cachedScheme || defaultScheme
    if (nextScheme !== data) {
      setScheme(nextScheme)
    }
  }, [data, followsSystemTheme, setScheme])

  return [data, setScheme]
}

export default useScheme
