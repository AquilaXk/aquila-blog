import { useQuery, useQueryClient } from "@tanstack/react-query"
import { setCookie } from "cookies-next"
import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { CONFIG } from "site.config"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void
type BootstrapScheme = {
  scheme: SchemeType
  renderedScheme: SchemeType
}

const isScheme = (value: unknown): value is SchemeType => value === "light" || value === "dark"
let runtimeSchemeSeed: SchemeType | null = null

const resolveSystemScheme = (): SchemeType => {
  if (typeof window === "undefined") return "light"
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
}

const resolveBootstrapScheme = (): BootstrapScheme | null => {
  const root = globalThis.document?.documentElement
  const renderedScheme = root?.dataset.aquilaScheme
  if (!root || !isScheme(renderedScheme)) return null

  const userScheme = root.getAttribute("data-aquila-scheme-user")
  const source = root.getAttribute("data-aquila-scheme-bootstrap-source")
  if (source === "public" && isScheme(userScheme)) {
    return { scheme: userScheme, renderedScheme }
  }

  return { scheme: renderedScheme, renderedScheme }
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const clearSchemeBootstrapStyle = (scheme: SchemeType, renderedScheme = scheme) => {
  const root = document.documentElement
  root.dataset.aquilaScheme = renderedScheme
  root.style.colorScheme = renderedScheme
  runtimeSchemeSeed = scheme
  root.removeAttribute("data-aquila-scheme-bootstrap")
  root.removeAttribute("data-aquila-scheme-bootstrap-source")
  root.removeAttribute("data-aquila-scheme-user")
  root.style.removeProperty("background-color")
  document.querySelector('style[data-aquila-scheme-bootstrap-style="true"]')?.remove()
}

const useScheme = (): [SchemeType, SetScheme] => {
  const queryClient = useQueryClient()
  const resolvedInitialSchemeRef = useRef(false)
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
    setCookie("scheme", scheme, { path: "/", sameSite: "lax" })
    queryClient.setQueryData(queryKey.scheme(), scheme)
    clearSchemeBootstrapStyle(scheme)
  }, [queryClient])

  useIsomorphicLayoutEffect(() => {
    const shouldResolveInitialScheme = !resolvedInitialSchemeRef.current
    const bootstrap = shouldResolveInitialScheme ? resolveBootstrapScheme() : null
    const bootstrapScheme =
      bootstrap?.scheme ??
      (shouldResolveInitialScheme
        ? runtimeSchemeSeed ?? (followsSystemTheme ? resolveSystemScheme() : fallbackScheme)
        : data)
    const renderedScheme =
      bootstrap?.renderedScheme ??
      (isScheme(globalThis.document?.documentElement.dataset.aquilaScheme)
        ? globalThis.document.documentElement.dataset.aquilaScheme
        : bootstrapScheme)
    resolvedInitialSchemeRef.current = true
    if (bootstrapScheme !== data) {
      queryClient.setQueryData(queryKey.scheme(), bootstrapScheme)
      clearSchemeBootstrapStyle(bootstrapScheme, renderedScheme)
      return
    }
    clearSchemeBootstrapStyle(data, renderedScheme)
  }, [data, fallbackScheme, followsSystemTheme, queryClient])

  return [data, setScheme]
}

export default useScheme
