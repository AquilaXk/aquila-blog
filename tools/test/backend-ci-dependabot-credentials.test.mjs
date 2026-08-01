import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowRoot = path.join(repoRoot, ".github/workflows")
const backendPullRequestWorkflow = readFileSync(
  path.join(repoRoot, ".github/workflows/backend-ci.yml"),
  "utf8",
)

// 테스트 자격 증명 fallback 규칙 (#1510, #1523)
// `.github/workflows/**`에서 아래 secret을 읽는 모든 `${{ ... }}` 표현식은
// secret이 비어 있는 실행 컨텍스트(Dependabot PR 등)에서도 결정적 기본값을 받도록
// `${{ secrets.X || '<test-only-default>' }}` 형태를 사용한다.
// caller와 reusable workflow 정의 중 한쪽만 고르지 않고 참조 지점 전부에 적용한다.
const testCredentialDefaults = new Map([
  ["CI_DB_PASSWORD", "test_db_password_change_me"],
  ["CI_REDIS_PASSWORD", "test_redis_password_change_me"],
])

const listWorkflowFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return listWorkflowFiles(entryPath)
    }
    return /\.ya?ml$/.test(entry.name) ? [entryPath] : []
  })

const readReference = (name) => new RegExp(`\\bsecrets\\.${name}\\b`)

const readReferenceWithFallback = (name, fallbackValue) =>
  new RegExp(`\\bsecrets\\.${name}\\b\\s*\\|\\|\\s*(['"])${fallbackValue}\\1`)

const collectCredentialReferences = () => {
  const references = []

  for (const filePath of listWorkflowFiles(workflowRoot)) {
    const workflow = path.relative(repoRoot, filePath)

    readFileSync(filePath, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const match of line.matchAll(/\$\{\{(.*?)\}\}/g)) {
          const expression = match[1]

          for (const [name, fallbackValue] of testCredentialDefaults) {
            if (!readReference(name).test(expression)) {
              continue
            }
            references.push({
              workflow,
              location: `${workflow}:${index + 1}`,
              name,
              hasFallback: readReferenceWithFallback(name, fallbackValue).test(expression),
            })
          }
        }
      })
  }

  return references
}

test("backend PR CI falls back to isolated test credentials when Dependabot secrets are empty", () => {
  assert.match(
    backendPullRequestWorkflow,
    /CI_DB_PASSWORD:\s*\$\{\{\s*secrets\.CI_DB_PASSWORD\s*\|\|\s*['"]test_db_password_change_me['"]\s*\}\}/,
  )
  assert.match(
    backendPullRequestWorkflow,
    /CI_REDIS_PASSWORD:\s*\$\{\{\s*secrets\.CI_REDIS_PASSWORD\s*\|\|\s*['"]test_redis_password_change_me['"]\s*\}\}/,
  )
})

test("credential fallback scan reaches every workflow consumer", () => {
  const workflowFiles = listWorkflowFiles(workflowRoot)
  assert.ok(workflowFiles.length > 0, "스캔한 workflow 파일이 없다")

  const references = collectCredentialReferences()
  const scannedNames = new Set(references.map((reference) => reference.name))

  assert.deepEqual(
    [...testCredentialDefaults.keys()].filter((name) => !scannedNames.has(name)),
    [],
    "스캐너가 참조를 하나도 찾지 못한 secret이 있다",
  )
})

test("every workflow reference to shared test credentials carries the fallback default", () => {
  const missing = collectCredentialReferences()
    .filter((reference) => !reference.hasFallback)
    .map((reference) => `${reference.location} ${reference.name}`)

  assert.deepEqual(missing, [], "fallback 없이 test credential을 참조하는 지점이 있다")
})

test("workflows declaring the credentials as workflow_call secrets also apply the fallback", () => {
  const references = collectCredentialReferences()
  const gaps = []

  for (const filePath of listWorkflowFiles(workflowRoot)) {
    const content = readFileSync(filePath, "utf8")
    if (!content.includes("workflow_call:")) {
      continue
    }

    const workflow = path.relative(repoRoot, filePath)
    for (const name of testCredentialDefaults.keys()) {
      if (!new RegExp(`^\\s+${name}:\\s*$`, "m").test(content)) {
        continue
      }
      const applied = references.some(
        (reference) =>
          reference.workflow === workflow && reference.name === name && reference.hasFallback,
      )
      if (!applied) {
        gaps.push(`${workflow} ${name}`)
      }
    }
  }

  assert.deepEqual(gaps, [], "workflow_call secret을 선언한 workflow의 정의 쪽 fallback이 없다")
})
