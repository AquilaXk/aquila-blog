import { expect, test } from "@playwright/test"
import {
  collectMarkdownHeadings,
  createSourceMirrorStyle,
  mapScrollFocusBetweenAnchors,
} from "../../src/components/markdown-editor/markdownEditorScrollSyncModel"

test("createSourceMirrorStyle sizes the mirror by the textarea content box, not the visual rect", () => {
  const style = createSourceMirrorStyle({
    clientWidth: 866,
    paddingTop: "30px",
    paddingRight: "32px",
    paddingBottom: "30px",
    paddingLeft: "32px",
    fontFamily: "monospace",
    fontSize: "13px",
    fontWeight: "500",
    fontStyle: "normal",
    lineHeight: "23.14px",
    letterSpacing: "normal",
    overflowWrap: "anywhere",
    wordBreak: "normal",
    tabSize: "2",
  })

  // scrollbar가 layout 폭을 차지하는 환경에서 border-box rect를 쓰면 mirror가 더 넓어져
  // textarea보다 늦게 wrap된다. clientWidth + border-box + border 0이 유일하게 안전한 조합이다.
  expect(style.width).toBe("866px")
  expect(style.boxSizing).toBe("border-box")
  expect(style.borderWidth).toBe("0")
  expect(style.whiteSpace).toBe("pre-wrap")
  expect(style.paddingLeft).toBe("32px")
  expect(style.overflowWrap).toBe("anywhere")
})

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

test("collectMarkdownHeadings keeps trailing hash that is part of the heading text", () => {
  const headings = collectMarkdownHeadings([
    "## C#",
    "",
    "## F#",
    "",
    "## Heading ###",
  ].join("\n"))

  expect(headings.map(({ key, text }) => ({ key, text }))).toEqual([
    { key: "2:C#:0", text: "C#" },
    { key: "2:F#:0", text: "F#" },
    { key: "2:Heading:0", text: "Heading" },
  ])
})

test("collectMarkdownHeadings strips inline html without leaving an injectable tag prefix", () => {
  const headings = collectMarkdownHeadings("## Alpha<x<script")

  expect(headings.map(({ text }) => text)).toEqual(["Alpha"])
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

test("mapScrollFocusBetweenAnchors keeps the first anchor that lands on the target range start", () => {
  const mapped = mapScrollFocusBetweenAnchors({
    sourceFocus: 60,
    sourceAnchors: [
      { key: "2:A:0", position: 60 },
      { key: "2:B:0", position: 400 },
    ],
    targetAnchors: [
      { key: "2:A:0", position: 0 },
      { key: "2:B:0", position: 800 },
    ],
    sourceRange: { start: 0, end: 1000 },
    targetRange: { start: 0, end: 1600 },
  })

  expect(mapped).toBe(0)
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
