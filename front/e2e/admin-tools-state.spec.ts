import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin tools state contract", () => {
  test("운영 도구는 helper copy와 읽기 전용 pill 없이 요약 카드와 실행 버튼만 남긴다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")

    expect(source).toContain("문제 확인과 복구를 같은 흐름에서 처리합니다")
    expect(source).toContain("grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));")
    expect(source).not.toContain("메일, 작업 큐, 정리 상태, 보안 이벤트처럼 장애와 직접 연결되는 항목만 우선 다룹니다.")
    expect(source).not.toContain("<ReadonlyPill>읽기 전용</ReadonlyPill>")
    expect(source).not.toContain("진단 탭을 선택하면 해당 패널을 불러옵니다.")
    expect(source).not.toContain("정리와 보안 탭을 선택하면 해당 패널을 불러옵니다.")
    expect(source).not.toContain("운영 변경 없이 현재 상태와 영향 범위를 먼저 다시 확인합니다.")
    expect(source).not.toContain("복구 전에 같이 읽어야 할 화면과 기록으로 바로 이동합니다.")
    expect(source).not.toContain('data-emphasis="primary"')
  })
})
