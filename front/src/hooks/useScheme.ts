import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCookie, setCookie } from "cookies-next"
import { useCallback, useEffect } from "react"
import { CONFIG } from "site.config"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void

const resolveInitialScheme = (
  followsSystemTheme: boolean,
  fallbackScheme: SchemeType
): SchemeType => {
  if (typeof window === "undefined") {
    return followsSystemTheme ? fallbackScheme : fallbackScheme
  }

  const cookieScheme = getCookie("scheme")
  if (cookieScheme === "dark" || cookieScheme === "light") {
    return cookieScheme
  }

  if (!followsSystemTheme) return fallbackScheme

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
}

const useScheme = (): [SchemeType, SetScheme] => {
  const queryClient = useQueryClient()
  const followsSystemTheme = CONFIG.blog.scheme === "system"
  const fallbackScheme = (CONFIG.blog.scheme === "system" ? "light" : CONFIG.blog.scheme) as SchemeType

  const { data } = useQuery<SchemeType>({
    queryKey: queryKey.scheme(),
    enabled: false,
    initialData: resolveInitialScheme(followsSystemTheme, fallbackScheme),
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
