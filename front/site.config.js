const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.aquilaxk.site").replace(/\/+$/, "")
/**
 * @param {string | undefined} value
 * @param {boolean} [defaultValue]
 */
const parseBoolean = (value, defaultValue = false) => {
  if (typeof value !== "string") return defaultValue
  return value.toLowerCase() === "true"
}

const CONFIG = {
  // profile setting (required)
  profile: {
    name: "aquilaXk",
    image: "/images/default-profile.svg",
    role: "backend developer",
    bio: "I develop everything using node.",
    email: "illusiveman7@gmail.com",
    linkedin: "",
    github: "aquilaXk",
    instagram: "",
  },
  projects: [
    {
      name: `aquila-blog`,
      href: "https://github.com/AquilaXk/aquila-blog",
    },
  ],
  // blog setting (required)
  blog: {
    title: "aquilaXk's Blog",
    description: "welcome to my backend dev log!",
    scheme: "dark", // 'light' | 'dark' | 'system'
  },

  auth: {
    socialProviders: {
      kakao: { enabled: true },
      google: { enabled: parseBoolean(process.env.NEXT_PUBLIC_AUTH_SOCIAL_GOOGLE_ENABLED, false) },
      github: { enabled: parseBoolean(process.env.NEXT_PUBLIC_AUTH_SOCIAL_GITHUB_ENABLED, false) },
    },
  },

  // CONFIG configration (required)
  link: SITE_URL,
  since: 2026, // If leave this empty, current year will be used.
  lang: "ko-KR", // ['en-US', 'zh-CN', 'zh-HK', 'zh-TW', 'ja-JP', 'es-ES', 'ko-KR']
  ogImageGenerateURL: "https://og-image-korean.vercel.app", // The link to generate OG image, don't end with a slash

  // notion configuration (required)
  notionConfig: {
    pageId: process.env.NOTION_PAGE_ID || "2ffdedd9d0ff81eaac21d05d868b6e2b",
  },

  // plugin configuration (optional)
  googleAnalytics: {
    enable: false,
    config: {
      measurementId: process.env.NEXT_PUBLIC_GOOGLE_MEASUREMENT_ID || "",
    },
  },
  googleSearchConsole: {
    enable: false,
    config: {
      siteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "",
    },
  },
  naverSearchAdvisor: {
    enable: false,
    config: {
      siteVerification: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || "",
    },
  },
  utterances: {
    enable: false,
    config: {
      repo: process.env.NEXT_PUBLIC_UTTERANCES_REPO || "aquilaXk/aquila-log",
      "issue-term": "og:title",
      label: "💬 Utterances",
    },
  },
  giscus: {
    enable: false,
    config: {
      repo: "aquilaXk/aquila-log",
      repositoryId: "R_kgDORJ7GcA",
      category: "Announcements",
      categoryId: "DIC_kwDORJ7GcM4C2ML9",
      lang: "ko",
    },
  },
  cusdis: {
    enable: false,
    config: {
      host: "https://cusdis.com",
      appid: "", // Embed Code -> data-app-id value
    },
  },
  isProd: process.env.VERCEL_ENV === "production", // distinguish between development and production environment (ref: https://vercel.com/docs/environment-variables#system-environment-variables)
  revalidateTime: 3600, // revalidate time for [slug], index
}

module.exports = { CONFIG }
