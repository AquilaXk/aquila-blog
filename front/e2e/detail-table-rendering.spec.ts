import { expect, test } from "@playwright/test"
import { mockAvatarAsset } from "./helpers/smokeFixtures"

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("detail table rendering", () => {
  test("normal explicit table은 editor와 같은 columnWidths 합계 폭으로 렌더한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })

    await page.route("**/post/api/v1/posts/777", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 777,
          createdAt: "2026-05-26T00:00:00Z",
          modifiedAt: "2026-05-26T00:00:00Z",
          authorId: 1,
          authorName: "관리자",
          authorUsername: "aquila",
          authorProfileImageDirectUrl: "/avatar.png",
          title: "normal table explicit width 회귀 방지",
          content: [
            "## 운영 체크리스트",
            "",
            '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
            "| **영역** | **점검 항목** | **확인 기준** |",
            "| --- | --- | --- |",
            "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
            "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
            "| 보안 | HTTPS 사용 | 필수 |",
            "| 저장소 | Refresh 저장 | DB/Redis |",
            "| 만료 | Access 짧게 | 15~60분 |",
            "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
          ].join("\n"),
          tags: ["테스트태그"],
          category: [],
          published: true,
          listed: true,
          likesCount: 0,
          commentsCount: 0,
          hitCount: 0,
          actorHasLiked: false,
          actorCanModify: false,
          actorCanDelete: false,
        }),
      })
    })

    await page.route("**/post/api/v1/posts/777/hit", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "200-1",
          msg: "ok",
          data: { hitCount: 1 },
        }),
      })
    })

    await page.goto("/posts/777")
    await expect(page.getByRole("heading", { name: "normal table explicit width 회귀 방지" })).toBeVisible()
    await expect(page.locator(".aq-markdown table").filter({ hasText: "Stateless 의미" })).toBeVisible()

    const metrics = await page.locator(".aq-markdown .aq-table-scroll").first().evaluate((element) => {
      const table = element.querySelector("table")
      const firstCell = table?.querySelector("th, td")
      const wrapperRect = element.getBoundingClientRect()
      const tableRect = table?.getBoundingClientRect()
      const firstCellRect = firstCell?.getBoundingClientRect()
      return {
        wrapperWidth: Math.round(wrapperRect.width),
        tableWidth: Math.round(tableRect?.width || 0),
        firstCellWidth: Math.round(firstCellRect?.width || 0),
        tableStyleWidth: (table as HTMLElement | null)?.style.width || "",
        colWidths: Array.from(table?.querySelectorAll("col") ?? []).map(
          (col) => (col as HTMLElement).style.width
        ),
      }
    })

    expect(metrics.tableStyleWidth).toBe("521px")
    expect(metrics.colWidths).toEqual(["119px", "192px", "210px"])
    expect(metrics.tableWidth).toBeGreaterThanOrEqual(519)
    expect(metrics.tableWidth).toBeLessThanOrEqual(526)
    expect(Math.abs(metrics.wrapperWidth - metrics.tableWidth)).toBeLessThanOrEqual(2)
    expect(metrics.firstCellWidth).toBeGreaterThanOrEqual(117)
    expect(metrics.firstCellWidth).toBeLessThanOrEqual(124)
  })
})
