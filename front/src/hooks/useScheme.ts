import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useLayoutEffect } from "react"
import { queryKey } from "src/constants/queryKey"
import { SchemeType } from "src/types"

type SetScheme = (scheme: SchemeType) => void

const LIGHT_SCHEME: SchemeType = "light"
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const clearSchemeBootstrapStyle = () => {
  if (typeof document === "undefined") return

  const root = document.documentElement
  root.dataset.aquilaScheme = LIGHT_SCHEME
  root.style.colorScheme = LIGHT_SCHEME
  root.removeAttribute("data-aquila-scheme-bootstrap")
  root.removeAttribute("data-aquila-scheme-bootstrap-source")
  root.removeAttribute("data-aquila-scheme-user")
  root.style.removeProperty("background-color")
  document.querySelector('style[data-aquila-scheme-bootstrap-style="true"]')?.remove()
}

const useScheme = (): [SchemeType, SetScheme] => {
  const queryClient = useQueryClient()

  const { data } = useQuery<SchemeType>({
    queryKey: queryKey.scheme(),
    queryFn: () => LIGHT_SCHEME,
    enabled: false,
    staleTime: Infinity,
    initialData: LIGHT_SCHEME,
  })

  const setScheme = useCallback(
    (_scheme: SchemeType) => {
      const current = queryClient.getQueryData<SchemeType>(queryKey.scheme())
      if (current !== LIGHT_SCHEME) {
        queryClient.setQueryData(queryKey.scheme(), LIGHT_SCHEME)
      }
      clearSchemeBootstrapStyle()
    },
    [queryClient]
  )

  useIsomorphicLayoutEffect(() => {
    const current = queryClient.getQueryData<SchemeType>(queryKey.scheme())
    if (current !== LIGHT_SCHEME) {
      queryClient.setQueryData(queryKey.scheme(), LIGHT_SCHEME)
    }
    clearSchemeBootstrapStyle()
  }, [queryClient])

  return [data, setScheme]
}

export default useScheme
