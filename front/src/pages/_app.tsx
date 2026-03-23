import { AppPropsWithLayout } from "../types"
import { CacheProvider } from "@emotion/react"
import { HydrationBoundary, QueryClientProvider } from "@tanstack/react-query"
import type { NextWebVitalsMetric } from "next/app"
import Head from "next/head"
import { RootLayout } from "src/layouts"
import createEmotionCache from "src/libs/emotion/createEmotionCache"
import { createQueryClient } from "src/libs/react-query"
import { useState } from "react"

const clientSideEmotionCache = createEmotionCache()

function App({ Component, pageProps, emotionCache = clientSideEmotionCache }: AppPropsWithLayout) {
  const getLayout = Component.getLayout || ((page) => page)
  const [queryClient] = useState(createQueryClient)

  return (
    <CacheProvider value={emotionCache}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={pageProps.dehydratedState}>
          <RootLayout>{getLayout(<Component {...pageProps} />)}</RootLayout>
        </HydrationBoundary>
      </QueryClientProvider>
    </CacheProvider>
  )
}

export default App

export const reportWebVitals = (metric: NextWebVitalsMetric) => {
  void import("src/libs/rum/reportWebVital")
    .then(({ reportWebVital }) => {
      reportWebVital(metric)
    })
    .catch(() => {
      // RUM 전송 실패는 사용자 흐름에 영향을 주지 않도록 무시한다.
    })
}
