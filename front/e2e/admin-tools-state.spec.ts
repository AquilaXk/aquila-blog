import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin tools state contract", () => {
  test("운영 도구 workspace model helper는 route-level model이 소유한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const modelPath = path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspaceModel.ts")

    if (!existsSync(modelPath)) {
      expect(existsSync(modelPath), "AdminToolsWorkspaceModel.ts should exist").toBe(true)
      return
    }

    const modelSource = readFileSync(modelPath, "utf8")

    expect(source).toContain('from "src/routes/Admin/AdminToolsWorkspaceModel"')
    expect(modelSource).toContain("export const ADMIN_TOOLS_DISPLAY_TIME_ZONE")
    expect(modelSource).toContain("export const ACTION_META")
    expect(modelSource).toContain("export const SECTION_IDS")
    expect(modelSource).toContain("export const formatInstant")
    expect(modelSource).toContain("export const getFreshnessMeta")
    expect(modelSource).toContain("export const buildExecutionSummary")
    expect(modelSource).toContain("export const getStatusTone")
    expect(modelSource).toContain("export type ExecutionEntry")
    expect(modelSource).toContain("export type ExecutionResultFilter")
    expect(source).not.toContain("const ACTION_META")
    expect(source).not.toContain("const formatInstant")
    expect(source).not.toContain("const getFreshnessMeta")
    expect(source).not.toContain("const buildExecutionSummary")
    expect(source).not.toContain("const getStatusTone")
  })

  test("운영 도구는 helper copy와 읽기 전용 pill 없이 요약 카드와 실행 버튼만 남긴다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const styleSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.ts"), "utf8")

    expect(source).toContain("문제 확인과 복구를 같은 흐름에서 처리합니다")
    expect(styleSource).toContain("grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));")
    expect(source).not.toContain("메일, 작업 큐, 정리 상태, 보안 이벤트처럼 장애와 직접 연결되는 항목만 우선 다룹니다.")
    expect(source).not.toContain("<ReadonlyPill>읽기 전용</ReadonlyPill>")
    expect(source).not.toContain("진단 탭을 선택하면 해당 패널을 불러옵니다.")
    expect(source).not.toContain("정리와 보안 탭을 선택하면 해당 패널을 불러옵니다.")
    expect(source).not.toContain("운영 변경 없이 현재 상태와 영향 범위를 먼저 다시 확인합니다.")
    expect(source).not.toContain("복구 전에 같이 읽어야 할 화면과 기록으로 바로 이동합니다.")
    expect(source).not.toContain('data-emphasis="primary"')
  })

  test("운영 도구는 최근 진단 결과 panel 렌더링을 Admin route component로 위임한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const resultsPanelPath = path.resolve(__dirname, "../src/routes/Admin/AdminToolsResultsPanel.tsx")
    expect(existsSync(resultsPanelPath)).toBe(true)
    const resultsPanelSource = existsSync(resultsPanelPath) ? readFileSync(resultsPanelPath, "utf8") : ""

    expect(source).toContain('AdminToolsResultsPanel from "src/routes/Admin/AdminToolsResultsPanel"')
    expect(source).toContain("<AdminToolsResultsPanel")
    expect(resultsPanelSource).toContain("export type AdminToolsResultsPanelProps")
    expect(resultsPanelSource).toContain("export default function AdminToolsResultsPanel")
    expect(resultsPanelSource).toContain("<ResultFilterRow")
    expect(resultsPanelSource).toContain("<ResultsLayout")
    expect(resultsPanelSource).toContain("<ResultPrimaryCard")
    expect(resultsPanelSource).toContain("<ResultHistoryCard")
    expect(resultsPanelSource).toContain("<EmptyResultState")
    expect(resultsPanelSource).toContain("최근 진단 결과")
    expect(source).not.toContain("<ResultFilterRow")
    expect(source).not.toContain("<ResultsLayout")
    expect(source).not.toContain("<ResultPrimaryCard")
    expect(source).not.toContain("<ResultHistoryCard")
    expect(source).not.toContain("<EmptyResultState")
    expect(source.split("\n").length).toBeLessThan(1760)
  })

  test("운영 도구는 execution rail 렌더링을 Admin route component로 위임한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const executionRailPath = path.resolve(__dirname, "../src/routes/Admin/AdminToolsExecutionRail.tsx")
    expect(existsSync(executionRailPath)).toBe(true)
    const executionRailSource = existsSync(executionRailPath) ? readFileSync(executionRailPath, "utf8") : ""

    expect(source).toContain('AdminToolsExecutionRail from "src/routes/Admin/AdminToolsExecutionRail"')
    expect(source).toContain("<AdminToolsExecutionRail")
    expect(executionRailSource).toContain("export type AdminToolsExecutionRailProps")
    expect(executionRailSource).toContain("export default function AdminToolsExecutionRail")
    expect(executionRailSource).toContain("<ExecutionRail")
    expect(executionRailSource).toContain("<ActionGroupCard")
    expect(executionRailSource).toContain("실행 전 체크")
    expect(executionRailSource).toContain("위험 액션")
    expect(executionRailSource).toContain("런북/장애 문서")
    expect(source).not.toContain("<ExecutionRail")
    expect(source).not.toContain("<ActionGroupCard")
    expect(source).not.toContain("실행 전 체크")
    expect(source).not.toContain("위험 액션")
    expect(source).not.toContain("런북/장애 문서")
    expect(source.split("\n").length).toBeLessThan(1720)
  })

  test("운영 도구 fallback 상태는 미수집 라벨과 중립 tone으로 분류한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const modelSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspaceModel.ts"), "utf8")

    expect(modelSource).toContain('export const DATA_MISSING_STATUS_LABEL = "데이터 미수집"')
    expect(modelSource).toContain("export const isOperationalStatusMissing")
    expect(modelSource).toContain("export const normalizeOperationalStatusLabel")
    expect(source).toContain("normalizeOperationalStatusLabel(systemHealthQuery.data?.status")
    expect(source).toContain("isOperationalStatusMissing(rawSystemHealthStatus)")
    expect(source).not.toContain("DATA_MISSING_STATUS_LABEL")
    expect(source).not.toContain('systemHealthQuery.data?.status || "UNKNOWN"')
    expect(source).not.toContain('taskType: typeof parsed.taskQueue.taskType === "string" ? parsed.taskQueue.taskType : "UNKNOWN"')
    expect(source).not.toContain(': "미확인"')
    expect(source).not.toContain('? "갱신 중"\\n        : "열기"')
  })

  test("운영 도구 도메인별 fallback 상태는 공통 미수집 라벨을 반복하지 않는다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const modelSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspaceModel.ts"), "utf8")

    expect(modelSource).toContain('export const CONNECTION_UNAVAILABLE_STATUS_LABEL = "미연결"')
    expect(modelSource).toContain('export const DATA_EMPTY_STATUS_LABEL = "데이터 없음"')
    expect(modelSource).toContain('export const CHECK_REQUIRED_STATUS_LABEL = "점검 필요"')
    expect(modelSource).toContain("export const getDiagnosticFallbackStatusLabel =")
    expect(source).toContain("const isSystemHealthConnectionUnavailable = systemHealthQuery.isError && !hasSystemHealthStatus")
    expect(source).toContain("getDiagnosticFallbackStatusLabel(isMailLoading, mailDiagnosticsError)")
    expect(source).toContain("getDiagnosticFallbackStatusLabel(isQueueLoading, taskQueueDiagnosticsError)")
    expect(source).toContain("getDiagnosticFallbackStatusLabel(isCleanupLoading, cleanupDiagnosticsError)")
    expect(source).toContain("getDiagnosticFallbackStatusLabel(isAuthLoading, authSecurityEventsError)")
    expect(source).not.toContain('? "갱신 중"\\n        : DATA_MISSING_STATUS_LABEL')
  })
})
