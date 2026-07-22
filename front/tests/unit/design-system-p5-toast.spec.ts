import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = path.join(__dirname, "../..")

const readSrc = (relativePath: string) =>
  readFileSync(path.join(root, "src", relativePath), "utf8")

test("Toast exposes status live region and safe-area contract", () => {
  const source = readSrc("design-system/Toast.tsx")
  expect(source).toContain('role="status"')
  expect(source).toContain('aria-live="polite"')
  expect(source).toContain("fixedBottomSafeArea")
  expect(source).toContain('tone?: ToastTone')
  expect(source).toContain('"neutral" | "success" | "danger"')
})

test("layoutBreakpoint named constants match HIG P5-4 table", () => {
  const source = readSrc("design-system/tokens.ts")
  expect(source).toMatch(/editorCompact:\s*720/)
  expect(source).toMatch(/navCompact:\s*820/)
  expect(source).toMatch(/adminCompact:\s*1100/)
  expect(source).toMatch(/feedChipRail:\s*1200/)
  expect(source).toMatch(/feedSidebar:\s*1441/)
})

test("PostDetail styles no longer keep detail-v4 tokens", () => {
  const source = readSrc("routes/Detail/PostDetail/PostDetail.styles.ts")
  expect(source).not.toContain("--detail-v4-")
  expect(source).toContain("var(--aq-text)")
  expect(source).toContain("var(--aq-accent-link)")
})

test("Admin and Editor toast consumers import design-system Toast", () => {
  const adminFeedback = readSrc("routes/Admin/AdminPostsWorkspaceFeedbackLayer.tsx")
  const editorUndo = readSrc("routes/Admin/EditorStudioUndoToast.tsx")
  expect(adminFeedback).toContain('from "src/design-system/Toast"')
  expect(adminFeedback).toContain("ConfirmDialog")
  expect(editorUndo).toContain('from "src/design-system/Toast"')
})
