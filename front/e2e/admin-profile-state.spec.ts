import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin profile state contract", () => {
  test("760~1180 구간에서도 섹션 탭이 사라지지 않도록 반응형 분기를 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

    expect(source).toContain("const MobileSectionRail = styled.div`")
    expect(source).toContain("@media (max-width: 1180px)")
    expect(source).toContain("display: flex;")
    expect(source).toContain("flex-wrap: wrap;")
    expect(source).toContain("@media (max-width: 760px)")
    expect(source).toContain("flex-wrap: nowrap;")
    expect(source).toContain("overflow-x: auto;")
    expect(source).toContain("const SectionRail = styled.nav`")
    expect(source).toContain("@media (max-width: 1180px) {\n    display: none;")
  })
})
