import { CONFIG } from "site.config"
import Head from "next/head"

export type MetaConfigProps = {
  title: string
  description: string
  type: "Website" | "Post" | "Page" | string
  date?: string
  image?: string
  url: string
  robots?: string
  canonicalUrl?: string | null
}

const SITE_TITLE = CONFIG.blog.title || "AquilaLog"

const resolveBrowserTabTitle = (title: string) => {
  const pageTitle = title.trim()
  if (!pageTitle || pageTitle === SITE_TITLE) {
    return SITE_TITLE
  }
  if (pageTitle.endsWith(` | ${SITE_TITLE}`) || pageTitle.endsWith(` - ${SITE_TITLE}`)) {
    return pageTitle
  }

  return `${pageTitle} | ${SITE_TITLE}`
}

const MetaConfig: React.FC<MetaConfigProps> = (props) => {
  const browserTabTitle = resolveBrowserTabTitle(props.title)
  const robots = props.robots || "follow, index"
  const canonicalUrl = props.canonicalUrl === undefined ? props.url : props.canonicalUrl

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
          <meta property="article:published_time" content={props.date} />
          <meta property="article:author" content={CONFIG.profile.name} />
        </>
      )}
    </Head>
  )
}

export default MetaConfig
