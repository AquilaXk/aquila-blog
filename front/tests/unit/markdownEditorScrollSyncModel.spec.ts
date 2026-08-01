import { expect, test } from "@playwright/test"
import {
  collectMarkdownHeadings,
  mapScrollFocusBetweenAnchors,
} from "../../src/components/markdown-editor/markdownEditorScrollSyncModel"

test("collectMarkdownHeadings ignores fenced code and gives duplicate headings stable keys", () => {
  const headings = collectMarkdownHeadings([
    "## Start",
    "",
    "```md",
    "## Not a heading",
    "```",
    "",
    "### **Details**",
    "",
    "## Start",
  ].join("\n"))

  expect(headings.map(({ key, level, text }) => ({ key, level, text }))).toEqual([
    { key: "2:Start:0", level: 2, text: "Start" },
    { key: "3:Details:0", level: 3, text: "Details" },
    { key: "2:Start:1", level: 2, text: "Start" },
  ])
})

test("mapScrollFocusBetweenAnchors interpolates inside the matching heading interval", () => {
  const mapped = mapScrollFocusBetweenAnchors({
    sourceFocus: 500,
    sourceAnchors: [
      { key: "2:A:0", position: 200 },
      { key: "2:B:0", position: 800 },
    ],
    targetAnchors: [
      { key: "2:A:0", position: 300 },
      { key: "2:B:0", position: 1500 },
    ],
    sourceRange: { start: 0, end: 1000 },
    targetRange: { start: 0, end: 2000 },
  })

  expect(mapped).toBe(900)
})

test("mapScrollFocusBetweenAnchors falls back to body progress without headings", () => {
  const mapped = mapScrollFocusBetweenAnchors({
    sourceFocus: 250,
    sourceAnchors: [],
    targetAnchors: [],
    sourceRange: { start: 0, end: 1000 },
    targetRange: { start: 100, end: 2100 },
  })

  expect(mapped).toBe(600)
})
