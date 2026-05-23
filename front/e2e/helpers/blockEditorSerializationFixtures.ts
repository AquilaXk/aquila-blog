import { readFileSync } from "fs"
import path from "path"
import type { Page } from "@playwright/test"
import ts from "typescript"

const htmlToMarkdownModuleSource = readFileSync(
  path.resolve(__dirname, "../../src/libs/markdown/htmlToMarkdown.ts"),
  "utf8"
)

const transpiledHtmlToMarkdownModule = ts.transpileModule(htmlToMarkdownModuleSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText

export const convertHtmlToMarkdownInPage = async (page: Page, html: string) =>
  page.evaluate(
    ({ compiledSource, htmlSource }) => {
      const module = { exports: {} as { convertHtmlToMarkdown?: (value: string) => string } }
      const exports = module.exports
      const runner = new Function("module", "exports", compiledSource)
      runner(module, exports)
      return module.exports.convertHtmlToMarkdown?.(htmlSource) || ""
    },
    { compiledSource: transpiledHtmlToMarkdownModule, htmlSource: html }
  )

export const normalizeStructuredMarkdownClipboardInPage = async (page: Page, plainText: string) =>
  page.evaluate(
    ({ compiledSource, plainText: clipboardText }) => {
      const module = {
        exports: {} as {
          normalizeStructuredMarkdownClipboard?: (value: string) => string
          looksLikeStructuredMarkdownDocument?: (value: string) => boolean
        },
      }
      const exports = module.exports
      const runner = new Function("module", "exports", compiledSource)
      runner(module, exports)

      return {
        normalized: module.exports.normalizeStructuredMarkdownClipboard?.(clipboardText) || "",
        looksStructured: module.exports.looksLikeStructuredMarkdownDocument?.(clipboardText) || false,
      }
    },
    { compiledSource: transpiledHtmlToMarkdownModule, plainText }
  )
