import { AppPropsWithLayout } from "../types"
import { CacheProvider } from "@emotion/react"
import { Hydrate, QueryClientProvider } from "@tanstack/react-query"
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
      <QueryClientProvider client={queryClient}>
        <Hydrate state={pageProps.dehydratedState}>
          <RootLayout>{getLayout(<Component {...pageProps} />)}</RootLayout>
        </Hydrate>
      </QueryClientProvider>
    </CacheProvider>
  )
}

export default App
