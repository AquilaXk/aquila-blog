import { AppPropsWithLayout } from "../types"
import { Hydrate, QueryClientProvider } from "@tanstack/react-query"
import { RootLayout } from "src/layouts"
import { createQueryClient } from "src/libs/react-query"
import { useState } from "react"

function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout || ((page) => page)
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <RootLayout>{getLayout(<Component {...pageProps} />)}</RootLayout>
      </Hydrate>
    </QueryClientProvider>
  )
}

export default App
