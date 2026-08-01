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

// 소비자 목록은 하드코딩하지 않되, 참조가 조용히 사라져 뒤따르는 전수 검사가
// 대상 0건으로 vacuously 통과하는 상태는 막는다. 소비자를 실제로 줄이는 변경은
// 이 하한선도 함께 낮춰 의도를 드러내야 한다.
const minimumConsumerReferences = 6

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const listWorkflowFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return listWorkflowFiles(entryPath)
    }
    return /\.ya?ml$/.test(entry.name) ? [entryPath] : []
  })

// GitHub 표현식은 `secrets.NAME`과 `secrets['NAME']`을 모두 허용한다. 한 형태만 보면
// 다른 형태로 추가된 소비자가 참조 0건으로 집계돼 검사가 침묵 통과한다.
const secretAccessSource = (name) => {
  const escaped = escapeRegExp(name)
  return `secrets\\s*(?:\\.\\s*${escaped}\\b|\\[\\s*['"]${escaped}['"]\\s*\\])`
}

const secretAccessPattern = (name) => new RegExp(secretAccessSource(name))

const secretAccessWithFallbackPattern = (name, fallbackValue) =>
  new RegExp(`${secretAccessSource(name)}\\s*\\|\\|\\s*['"]${escapeRegExp(fallbackValue)}['"]`)

// 리터럴 키가 아닌 동적 인덱싱은 어떤 secret을 읽는지 정적으로 알 수 없어 fallback
// 적용 여부를 증명할 수 없다. 증명 불가는 통과가 아니라 실패로 다룬다.
const dynamicSecretAccessPattern = /secrets\s*\[\s*(?!['"])/

// 표현식은 YAML block scalar 안에서 줄바꿈될 수 있으므로 줄 단위가 아니라 파일
// 전체를 훑고, 매치 offset을 줄 번호로 환산한다.
const expressionPattern = /\$\{\{([\s\S]*?)\}\}/g

const lineNumberAt = (source, offset) => source.slice(0, offset).split("\n").length

const scanWorkflowSource = (workflow, source) => {
  const references = []
  const dynamicAccesses = []

  for (const match of source.matchAll(expressionPattern)) {
    const expression = match[1]
    const location = `${workflow}:${lineNumberAt(source, match.index)}`

    if (dynamicSecretAccessPattern.test(expression)) {
      dynamicAccesses.push(location)
    }

    for (const [name, fallbackValue] of testCredentialDefaults) {
      if (!secretAccessPattern(name).test(expression)) {
        continue
      }
      references.push({
        workflow,
        location,
        name,
        hasFallback: secretAccessWithFallbackPattern(name, fallbackValue).test(expression),
      })
    }
  }

  return { references, dynamicAccesses }
}

const scanWorkflows = () => {
  const references = []
  const dynamicAccesses = []

  for (const filePath of listWorkflowFiles(workflowRoot)) {
    const scan = scanWorkflowSource(
      path.relative(repoRoot, filePath),
      readFileSync(filePath, "utf8"),
    )
    references.push(...scan.references)
    dynamicAccesses.push(...scan.dynamicAccesses)
  }

  return { references, dynamicAccesses }
}

const scanFixture = (source) => scanWorkflowSource("fixture.yml", source)

const summarize = ({ name, location, hasFallback }) => ({ name, location, hasFallback })

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
  assert.ok(listWorkflowFiles(workflowRoot).length > 0, "스캔한 workflow 파일이 없다")

  const { references } = scanWorkflows()
  const shortfall = [...testCredentialDefaults.keys()]
    .map((name) => ({
      name,
      found: references.filter((reference) => reference.name === name).length,
    }))
    .filter((entry) => entry.found < minimumConsumerReferences)

  assert.deepEqual(shortfall, [], `secret별 참조가 최소 ${minimumConsumerReferences}건에 못 미친다`)
})

test("every workflow reference to shared test credentials carries the fallback default", () => {
  const missing = scanWorkflows()
    .references.filter((reference) => !reference.hasFallback)
    .map((reference) => `${reference.location} ${reference.name}`)

  assert.deepEqual(missing, [], "fallback 없이 test credential을 참조하는 지점이 있다")
})

test("workflows declaring the credentials as workflow_call secrets also apply the fallback", () => {
  const { references } = scanWorkflows()
  const gaps = []

  for (const filePath of listWorkflowFiles(workflowRoot)) {
    const content = readFileSync(filePath, "utf8")
    if (!content.includes("workflow_call:")) {
      continue
    }

    const workflow = path.relative(repoRoot, filePath)
    for (const name of testCredentialDefaults.keys()) {
      if (!new RegExp(`^\\s+${escapeRegExp(name)}:\\s*$`, "m").test(content)) {
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

test("workflows do not reach secrets through indexes the scan cannot resolve", () => {
  assert.deepEqual(
    scanWorkflows().dynamicAccesses,
    [],
    "동적 secret 인덱싱은 fallback 적용 여부를 정적으로 증명할 수 없다",
  )
})

test("scan detects index-access credential references", () => {
  const withoutFallback = scanFixture("      TEST_DB_PASSWORD: ${{ secrets['CI_DB_PASSWORD'] }}\n")
  assert.deepEqual(withoutFallback.references.map(summarize), [
    { name: "CI_DB_PASSWORD", location: "fixture.yml:1", hasFallback: false },
  ])

  const withFallback = scanFixture(
    "      TEST_DB_PASSWORD: ${{ secrets['CI_DB_PASSWORD'] || 'test_db_password_change_me' }}\n",
  )
  assert.deepEqual(withFallback.references.map(summarize), [
    { name: "CI_DB_PASSWORD", location: "fixture.yml:1", hasFallback: true },
  ])
})

test("scan detects credential references split across lines", () => {
  const withoutFallback = scanFixture(
    ["      TEST_REDIS_PASSWORD: >-", "        ${{ secrets.CI_REDIS_PASSWORD", "        }}", ""].join(
      "\n",
    ),
  )
  assert.deepEqual(withoutFallback.references.map(summarize), [
    { name: "CI_REDIS_PASSWORD", location: "fixture.yml:2", hasFallback: false },
  ])

  const withFallback = scanFixture(
    [
      "      TEST_REDIS_PASSWORD: >-",
      "        ${{ secrets.CI_REDIS_PASSWORD",
      "        || 'test_redis_password_change_me' }}",
      "",
    ].join("\n"),
  )
  assert.deepEqual(withFallback.references.map(summarize), [
    { name: "CI_REDIS_PASSWORD", location: "fixture.yml:2", hasFallback: true },
  ])
})

test("scan reports dynamic secret indexing instead of silently finding nothing", () => {
  const scan = scanFixture(
    "      TEST_DB_PASSWORD: ${{ secrets[format('CI_{0}', 'DB_PASSWORD')] }}\n",
  )

  assert.deepEqual(scan.dynamicAccesses, ["fixture.yml:1"])
  assert.deepEqual(scan.references, [])
})
