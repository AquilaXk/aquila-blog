import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin dashboard state contract", () => {
  test("운영 대시보드 workspace model helper는 route-level model이 소유한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")
    const modelPath = path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspaceModel.ts")

    if (!existsSync(modelPath)) {
      expect(existsSync(modelPath), "AdminDashboardWorkspaceModel.ts should exist").toBe(true)
      return
    }

    const modelSource = readFileSync(modelPath, "utf8")

    expect(source).toContain('from "src/routes/Admin/AdminDashboardWorkspaceModel"')
    expect(modelSource).toContain("export const EMPTY_INITIAL_SNAPSHOT")
    expect(modelSource).toContain("export const ADMIN_DASHBOARD_DISPLAY_TIME_ZONE")
    expect(modelSource).toContain("export const formatInstant")
    expect(modelSource).toContain("export const formatAge")
    expect(modelSource).toContain("export const getMailStatusLabel")
    expect(modelSource).toContain("export const getMailStatusTone")
    expect(modelSource).toContain("export const getTaskQueueTone")
    expect(modelSource).toContain("export type DashboardSnapshotPayload")
    expect(modelSource).toContain("export type DashboardKpiCard")
    expect(modelSource).toContain("export type DashboardPriorityRow")
    expect(modelSource).toContain("export type DashboardQuickAction")
    expect(source).not.toContain("const ADMIN_DASHBOARD_DISPLAY_TIME_ZONE")
    expect(source).not.toContain("const formatInstant")
    expect(source).not.toContain("const getMailStatusLabel")
    expect(source).not.toContain("const getTaskQueueTone")
  })
})
