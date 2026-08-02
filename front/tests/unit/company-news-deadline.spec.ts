import { expect, test } from "@playwright/test"
import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next"
import { CONFIG } from "../../site.config"
import { getServerSideProps } from "../../src/pages/company"

// 소식 fetch의 서버측 정책 타임아웃은 8초다. 그 값이 회사 랜딩의 비캐시 TTFB를 정하면, 없어도
// 되는 섹션 하나 때문에 페이지 전체가 멈춘 것처럼 보인다. 페이지가 스스로 건 deadline이 그것을
// 끊는지 실측한다.
//
// 상한을 정책 타임아웃(8초) 기준으로 잡으면 deadline이 3.5초로 늘어나도 통과해 1.5초 계약을
// 못 지킨다. 페이지가 건 deadline 1.5초에 CI 지연 여유만 얹은 상한으로 좁혀 둔다.
const MAX_COMPANY_NEWS_DEADLINE_MS = 2_500

const originalFetch = globalThis.fetch
const originalBackendInternalUrl = process.env.BACKEND_INTERNAL_URL

type CompanyProps = { canonicalUrl: string; news: unknown[] }

const propsOf = (result: GetServerSidePropsResult<CompanyProps>): CompanyProps => {
  if (!("props" in result)) throw new Error("company page must return props")
  return result.props as CompanyProps
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBackendInternalUrl === undefined) delete process.env.BACKEND_INTERNAL_URL
  else process.env.BACKEND_INTERNAL_URL = originalBackendInternalUrl
})

test("소식 백엔드가 멈춰도 회사 랜딩은 deadline 안에 빈 소식으로 응답한다", async () => {
  process.env.BACKEND_INTERNAL_URL = "http://backend.test"

  // 응답하지 않는 backend. 정책 타임아웃(8초)만이 유일한 탈출구라면 이 await는 그만큼 걸린다.
  let releaseHungFetch = () => {}
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      releaseHungFetch = () => resolve(new Response(null, { status: 503 }))
    })) as typeof fetch

  const headers = new Map<string, string>()
  const context = {
    req: { headers: { host: CONFIG.surfaces.company.url.replace("https://", "") } },
    res: { setHeader: (name: string, value: string) => headers.set(name, String(value)) },
  } as unknown as GetServerSidePropsContext

  const startedAt = Date.now()
  const result = (await getServerSideProps(context)) as GetServerSidePropsResult<CompanyProps>
  const elapsedMs = Date.now() - startedAt

  try {
    // 선택 섹션은 사라진다. 자리를 채우는 카드를 만들지 않는다(placeholder 금지).
    expect(propsOf(result).news).toEqual([])
    // 페이지 자체는 정상 렌더 경로다 - canonical과 캐시 헤더가 그대로 나가야 한다.
    expect(propsOf(result).canonicalUrl).toBe(CONFIG.surfaces.company.url)
    expect(headers.get("Cache-Control")).toContain("s-maxage=300")
    // deadline이 정책 타임아웃보다 훨씬 먼저 끊었는지 본다.
    expect(elapsedMs).toBeLessThan(MAX_COMPANY_NEWS_DEADLINE_MS)
  } finally {
    releaseHungFetch()
  }
})
