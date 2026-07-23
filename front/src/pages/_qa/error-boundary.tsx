import type { GetServerSideProps, NextPage } from "next"
import { useRouter } from "next/router"

import { RecoverableSurfaceBoundary } from "src/components/error/ErrorBoundary"

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

const createQaCrash = (message: string) => {
  const error = new Error(message) as Error & { secretToken?: string }
  // Sensitive values stay off message/stack serialization paths on purpose.
  error.secretToken = "secret-token"
  return error
}

const ThrowingSurface = () => {
  if (typeof window === "undefined") return <p>Preparing local crash fixture.</p>
  throw createQaCrash("qa local crash")
}

const GlobalThrow = () => {
  if (typeof window === "undefined") return <p>Preparing global crash fixture.</p>
  throw createQaCrash("qa global crash")
}

const ErrorBoundaryQaPage: NextPage = () => {
  const { query } = useRouter()

  if (query.mode === "global") {
    return <GlobalThrow />
  }

  return (
    <div data-testid="qa-error-boundary-shell">
      <p>QA shell keeps rendering around the failed surface.</p>
      <RecoverableSurfaceBoundary surface="markdown">
        <ThrowingSurface />
      </RecoverableSurfaceBoundary>
    </div>
  )
}

export default ErrorBoundaryQaPage
