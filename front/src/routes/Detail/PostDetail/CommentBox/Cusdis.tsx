import { CONFIG } from "site.config"
import { useEffect } from "react"
import styled from "@emotion/styled"
import useScheme from "src/hooks/useScheme"

type CusdisApi = {
  initial?: () => void
}

type Props = {
  id: string
  slug: string
  title: string
}

const Cusdis: React.FC<Props> = ({ id, slug, title }) => {
  const [scheme] = useScheme()

  useEffect(() => {
    const thread = document.getElementById("cusdis_thread")
    if (!thread) return

    const host = CONFIG.cusdis.config.host.replace(/\/$/, "")

    thread.setAttribute("data-host", host)
    thread.setAttribute("data-app-id", CONFIG.cusdis.config.appid)
    thread.setAttribute("data-page-id", id)
    thread.setAttribute("data-page-title", title)
    thread.setAttribute("data-page-url", `${CONFIG.link}/${slug}`)
    thread.setAttribute("data-theme", scheme)

    const initialize = () => {
      const cusdis = (window as Window & { CUSDIS?: CusdisApi }).CUSDIS
      cusdis?.initial?.()
    }

    const existingScript = document.getElementById("cusdis_script")
    if (existingScript) {
      initialize()
      return
    }

    const script = document.createElement("script")
    script.id = "cusdis_script"
    script.src = `${host}/js/cusdis.es.js`
    script.async = true
    script.defer = true
    script.onload = initialize
    document.body.appendChild(script)
  }, [id, scheme, slug, title])

  return (
    <>
      <StyledWrapper id="comments">
        <div id="cusdis_thread" />
      </StyledWrapper>
    </>
  )
}

export default Cusdis

const StyledWrapper = styled.div`
  margin-top: 2.5rem;
`
