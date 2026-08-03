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
import { isStandaloneSurfacePathname } from "src/libs/publicSurfaceUrl"
import {
  AQUILA_SCHEME_BOOTSTRAP_SCRIPT,
  CLIENT_RUNTIME_RECOVERY_SCRIPT,
  HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT,
} from "src/libs/security/documentInlineScripts"

// 런타임 주입(AQUILA_BUILD_SHA) → 빌드 시점 인라인(NEXT_PUBLIC_AQUILA_BUILD_SHA) → CI(GITHUB_SHA) 순으로 읽는다.
const AQUILA_BUILD_SHA =
  process.env.AQUILA_BUILD_SHA ||
  process.env.NEXT_PUBLIC_AQUILA_BUILD_SHA ||
  process.env.GITHUB_SHA ||
  "unknown"

/**
 * RSS는 블로그 호스트의 자산이다. 회사·제품 표면은 전용 호스트의 루트로 서빙되므로, 무조건 붙는
 * alternate 링크는 그 호스트들이 남의 피드를 자기 것으로 광고하게 만든다(표면 catch-all이 `/feed`를
 * 실제로 서빙하기까지 한다 - 그쪽은 표면 vhost가 거부한다).
 */
type SurfaceAwareDocumentProps = {
  hasBlogFeedAlternate: boolean
}

class MyDocument extends Document<SurfaceAwareDocumentProps> {
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps & SurfaceAwareDocumentProps> {
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
      hasBlogFeedAlternate: !isStandaloneSurfacePathname(ctx.pathname),
    }
  }

  render() {
    const { hasBlogFeedAlternate } = this.props

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
          {hasBlogFeedAlternate && (
            <link
              rel="alternate"
              type="application/rss+xml"
              title="RSS 2.0"
              href="/feed"
            ></link>
          )}
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
