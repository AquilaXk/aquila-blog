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

const STALE_MANIFEST_RELOAD_SCRIPT = `
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var storageKey = "__aquila_stale_manifest_reload__";
  var isManifestAsset = function (target) {
    return typeof target === "string" && (target.indexOf("/_buildManifest.js") >= 0 || target.indexOf("/_ssgManifest.js") >= 0);
  };
  var shouldReload = function () {
    try {
      return sessionStorage.getItem(storageKey) !== "1";
    } catch (_) {
      return true;
    }
  };
  var markReloaded = function () {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch (_) {}
  };
  window.addEventListener(
    "error",
    function (event) {
      var target = event && event.target;
      if (!(target instanceof HTMLScriptElement)) return;
      var src = target.getAttribute("src") || "";
      if (!isManifestAsset(src) || !shouldReload()) return;
      markReloaded();
      window.location.reload();
    },
    true
  );
})();
`

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
      <Html lang={CONFIG.lang}>
        <Head>
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
          <script dangerouslySetInnerHTML={{ __html: STALE_MANIFEST_RELOAD_SCRIPT }} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
