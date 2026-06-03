import { test } from "@playwright/test"
import {
  expectPost507CodeGateSatisfied,
  expectPost507LowerGateTelemetryStable,
  installPost507InteractionTelemetry,
  mockEditorRouteWithPost507,
  runPost507LowerRealWorkflowGate,
  setupPost507ModifyRequestCapture,
} from "./helpers/post507Fixtures"

test.describe("editor authoring route post 507 lower real workflow gate", () => {
  test("실제 507 하단 code/table/body workflow는 저장 직전 content와 telemetry까지 한 번에 검증한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const postId = 990
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId,
      title: "post 507 lower real workflow gate 글",
    })
    const modifyCapture = await setupPost507ModifyRequestCapture(page, postId)

    await installPost507InteractionTelemetry(page)

    // cell text drag -> row axis selection -> column axis selection -> wheel scroll -> lower body/block state
    await runPost507LowerRealWorkflowGate(page, { editor, finalTable })
    await expectPost507LowerGateTelemetryStable(page, "post-507-lower-real-workflow")
    await expectPost507CodeGateSatisfied(page, modifyCapture)
  })
})
