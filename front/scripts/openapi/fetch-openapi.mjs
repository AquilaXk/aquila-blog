#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const DEFAULT_OPENAPI_URL = "http://127.0.0.1:8080/v3/api-docs"
const OUTPUT_PATH = "contracts/openapi/openapi.json"

const sourceUrl = (process.env.OPENAPI_SOURCE_URL || DEFAULT_OPENAPI_URL).trim()
const bearerToken = (process.env.OPENAPI_BEARER_TOKEN || "").trim()

const headers = {
  Accept: "application/json",
}

if (bearerToken) {
  headers.Authorization = `Bearer ${bearerToken}`
}

const fail = (message) => {
  console.error(`[openapi:fetch] ${message}`)
  process.exit(1)
}

const ensureOpenApiDocument = (json) => {
  if (!json || typeof json !== "object") {
    fail("OpenAPI 문서가 객체가 아닙니다.")
  }
  if (typeof json.openapi !== "string") {
    fail("OpenAPI 문서에 openapi 버전 필드가 없습니다.")
  }
}

const main = async () => {
  const response = await fetch(sourceUrl, { headers })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    const preview = body.slice(0, 300).replace(/\s+/g, " ").trim()
    fail(`요청 실패 status=${response.status} url=${sourceUrl} body="${preview}"`)
  }

  const json = await response.json().catch(() => null)
  ensureOpenApiDocument(json)

  const outputAbsolutePath = path.resolve(process.cwd(), OUTPUT_PATH)
  await fs.mkdir(path.dirname(outputAbsolutePath), { recursive: true })
  await fs.writeFile(outputAbsolutePath, `${JSON.stringify(json, null, 2)}\n`, "utf8")

  console.log(
    `[openapi:fetch] saved ${outputAbsolutePath} (openapi=${json.openapi}, title=${json.info?.title || "unknown"})`
  )
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
