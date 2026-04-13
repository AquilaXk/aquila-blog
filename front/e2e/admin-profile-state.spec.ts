import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin profile state contract", () => {
  test("profile 작업공간은 공통 section nav/action dock primitive 위에서 반응형 분기를 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

    expect(source).toContain("const SectionRail = styled(AdminWorkspaceSectionNav)`")
    expect(source).toContain("@media (max-width: 1180px)")
    expect(source).toContain("const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`")
    expect(source).toContain("role=\"tab\"")
    expect(source).toContain("aria-selected={activeSection === section.id}")
    expect(source).toContain("const EditorActionDock = styled(AdminWorkspaceActionDock)``")
    expect(source).toContain("<AdminWorkspaceActionDockInner>")
    expect(source).not.toContain("const MobileSectionRail = styled.div`")
    expect(source).not.toContain("<PreviewActionDock>")
  })
})
