import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = path.join(__dirname, "../..")

const readSrc = (relativePath: string) =>
  readFileSync(path.join(root, "src", relativePath), "utf8")

test("Toast exposes status live region and safe-area contract", () => {
  const source = readSrc("design-system/Toast.tsx")
  expect(source).toContain('role={isDanger ? "alert" : "status"}')
  expect(source).toContain('aria-live={isDanger ? "assertive" : "polite"}')
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

test("paused modal close skips restoreFocus so nested dialog keeps focus", () => {
  const source = readSrc("design-system/useModalFocusTrap.ts")
  expect(source).toContain("pausedRef.current = paused")
  expect(source).toContain("if (pausedRef.current) return")
  expect(source).toContain("restoreFocus(trigger)")
})

test("Admin derived controls keep compact touch min-height", () => {
  const source = readSrc("routes/Admin/AdminProfileWorkspace.styles.tokens.ts")
  expect(source).toMatch(/export const GhostButton[\s\S]*@media \(max-width: 1100px\) \{\s*min-height: \$\{control\.lg\}px;/)
  expect(source).toMatch(/export const MiniButton[\s\S]*@media \(max-width: 1100px\) \{\s*min-height: \$\{control\.lg\}px;/)
  expect(source).toMatch(/export const PreviewAnchor[\s\S]*@media \(max-width: 1100px\) \{\s*min-height: \$\{control\.lg\}px;/)
})

test("signup clear button reserves input end padding on compact widths", () => {
  const source = readSrc("pages/signup.tsx")
  expect(source).toContain("padding-inline-end: calc(${control.lg}px + 1rem)")
})
