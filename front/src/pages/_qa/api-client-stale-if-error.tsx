import type { GetServerSideProps, NextPage } from "next"
import { useState } from "react"

import { apiFetchWithMeta, type ApiFetchResult } from "src/apis/backend/client"

type QaStalePayload = {
  title: string
}

type QaRunState = {
  fresh: ApiFetchResult<QaStalePayload> | null
  stale: ApiFetchResult<QaStalePayload> | null
  telemetry: unknown[]
  error: string | null
}

const initialRunState: QaRunState = {
  fresh: null,
  stale: null,
  telemetry: [],
  error: null,
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.ENABLE_QA_ROUTES !== "true") {
    return {
      notFound: true,
    }
  }

  return {
    props: {},
  }
}

const ApiClientStaleIfErrorQaPage: NextPage = () => {
  const [state, setState] = useState<QaRunState>(initialRunState)

  const runScenario = async () => {
    const telemetry: unknown[] = []
    const onTelemetry = (event: Event) => {
      telemetry.push((event as CustomEvent).detail)
    }
    window.addEventListener("aquila:api-stale-if-error", onTelemetry)
    setState(initialRunState)

    try {
      const fresh = await apiFetchWithMeta<QaStalePayload>("/post/api/v1/posts/feed?sort=CREATED_AT&page=1&pageSize=30")
      const stale = await apiFetchWithMeta<QaStalePayload>("/post/api/v1/posts/feed?sort=CREATED_AT&page=1&pageSize=30")
      setState({
        fresh,
        stale,
        telemetry,
        error: null,
      })
    } catch (error) {
      setState({
        fresh: null,
        stale: null,
        telemetry,
        error: error instanceof Error ? error.message : "unknown error",
      })
    } finally {
      window.removeEventListener("aquila:api-stale-if-error", onTelemetry)
    }
  }

  return (
    <main>
      <button type="button" onClick={runScenario}>
        Run stale-if-error scenario
      </button>
      <pre data-testid="qa-api-client-stale-result">{JSON.stringify(state)}</pre>
    </main>
  )
}

export default ApiClientStaleIfErrorQaPage
