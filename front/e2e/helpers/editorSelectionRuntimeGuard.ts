import type { ConsoleMessage, Page } from "@playwright/test"

const EDITOR_SELECTION_RUNTIME_MESSAGES = [
  "Selection passed to setSelection must point at the current document",
  "TextSelection endpoint not pointing into a node with inline content",
]

const matchesEditorSelectionRuntimeMessage = (text: string) =>
  EDITOR_SELECTION_RUNTIME_MESSAGES.some((message) => text.includes(message))

export const collectEditorSelectionRuntimeErrors = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (error) => {
    if (matchesEditorSelectionRuntimeMessage(error.message)) errors.push(error.message)
  })
  page.on("console", (message: ConsoleMessage) => {
    const text = message.text()
    if ((message.type() === "error" || message.type() === "warning") && matchesEditorSelectionRuntimeMessage(text)) {
      errors.push(text)
    }
  })
  return errors
}
