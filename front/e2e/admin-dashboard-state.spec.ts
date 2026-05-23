import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readDashboardRouteSource = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, "../src/routes/Admin", relativePath), "utf8")

test.describe("admin dashboard state contract", () => {
  test("운영 대시보드 workspace model helper는 route-level model이 소유한다", () => {
    const source = readDashboardRouteSource("AdminDashboardWorkspacePage.tsx")
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

  test("운영 대시보드 미수집 상태는 단일 요약 라벨과 중립 tone으로 분류한다", () => {
    const source = readDashboardRouteSource("AdminDashboardWorkspacePage.tsx")
    const modelSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspaceModel.ts"), "utf8")

    expect(modelSource).toContain('export const DASHBOARD_DATA_MISSING_LABEL = "데이터 미수집"')
    expect(modelSource).toContain('export const DASHBOARD_BACKEND_CHECK_LABEL = "백엔드 확인 필요"')
    expect(modelSource).toContain("export const hasDashboardSnapshot")
    expect(modelSource).toContain("export const getSystemHealthStatusLabel")
    expect(modelSource).toContain("export const getSystemHealthTone")
    expect(modelSource).not.toContain('return value || "미확인"')
    expect(source).toContain("hasDashboardSnapshot(dashboardSnapshot)")
    expect(source).toContain("DASHBOARD_DATA_MISSING_LABEL")
    expect(source).toContain("DASHBOARD_BACKEND_CHECK_LABEL")
    expect(source).toContain("hasSnapshot ? [")
    expect(source).toContain('key: "snapshot-missing"')
    expect(source).not.toContain('systemHealthQuery.data?.status || "확인 전"')
    expect(source).not.toContain('value: dashboardSnapshot ? `${dashboardSnapshot.authSecurity.blockedEventCount}건` : "-"')
    expect(source).not.toContain(': "-"')
    expect(source).not.toContain('|| "없음"')
  })
})
