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

const CLIENT_RUNTIME_RECOVERY_SCRIPT = `
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var storageKeyPrefix = "__aquila_client_runtime_recovery__";
  var getBuildId = function () {
    try {
      return (window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId) || "unknown-build";
    } catch (_) {
      return "unknown-build";
    }
  };
  var getStorageKey = function () {
    var pathname = window.location && window.location.pathname ? window.location.pathname : "/";
    return storageKeyPrefix + ":" + getBuildId() + ":" + pathname;
  };
  var isManifestAsset = function (target) {
    return typeof target === "string" && (target.indexOf("/_buildManifest.js") >= 0 || target.indexOf("/_ssgManifest.js") >= 0);
  };
  var isHydrationRuntimeError = function (message) {
    return typeof message === "string" && (
      message.indexOf("Minified React error #418") >= 0 ||
      message.indexOf("Minified React error #423") >= 0 ||
      message.indexOf("Hydration failed") >= 0 ||
      message.indexOf("There was an error while hydrating") >= 0 ||
      message.indexOf("did not match") >= 0
    );
  };
  var extractMessage = function (value) {
    if (typeof value === "string") return value;
    if (value && typeof value.message === "string") return value.message;
    return "";
  };
  var shouldReload = function () {
    try {
      return sessionStorage.getItem(getStorageKey()) !== "1";
    } catch (_) {
      return true;
    }
  };
  var markReloaded = function (reason) {
    try {
      var storageKey = getStorageKey();
      sessionStorage.setItem(storageKey, "1");
      if (typeof reason === "string" && reason.length > 0) {
        sessionStorage.setItem(storageKey + ":reason", reason);
      }
    } catch (_) {}
  };
  var reloadOnce = function (reason) {
    if (!shouldReload()) return;
    markReloaded(reason);
    window.location.reload();
  };
  window.addEventListener(
    "error",
    function (event) {
      var target = event && event.target;
      if (target instanceof HTMLScriptElement) {
        var src = target.getAttribute("src") || "";
        if (isManifestAsset(src)) {
          reloadOnce("manifest:" + src);
        }
        return;
      }
      var message = extractMessage((event && event.error) || (event && event.message));
      if (!isHydrationRuntimeError(message)) return;
      reloadOnce("hydration:" + message.slice(0, 80));
    },
    true
  );
  window.addEventListener("unhandledrejection", function (event) {
    var message = extractMessage(event && event.reason);
    if (!isHydrationRuntimeError(message)) return;
    reloadOnce("hydration-promise:" + message.slice(0, 80));
  });
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
          <script dangerouslySetInnerHTML={{ __html: CLIENT_RUNTIME_RECOVERY_SCRIPT }} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
