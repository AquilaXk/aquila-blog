import createEmotionServer from "@emotion/server/create-instance"
import Document, {
  DocumentContext,
  DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document"
import React from "react"
import { CONFIG } from "site.config"
import { pretendard } from "src/assets"
import createEmotionCache from "src/libs/emotion/createEmotionCache"
import {
  AQUILA_SCHEME_BOOTSTRAP_SCRIPT,
  CLIENT_RUNTIME_RECOVERY_SCRIPT,
  HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT,
} from "src/libs/security/documentInlineScripts"

const AQUILA_BUILD_SHA =
  process.env.AQUILA_BUILD_SHA ||
  process.env.NEXT_PUBLIC_AQUILA_BUILD_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "unknown"

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    const originalRenderPage = ctx.renderPage
    const cache = createEmotionCache()
    const { extractCriticalToChunks } = createEmotionServer(cache)

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App: any) =>
          function EnhanceApp(props) {
            return <App emotionCache={cache} {...props} />
          },
      })

    const initialProps = await Document.getInitialProps(ctx)
    const emotionChunks = extractCriticalToChunks(initialProps.html)
    const emotionStyleTags = emotionChunks.styles.map((style) => (
      <style
        data-emotion={`${style.key} ${style.ids.join(" ")}`}
        key={style.key}
        dangerouslySetInnerHTML={{ __html: style.css }}
      />
    ))

    return {
      ...initialProps,
      styles: [...React.Children.toArray(initialProps.styles), ...emotionStyleTags],
    }
  }

  render() {
    return (
      <Html lang={CONFIG.lang} data-header-auth-shell="anonymous" data-header-auth-admin="false">
        <Head>
          <script dangerouslySetInnerHTML={{ __html: AQUILA_SCHEME_BOOTSTRAP_SCRIPT }} />
          <link rel="icon" href="/favicon.ico" />
          <link
            rel="apple-touch-icon"
            sizes="192x192"
            href="/apple-touch-icon.png"
          ></link>
          <link
            rel="alternate"
            type="application/rss+xml"
            title="RSS 2.0"
            href="/feed"
          ></link>
          <meta name="aquila-build-sha" content={AQUILA_BUILD_SHA} />
          {/* google search console */}
          {CONFIG.googleSearchConsole.enable === true && (
            <>
              <meta
                name="google-site-verification"
                content={CONFIG.googleSearchConsole.config.siteVerification}
              />
            </>
          )}
          {/* naver search advisor */}
          {CONFIG.naverSearchAdvisor.enable === true && (
            <>
              <meta
                name="naver-site-verification"
                content={CONFIG.naverSearchAdvisor.config.siteVerification}
              />
            </>
          )}
        </Head>
        <body className={pretendard.className}>
          <script dangerouslySetInnerHTML={{ __html: HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT }} />
          <script dangerouslySetInnerHTML={{ __html: CLIENT_RUNTIME_RECOVERY_SCRIPT }} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
