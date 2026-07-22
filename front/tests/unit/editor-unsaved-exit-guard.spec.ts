import { expect, test } from "@playwright/test"
import {
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isEditorUnsavedDirtyLabel,
  isForcedEditorExitUrl,
} from "../../src/routes/Admin/editorStudioUnsavedExitGuard"

test.describe("editor unsaved exit guard helpers", () => {
  test("treats only the dirty persistence label as unsaved", () => {
    expect(isEditorUnsavedDirtyLabel("저장되지 않은 변경")).toBe(true)
    expect(isEditorUnsavedDirtyLabel("자동 저장됨")).toBe(false)
    expect(isEditorUnsavedDirtyLabel("저장됨")).toBe(false)
    expect(isEditorUnsavedDirtyLabel("저장 중")).toBe(false)
    expect(isEditorUnsavedDirtyLabel("")).toBe(false)
  })

  test("allows forced login redirects without blocking", () => {
    expect(isForcedEditorExitUrl("/login")).toBe(true)
    expect(isForcedEditorExitUrl("/login?next=%2Feditor%2F1")).toBe(true)
    expect(isForcedEditorExitUrl("/editor/1")).toBe(false)
    expect(isForcedEditorExitUrl("/admin/posts")).toBe(false)
  })

  test("keeps a stable user-facing unsaved message", () => {
    expect(EDITOR_UNSAVED_CHANGES_MESSAGE).toContain("저장되지 않은 변경")
  })
})
