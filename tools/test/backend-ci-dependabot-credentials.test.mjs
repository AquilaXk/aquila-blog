import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowRoot = path.join(repoRoot, ".github/workflows")
const backendPullRequestWorkflow = readFileSync(
  path.join(repoRoot, ".github/workflows/ci.yml"),
  "utf8",
)

const testCredentialSecrets = ["CI_DB_PASSWORD", "CI_REDIS_PASSWORD"]

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

const rawCredentialExpressionPattern = (name) =>
  new RegExp(`^\\s*${secretAccessSource(name)}\\s*$`)

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

    for (const name of testCredentialSecrets) {
      if (!secretAccessPattern(name).test(expression)) {
        continue
      }
      references.push({
        workflow,
        location,
        name,
        hasFallback: !rawCredentialExpressionPattern(name).test(expression),
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

const listReusableBackendQualityCallers = () =>
  listWorkflowFiles(workflowRoot)
    .flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8")
      const matches =
        source.match(
          /^\s*uses:\s*\.\/\.github\/workflows\/reusable-backend-quality\.yml\s*$/gm,
        ) ?? []
      const workflow = path.relative(repoRoot, filePath)
      return matches.map(() => workflow)
    })
    .sort()

const scanFixture = (source) => scanWorkflowSource("fixture.yml", source)

const summarize = ({ name, location, hasFallback }) => ({ name, location, hasFallback })

test("CI is the only reusable backend quality caller", () => {
  assert.deepEqual(listReusableBackendQualityCallers(), [".github/workflows/ci.yml"])
})

test("backend PR CI forwards raw test credentials to the Gradle chokepoint", () => {
  for (const name of testCredentialSecrets) {
    assert.match(
      backendPullRequestWorkflow,
      new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`),
    )
  }
})

test("credential scan reaches the backend PR CI raw credential references", () => {
  const { references } = scanWorkflows()
  const requiredWorkflow = ".github/workflows/ci.yml"

  for (const name of testCredentialSecrets) {
    assert.ok(
      references.some(
        (reference) =>
          reference.workflow === requiredWorkflow && reference.name === name && !reference.hasFallback,
      ),
      `${requiredWorkflow} must forward ${name} as a raw secret expression`,
    )
  }
})

test("every workflow reference to shared test credentials is raw", () => {
  const fallback = scanWorkflows()
    .references.filter((reference) => reference.hasFallback)
    .map((reference) => `${reference.location} ${reference.name}`)

  assert.deepEqual(fallback, [], "workflow은 credential 기본값을 알면 안 된다")
})

test("workflows declaring the credentials as workflow_call secrets forward them raw", () => {
  const { references } = scanWorkflows()
  const gaps = []

  for (const filePath of listWorkflowFiles(workflowRoot)) {
    const content = readFileSync(filePath, "utf8")
    if (!content.includes("workflow_call:")) {
      continue
    }

    const workflow = path.relative(repoRoot, filePath)
    for (const name of testCredentialSecrets) {
      if (!new RegExp(`^\\s+${escapeRegExp(name)}:\\s*$`, "m").test(content)) {
        continue
      }
      const applied = references.some(
        (reference) =>
          reference.workflow === workflow && reference.name === name && !reference.hasFallback,
      )
      if (!applied) {
        gaps.push(`${workflow} ${name}`)
      }
    }
  }

  assert.deepEqual(gaps, [], "workflow_call secret을 선언한 workflow의 raw 전달 지점이 없다")
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

test("scan rejects credential expressions with another provider fallback", () => {
  const scan = scanFixture(
    "      TEST_DB_PASSWORD: ${{ secrets.CI_DB_PASSWORD || vars.CI_DB_PASSWORD }}\n",
  )

  assert.deepEqual(scan.references.map(summarize), [
    { name: "CI_DB_PASSWORD", location: "fixture.yml:1", hasFallback: true },
  ])
})

test("scan reports dynamic secret indexing instead of silently finding nothing", () => {
  const scan = scanFixture(
    "      TEST_DB_PASSWORD: ${{ secrets[format('CI_{0}', 'DB_PASSWORD')] }}\n",
  )

  assert.deepEqual(scan.dynamicAccesses, ["fixture.yml:1"])
  assert.deepEqual(scan.references, [])
})

const gradleWrapper = path.join(repoRoot, "back/gradlew")
const testInfraScript = path.join(repoRoot, "back/gradle/backend-test-infra.gradle.kts")

const kotlinPath = (value) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')

const resolveFixtureCredentials = (env) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "aquila-test-credentials-"))
  const sanitizedEnvironment = { ...process.env }
  for (const name of [
    "TEST_DB_PASSWORD",
    "TEST_REDIS_PASSWORD",
    "SPRING__DATASOURCE__PASSWORD",
    "SPRING__DATA__REDIS__PASSWORD",
  ]) {
    delete sanitizedEnvironment[name]
  }
  try {
    writeFileSync(
      path.join(fixture, "settings.gradle.kts"),
      'rootProject.name = "test-credential-fixture"\n',
    )
    writeFileSync(
      path.join(fixture, "build.gradle.kts"),
      [
        'plugins { java }',
        'import org.gradle.api.tasks.testing.Test',
        `apply(from = file("${kotlinPath(testInfraScript)}"))`,
        'tasks.register("printTestCredentials") {',
        '    doLast {',
        '        val testTask = tasks.named<Test>("test").get()',
        '        println("DB=" + testTask.environment["SPRING__DATASOURCE__PASSWORD"])',
        '        println("REDIS=" + testTask.environment["SPRING__DATA__REDIS__PASSWORD"])',
        '    }',
        '}',
        '',
      ].join("\n"),
    )
    const output = execFileSync(
      gradleWrapper,
      ["-p", fixture, "--no-daemon", "--console=plain", "-q", "printTestCredentials"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...sanitizedEnvironment, ...env, TEST_INFRA_MODE: "none" },
        timeout: 55000,
      },
    )
    return Object.fromEntries(
      output
        .split(/\r?\n/)
        .filter((line) => line.startsWith("DB=") || line.startsWith("REDIS="))
        .map((line) => {
          const separator = line.indexOf("=")
          return [line.slice(0, separator), line.slice(separator + 1)]
        }),
    )
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

test("backend test infra resolves blank primary credentials through alias then default", () => {
  const cases = [
    {
      name: "unset uses defaults",
      env: {},
      expected: { DB: "test_db_password_change_me", REDIS: "test_redis_password_change_me" },
    },
    {
      name: "empty primary uses aliases",
      env: {
        TEST_DB_PASSWORD: "",
        TEST_REDIS_PASSWORD: "",
        SPRING__DATASOURCE__PASSWORD: "db-alias",
        SPRING__DATA__REDIS__PASSWORD: "redis-alias",
      },
      expected: { DB: "db-alias", REDIS: "redis-alias" },
    },
    {
      name: "empty primary and alias use defaults",
      env: {
        TEST_DB_PASSWORD: "",
        TEST_REDIS_PASSWORD: "",
        SPRING__DATASOURCE__PASSWORD: "",
        SPRING__DATA__REDIS__PASSWORD: "",
      },
      expected: { DB: "test_db_password_change_me", REDIS: "test_redis_password_change_me" },
    },
    {
      name: "whitespace primary uses aliases",
      env: {
        TEST_DB_PASSWORD: " \t ",
        TEST_REDIS_PASSWORD: "\n",
        SPRING__DATASOURCE__PASSWORD: "db-alias",
        SPRING__DATA__REDIS__PASSWORD: "redis-alias",
      },
      expected: { DB: "db-alias", REDIS: "redis-alias" },
    },
    {
      name: "whitespace primary and alias use defaults",
      env: {
        TEST_DB_PASSWORD: " \t ",
        TEST_REDIS_PASSWORD: "\n",
        SPRING__DATASOURCE__PASSWORD: " \t ",
        SPRING__DATA__REDIS__PASSWORD: "\n",
      },
      expected: { DB: "test_db_password_change_me", REDIS: "test_redis_password_change_me" },
    },
    {
      name: "primary wins over aliases",
      env: {
        TEST_DB_PASSWORD: "db-primary",
        TEST_REDIS_PASSWORD: "redis-primary",
        SPRING__DATASOURCE__PASSWORD: "db-alias",
        SPRING__DATA__REDIS__PASSWORD: "redis-alias",
      },
      expected: { DB: "db-primary", REDIS: "redis-primary" },
    },
    {
      name: "primary credentials preserve equals and trailing whitespace",
      env: {
        TEST_DB_PASSWORD: "db-primary=with=equals",
        TEST_REDIS_PASSWORD: "redis-primary \t ",
      },
      expected: { DB: "db-primary=with=equals", REDIS: "redis-primary \t " },
    },
  ]

  for (const fixture of cases) {
    assert.deepEqual(resolveFixtureCredentials(fixture.env), fixture.expected, fixture.name)
  }
})
