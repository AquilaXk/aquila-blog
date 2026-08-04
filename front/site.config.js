// 블로그 표면의 정본 URL. NEXT_PUBLIC_SITE_URL 기본값이자 isProd 판정 기준이다.
const PRODUCTION_SITE_URL = "https://blog.aquilaxk.site"
const INJECTED_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "")
const SITE_URL = INJECTED_SITE_URL || PRODUCTION_SITE_URL

// 같은 홈서버 이미지가 서빙하는 다른 두 공개 표면의 정본 URL이다. 회사 표면이 사이트 canonical이고
// apex는 그쪽으로 308한다 (2026-08-02 오너 결정 · docs/ops/homeserver-front-domain-cutover.md).
//
// 이 값들은 NEXT_PUBLIC_* 로 주입되지 않는다. 주입 대상은 브라우저 번들에 인라인되는 한 개의
// 빌드 인자뿐이고, 한 이미지가 세 호스트를 동시에 서빙하는 이상 "빌드 시점의 한 값"으로는 요청
// 호스트를 알 수 없다. 그래서 표면별 정본은 여기 고정하고, 실제 canonical/OG는 요청 호스트를
// 이 표와 대조해 고른다 (src/libs/publicSurfaceUrl.ts).
const COMPANY_SITE_URL = "https://www.aquilaxk.site"
const PRODUCT_SITE_URL = "https://easysubway.aquilaxk.site"
const CONTACT_EMAIL = "aquila@aquilaxk.site"
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
    bio: "백엔드 아키텍처와 운영 트러블슈팅을 기록합니다.",
    email: "aquilaxk10@gmail.com",
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
    title: "AquilaLog",
    description: "비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다",
    homeIntroTitle: "비밀스러운 IT 공작소",
    homeIntroDescription: "비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다",
    scheme: "light", // 'light' | 'dark' | 'system'
  },

  auth: {
    socialProviders: {
      kakao: { enabled: true },
      google: { enabled: parseBoolean(process.env.NEXT_PUBLIC_AUTH_SOCIAL_GOOGLE_ENABLED, false) },
      github: { enabled: parseBoolean(process.env.NEXT_PUBLIC_AUTH_SOCIAL_GITHUB_ENABLED, false) },
    },
  },

  // 홈서버 단일 이미지가 함께 서빙하는 공개 표면들. `link`(블로그)와 나란한 정본 URL 표이며,
  // `route`는 Caddy가 그 호스트의 루트 요청을 rewrite하는 Next 라우트다.
  surfaces: {
    company: {
      name: "Aquila Software",
      url: COMPANY_SITE_URL,
      route: "/company",
      contactEmail: CONTACT_EMAIL,
    },
    product: {
      name: "EasySubway",
      url: PRODUCT_SITE_URL,
      route: "/easysubway",
      contactEmail: CONTACT_EMAIL,
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
  // 운영 사이트 URL이 빌드에 명시적으로 주입된 경우에만 production으로 본다. 홈서버 이미지가
  // 유일한 운영 빌드 경로이고, NEXT_PUBLIC_*는 빌드 시점에 번들로 인라인되므로 이 값은 이미지
  // 빌드 인자로 넘어온 것이어야 한다. 호스팅 provider 환경변수를 두 번째 판정 소스로 두면
  // 운영이 아닌 빌드에서 GA와 web-vitals가 조용히 켜진다.
  isProd: INJECTED_SITE_URL === PRODUCTION_SITE_URL,
  revalidateTime: 3600, // revalidate time for [slug], index
}

module.exports = { CONFIG }
