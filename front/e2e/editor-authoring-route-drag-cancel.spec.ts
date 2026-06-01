import { expect, test, type Page } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
  expectListItemHandleReady,
  hoverListItemGutter,
} from "./helpers/editorAuthoringFlow"
import { post507Markdown } from "./helpers/post507Fixtures"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const routePost507Editor = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(adminMember),
    })
  })
  await page.route("**/post/api/v1/adm/posts/995", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 995,
        version: 5,
        title: "live 507 drag cancel cleanup 글",
        content: post507Markdown,
        contentHtml: null,
        published: true,
        listed: true,
      }),
    })
  })

  await page.goto("/editor/995")
  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
    "live 507 drag cancel cleanup 글"
  )
  await expectEditorToContainLoadedText(editor, "Stateless 의미")
  return editor
}

const readDragResidue = (page: Page) =>
  page.evaluate(() => ({
    cursor: document.body.style.cursor,
    ghostCount: document.querySelectorAll("[data-testid='block-drag-ghost']").length,
    indicatorCount: document.querySelectorAll("[data-testid='block-drop-indicator']").length,
    scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
    userSelect: document.body.style.userSelect,
  }))

const readListItemDraggable = (page: Page, label: string) =>
  page.evaluate((targetLabel) => {
    const readOwnLabel = (item: HTMLElement) =>
      Array.from(item.childNodes)
        .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
        .map((node) => node.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    const targetItem = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
    ).find((item) => readOwnLabel(item) === targetLabel)
    return targetItem?.getAttribute("draggable") ?? null
  }, label)

test.describe("editor authoring route drag cancel cleanup", () => {
  test("live 507 block/list drag cancel은 stale ghost와 scroll lock을 남기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const editor = await routePost507Editor(page)

    const sourceParagraph = editor.locator("p", { hasText: "백엔드 인증을 처음 배우면" }).first()
    const destinationParagraph = editor.locator("p", { hasText: "이 구조는 아주 직관적" }).first()
    await sourceParagraph.scrollIntoViewIfNeeded()
    await sourceParagraph.hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    const [handleBox, destinationBox] = await Promise.all([
      dragHandle.boundingBox(),
      destinationParagraph.boundingBox(),
    ])
    if (!handleBox || !destinationBox) {
      throw new Error("live 507 top-level drag cancel 좌표를 계산할 수 없습니다.")
    }

    const pointerId = 5951
    await dragHandle.dispatchEvent("pointerdown", {
      pointerId,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
      clientX: handleBox.x + handleBox.width / 2,
      clientY: handleBox.y + handleBox.height / 2,
      bubbles: true,
      cancelable: true,
    })
    await page.evaluate(
      ({ endX, endY, pointerId: nextPointerId }) => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: nextPointerId,
            pointerType: "mouse",
            button: 0,
            buttons: 1,
            clientX: endX,
            clientY: endY,
            bubbles: true,
            cancelable: true,
          })
        )
      },
      {
        endX: destinationBox.x + Math.min(24, destinationBox.width / 3),
        endY: destinationBox.y + destinationBox.height / 2,
        pointerId,
      }
    )
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new Event("blur")))
    await expect.poll(() => readDragResidue(page)).toMatchObject({
      cursor: "",
      ghostCount: 0,
      indicatorCount: 0,
      userSelect: "",
    })

    const scrollBeforeTopLevelCancel = (await readDragResidue(page)).scrollTop
    await page.mouse.wheel(0, 320)
    await expect.poll(async () => (await readDragResidue(page)).scrollTop).toBeGreaterThan(
      scrollBeforeTopLevelCancel + 80
    )

    const firstListItem = "“Stateless가 좋다는데, 왜 좋은 거지?”"
    await editor.locator("li", { hasText: firstListItem }).first().scrollIntoViewIfNeeded()

    await hoverListItemGutter(page, firstListItem)
    const { handleBox: listHandleBox } = await expectListItemHandleReady(
      page,
      firstListItem,
      "목록 항목 이동"
    )
    const listEscapeEnd = {
      x: listHandleBox.x + listHandleBox.width / 2 + 12,
      y: listHandleBox.y + listHandleBox.height / 2 + 48,
    }

    await page.mouse.move(listHandleBox.x + listHandleBox.width / 2, listHandleBox.y + listHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(listEscapeEnd.x, listEscapeEnd.y, { steps: 12 })
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect.poll(() => readDragResidue(page)).toMatchObject({
      cursor: "",
      ghostCount: 0,
      indicatorCount: 0,
      userSelect: "",
    })

    await hoverListItemGutter(page, firstListItem)
    const { handleBox: pointerCancelHandleBox } = await expectListItemHandleReady(
      page,
      firstListItem,
      "목록 항목 이동"
    )
    const pointerCancelEnd = {
      x: pointerCancelHandleBox.x + pointerCancelHandleBox.width / 2 + 12,
      y: pointerCancelHandleBox.y + pointerCancelHandleBox.height / 2 + 48,
    }

    await page.mouse.move(
      pointerCancelHandleBox.x + pointerCancelHandleBox.width / 2,
      pointerCancelHandleBox.y + pointerCancelHandleBox.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(pointerCancelEnd.x, pointerCancelEnd.y, { steps: 12 })
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()

    await page.evaluate(
      ({ endX, endY, pointerId: nextPointerId }) => {
        window.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: nextPointerId,
            pointerType: "mouse",
            button: 0,
            buttons: 0,
            clientX: endX,
            clientY: endY,
            bubbles: true,
            cancelable: true,
          })
        )
      },
      {
        endX: pointerCancelEnd.x,
        endY: pointerCancelEnd.y,
        pointerId: 1,
      }
    )
    await page.mouse.up()
    await expect.poll(() => readDragResidue(page)).toMatchObject({
      cursor: "",
      ghostCount: 0,
      indicatorCount: 0,
      userSelect: "",
    })

    const scrollBeforeListCancel = (await readDragResidue(page)).scrollTop
    await page.mouse.wheel(0, 320)
    await expect.poll(async () => (await readDragResidue(page)).scrollTop).toBeGreaterThan(
      scrollBeforeListCancel + 80
    )
  })

  test("live 507 list pending drag cancel은 draggable을 복구한다", async ({ page }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const editor = await routePost507Editor(page)
    const firstListItem = "“Stateless가 좋다는데, 왜 좋은 거지?”"
    await editor.locator("li", { hasText: firstListItem }).first().scrollIntoViewIfNeeded()

    await hoverListItemGutter(page, firstListItem)
    const { handleBox: pendingHandleBox } = await expectListItemHandleReady(
      page,
      firstListItem,
      "목록 항목 이동"
    )
    await page.getByRole("button", { name: "목록 항목 이동" }).dispatchEvent("pointerdown", {
      pointerId: 5950,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
      clientX: pendingHandleBox.x + pendingHandleBox.width / 2,
      clientY: pendingHandleBox.y + pendingHandleBox.height / 2,
      bubbles: true,
      cancelable: true,
    })
    await page.keyboard.press("Escape")

    await expect.poll(() => readListItemDraggable(page, firstListItem)).toBe("true")
    await expect.poll(() => readDragResidue(page)).toMatchObject({
      cursor: "",
      ghostCount: 0,
      indicatorCount: 0,
      userSelect: "",
    })
  })
})
