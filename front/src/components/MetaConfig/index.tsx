import { CONFIG } from "site.config"
import Head from "next/head"

export type MetaConfigProps = {
  title: string
  description: string
  type: "Website" | "Post" | "Page" | string
  date?: string
  modifiedDate?: string
  image?: string
  url: string
  robots?: string
  canonicalUrl?: string | null
  jsonLd?: Array<Record<string, unknown>>
  /**
   * 이 페이지가 속한 사이트 이름. 기본값은 블로그 제목이다.
   * 같은 이미지가 서빙하는 회사·제품 표면은 각자 자기 이름으로 브랜딩돼야 하므로, 블로그 제목이
   * 탭 제목 접미사와 og:site_name에 강제로 붙지 않게 표면이 이 값을 넘긴다.
   */
  siteName?: string
}

const SITE_TITLE = CONFIG.blog.title || "AquilaLog"

const resolveBrowserTabTitle = (title: string, siteName: string) => {
  const pageTitle = title.trim()
  if (!pageTitle || pageTitle === siteName) {
    return siteName
  }
  if (
    pageTitle.endsWith(` | ${siteName}`) ||
    pageTitle.endsWith(` - ${siteName}`)
  ) {
    return pageTitle
  }

  return `${pageTitle} | ${siteName}`
}

const serializeJsonLd = (value: Record<string, unknown>) =>
  JSON.stringify(value).replace(/</g, "\\u003c")

const MetaConfig: React.FC<MetaConfigProps> = (props) => {
  const siteName = props.siteName?.trim() || SITE_TITLE
  const browserTabTitle = resolveBrowserTabTitle(props.title, siteName)
  const robots = props.robots || "follow, index"
  const canonicalUrl =
    props.canonicalUrl === undefined ? props.url : props.canonicalUrl

  return (
    <Head>
      <title>{browserTabTitle}</title>
      <meta name="robots" content={robots} />
      <meta charSet="UTF-8" />
      <meta name="description" content={props.description} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {/* og */}
      <meta property="og:type" content={props.type} />
      <meta property="og:title" content={props.title} />
      <meta property="og:description" content={props.description} />
      <meta property="og:url" content={props.url} />
      <meta property="og:site_name" content={siteName} />
      {CONFIG.lang && <meta property="og:locale" content={CONFIG.lang} />}
      {props.image && <meta property="og:image" content={props.image} />}
      {/* twitter */}
      <meta name="twitter:title" content={props.title} />
      <meta name="twitter:description" content={props.description} />
      <meta name="twitter:card" content="summary_large_image" />
      {props.image && <meta name="twitter:image" content={props.image} />}
      {/* post */}
      {props.type === "Post" && (
        <>
          {props.date && (
            <meta property="article:published_time" content={props.date} />
          )}
          {props.modifiedDate && (
            <meta
              property="article:modified_time"
              content={props.modifiedDate}
            />
          )}
          <meta property="article:author" content={CONFIG.profile.name} />
        </>
      )}
      {props.jsonLd?.map((entry, index) => (
        <script
          key={`json-ld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }}
        />
      ))}
    </Head>
  )
}

export default MetaConfig
