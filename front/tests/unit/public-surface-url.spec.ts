import { expect, test } from "@playwright/test"
import { CONFIG } from "../../site.config"
import { isPublicSurfaceHost, resolvePublicSurfaceUrl } from "../../src/libs/publicSurfaceUrl"

const COMPANY_URL = CONFIG.surfaces.company.url
const PRODUCT_URL = CONFIG.surfaces.product.url
const companyHost = COMPANY_URL.replace("https://", "")
const productHost = PRODUCT_URL.replace("https://", "")
const blogHost = CONFIG.link.replace(/^https?:\/\//, "")

test.describe("공개 표면 canonical 해석", () => {
  test("전용 호스트로 들어온 요청은 그 호스트 루트를 canonical로 쓴다", () => {
    // Caddy가 전용 호스트의 루트 요청을 표면 라우트로 rewrite하므로 공개 URL은 경로가 아니라 루트다.
    expect(resolvePublicSurfaceUrl("company", companyHost)).toBe(COMPANY_URL)
    expect(resolvePublicSurfaceUrl("product", productHost)).toBe(PRODUCT_URL)
  })

  test("대문자·포트·중복 헤더가 섞인 호스트도 같은 표면으로 정규화된다", () => {
    expect(resolvePublicSurfaceUrl("company", companyHost.toUpperCase())).toBe(COMPANY_URL)
    expect(resolvePublicSurfaceUrl("company", ` ${companyHost} , evil.example `)).toBe(COMPANY_URL)
  })

  test("블로그 호스트에서는 라우트 경로 자신이 공개 URL이다", () => {
    expect(resolvePublicSurfaceUrl("company", blogHost)).toBe(`${CONFIG.link}/company`)
    expect(resolvePublicSurfaceUrl("product", blogHost)).toBe(`${CONFIG.link}/easysubway`)
  })

  test("로컬 dev/e2e 호스트는 그대로 자기 origin을 쓴다", () => {
    expect(resolvePublicSurfaceUrl("company", "127.0.0.1:3100")).toBe("http://127.0.0.1:3100/company")
    expect(resolvePublicSurfaceUrl("product", "localhost:3000")).toBe("http://localhost:3000/easysubway")
  })

  test("모르는 호스트는 canonical로 승격되지 않는다", () => {
    // Host 헤더는 신뢰 경계 밖이다. 위조된 값이 canonical/OG로 나가면 우리 페이지가 남의 호스트를
    // 정본으로 광고한다.
    for (const forged of [
      "evil.example",
      `${companyHost}.evil.example`,
      "www.aquilaxk.site\nX-Injected: 1",
      "",
      undefined,
    ]) {
      expect(resolvePublicSurfaceUrl("company", forged)).toBe(COMPANY_URL)
      expect(resolvePublicSurfaceUrl("product", forged)).toBe(PRODUCT_URL)
    }
  })

  test("전용 호스트 판정은 다른 표면과 블로그 호스트를 구분한다", () => {
    expect(isPublicSurfaceHost("company", companyHost)).toBe(true)
    expect(isPublicSurfaceHost("company", productHost)).toBe(false)
    expect(isPublicSurfaceHost("product", productHost)).toBe(true)
    expect(isPublicSurfaceHost("product", blogHost)).toBe(false)
    expect(isPublicSurfaceHost("company", "127.0.0.1:3100")).toBe(false)
  })
})
