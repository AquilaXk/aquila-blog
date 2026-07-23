import { CONFIG } from "site.config"
import type { MetaConfigProps } from "src/components/MetaConfig"
import type { TPost } from "src/types"
import { toCanonicalPostPath } from "src/libs/utils/postPath"

type JsonLdObject = Record<string, unknown>

const SITE_TITLE = CONFIG.blog.title || "AquilaLog"
const SITE_URL = CONFIG.link.replace(/\/+$/, "")

const toIsoDate = (value: string | undefined) => {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

const normalizePostImage = (post: TPost) =>
  post.thumbnail?.trim() ||
  `${CONFIG.ogImageGenerateURL}/${encodeURIComponent(post.title)}.png`

const normalizeAuthorName = (post: TPost) =>
  post.author?.find((author) => author.name.trim().length > 0)?.name.trim() ||
  "익명"

const buildBlogPostingJsonLd = ({
  post,
  canonicalUrl,
  publishedDate,
  modifiedDate,
  image,
}: {
  post: TPost
  canonicalUrl: string
  publishedDate?: string
  modifiedDate?: string
  image: string
}): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: post.title,
  description: post.summary || "",
  url: canonicalUrl,
  mainEntityOfPage: canonicalUrl,
  ...(publishedDate ? { datePublished: publishedDate } : {}),
  ...(modifiedDate ? { dateModified: modifiedDate } : {}),
  ...(image ? { image: [image] } : {}),
  author: {
    "@type": "Person",
    name: normalizeAuthorName(post),
  },
  publisher: {
    "@type": "Organization",
    name: SITE_TITLE,
  },
})

const buildBreadcrumbJsonLd = (
  post: TPost,
  canonicalUrl: string
): JsonLdObject => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "홈",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: post.title,
      item: canonicalUrl,
    },
  ],
})

export const buildPostDetailMetadata = (post: TPost): MetaConfigProps => {
  const canonicalPath = toCanonicalPostPath(post.id)
  const canonicalUrl = `${SITE_URL}${canonicalPath}`
  const publishedDate = toIsoDate(post.createdTime || post.date?.start_date)
  const modifiedDate = toIsoDate(
    post.modifiedTime || post.createdTime || post.date?.start_date
  )
  const image = normalizePostImage(post)

  return {
    title: post.title,
    date: publishedDate,
    modifiedDate,
    image,
    description: post.summary || "",
    type: Array.isArray(post.type) ? post.type[0] : post.type,
    url: canonicalUrl,
    jsonLd: [
      buildBlogPostingJsonLd({
        post,
        canonicalUrl,
        publishedDate,
        modifiedDate,
        image,
      }),
      buildBreadcrumbJsonLd(post, canonicalUrl),
    ],
  }
}
