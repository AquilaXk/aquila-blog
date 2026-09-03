import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "../..")
const verifier = path.join(root, "tools/ci/verify-testcontainers-results.mjs")
const workflowPath = path.join(root, ".github/workflows/reusable-backend-quality.yml")
const buildGradlePath = path.join(root, "back/build.gradle.kts")
const jacocoGradlePath = path.join(root, "back/gradle/backend-jacoco.gradle.kts")
const testInfraPath = path.join(root, "back/gradle/backend-test-infra.gradle.kts")
const flywayCompatibilityTestPath = path.join(
  root,
  "back/src/test/kotlin/com/back/infrastructure/FlywayNMinusOneCompatibilityTestcontainersIntegrationTest.kt",
)
const migrationResourcePaths = [
  path.join(root, "back/src/main/resources/db/migration"),
  path.join(root, "back/src/main/resources/db/migration-test"),
]

const fixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aquila-testcontainers-results-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

const runVerifier = (results, summary) =>
  spawnSync(process.execPath, [verifier, "--results", results, "--summary", summary], {
    cwd: root,
    encoding: "utf8",
  })

const readSummary = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

const extractBalancedBlock = (source, declaration) => {
  const start = source.indexOf(declaration)
  assert.notEqual(start, -1, `Missing declaration: ${declaration}`)
  const openingBrace = source.indexOf("{", start + declaration.length)
  assert.notEqual(openingBrace, -1, `Missing block for: ${declaration}`)

  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    if (source[index] === "}") depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  assert.fail(`Unclosed block for: ${declaration}`)
}

const extractWorkflowStep = (workflow, name) => {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  assert.notEqual(start, -1, `Missing workflow step: ${name}`)
  const nextStep = workflow.indexOf("\n      - ", start + marker.length)
  return workflow.slice(start, nextStep === -1 ? workflow.length : nextStep)
}

const writeReport = (directory, file, attributes) => {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, file),
    `<?xml version="1.0" encoding="UTF-8"?><testsuite name="Testcontainers" ${Object.entries(attributes)
      .map(([name, value]) => `${name}="${value}"`)
      .join(" ")}/>`,
  )
}

test("verifier fails closed for a missing report directory and writes a machine-readable summary", (t) => {
  const directory = fixture(t)
  const summary = path.join(directory, "summary.json")
  const result = runVerifier(path.join(directory, "missing"), summary)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /JUnit report directory is missing or unreadable/)
  assert.deepEqual(readSummary(summary), {
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "failed",
  })
})

test("verifier fails closed for a report directory without JUnit XML and writes a machine-readable summary", (t) => {
  const directory = fixture(t)
  const results = path.join(directory, "results")
  const summary = path.join(directory, "summary.json")
  fs.mkdirSync(results)
  fs.writeFileSync(path.join(results, "not-a-report.txt"), "missing XML")

  const result = runVerifier(results, summary)

  assert.notEqual(result.status, 0)
  assert.deepEqual(readSummary(summary), {
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "failed",
  })
})

test("verifier rejects aggregate zero tests and skipped Testcontainers tests", (t) => {
  const zeroDirectory = fixture(t)
  const zeroResults = path.join(zeroDirectory, "results")
  const zeroSummary = path.join(zeroDirectory, "summary.json")
  writeReport(zeroResults, "TEST-zero.xml", { tests: 0, skipped: 0, failures: 0, errors: 0 })

  const zeroResult = runVerifier(zeroResults, zeroSummary)
  assert.notEqual(zeroResult.status, 0)
  assert.deepEqual(readSummary(zeroSummary), {
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "failed",
  })

  const skippedDirectory = fixture(t)
  const skippedResults = path.join(skippedDirectory, "results")
  const skippedSummary = path.join(skippedDirectory, "summary.json")
  writeReport(skippedResults, "TEST-skipped.xml", { tests: 2, skipped: 1, failures: 0, errors: 0 })

  const skippedResult = runVerifier(skippedResults, skippedSummary)
  assert.notEqual(skippedResult.status, 0)
  assert.deepEqual(readSummary(skippedSummary), {
    tests: 2,
    skipped: 1,
    failures: 0,
    errors: 0,
    status: "failed",
  })
})

test("verifier rejects malformed counts and skipped tests in any report", (t) => {
  for (const attributes of [
    { tests: 1, skipped: 0, failures: 0 },
    { tests: "invalid", skipped: 0, failures: 0, errors: 0 },
    { tests: -1, skipped: 0, failures: 0, errors: 0 },
  ]) {
    const directory = fixture(t)
    const results = path.join(directory, "results")
    const summary = path.join(directory, "summary.json")
    writeReport(results, "TEST-malformed.xml", attributes)

    const result = runVerifier(results, summary)

    assert.notEqual(result.status, 0)
    assert.deepEqual(readSummary(summary), {
      tests: 0,
      skipped: 0,
      failures: 0,
      errors: 0,
      status: "failed",
    })
  }

  const directory = fixture(t)
  const results = path.join(directory, "results")
  const summary = path.join(directory, "summary.json")
  writeReport(results, "TEST-first.xml", { tests: 2, skipped: 0, failures: 0, errors: 0 })
  writeReport(results, "TEST-second.xml", { tests: 3, skipped: 1, failures: 0, errors: 0 })

  const result = runVerifier(results, summary)

  assert.notEqual(result.status, 0)
  assert.deepEqual(readSummary(summary), {
    tests: 5,
    skipped: 1,
    failures: 0,
    errors: 0,
    status: "failed",
  })

  const malformedDirectory = fixture(t)
  const malformedResults = path.join(malformedDirectory, "results")
  const malformedSummary = path.join(malformedDirectory, "summary.json")
  fs.mkdirSync(malformedResults)
  fs.writeFileSync(
    path.join(malformedResults, "TEST-malformed-xml.xml"),
    '<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase></testsuite>',
  )

  const malformedResult = runVerifier(malformedResults, malformedSummary)

  assert.notEqual(malformedResult.status, 0)
  assert.deepEqual(readSummary(malformedSummary), {
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "failed",
  })

  const commentedDirectory = fixture(t)
  const commentedResults = path.join(commentedDirectory, "results")
  const commentedSummary = path.join(commentedDirectory, "summary.json")
  fs.mkdirSync(commentedResults)
  fs.writeFileSync(
    path.join(commentedResults, "TEST-commented.xml"),
    '<testsuite tests="1" skipped="0" failures="0" errors="0"><!--metadata--><testcase/></testsuite>',
  )

  const commentedResult = runVerifier(commentedResults, commentedSummary)

  assert.notEqual(commentedResult.status, 0)
  assert.deepEqual(readSummary(commentedSummary), {
    tests: 0,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "failed",
  })

  const malformedDocuments = [
    '<testsuite tests="1" tests="0" skipped="0" failures="0" errors="0"/>',
    '<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase name="&unsupported;"/></testsuite>',
    '<testsuite tests="1" skipped="0" failures="0" errors="0"><?xml version="1.0"?><testcase/></testsuite>',
  ]
  for (const [index, document] of malformedDocuments.entries()) {
    const directory = fixture(t)
    const results = path.join(directory, "results")
    const summary = path.join(directory, "summary.json")
    fs.mkdirSync(results)
    fs.writeFileSync(path.join(results, `TEST-strict-${index}.xml`), document)

    const result = runVerifier(results, summary)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Malformed JUnit XML/)
    assert.deepEqual(readSummary(summary), {
      tests: 0,
      skipped: 0,
      failures: 0,
      errors: 0,
      status: "failed",
    })
  }
})

test("verifier aggregates multiple successful JUnit XML reports into the summary", (t) => {
  const directory = fixture(t)
  const results = path.join(directory, "results")
  const summary = path.join(directory, "summary.json")
  writeReport(results, "TEST-flyway.xml", { tests: 2, skipped: 0, failures: 0, errors: 0 })
  writeReport(results, "TEST-postgres.xml", { tests: 3, skipped: 0, failures: 0, errors: 0 })

  const result = runVerifier(results, summary)

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readSummary(summary), {
    tests: 5,
    skipped: 0,
    failures: 0,
    errors: 0,
    status: "passed",
  })
})

test("Gradle and reusable backend workflow fail closed and retain Testcontainers execution evidence", () => {
  const testInfra = fs.readFileSync(testInfraPath, "utf8")
  const workflow = fs.readFileSync(workflowPath, "utf8")
  const task = extractBalancedBlock(testInfra, 'tasks.register<Test>("testcontainersTest")')

  assert.match(task, /isFailOnNoMatchingTests\s*=\s*true/)
  assert.match(task, /failOnNoDiscoveredTests\s*=\s*true/)
  const contractTestBlock = extractWorkflowStep(workflow, "Test release planner guards")
  assert.match(contractTestBlock, /node --test[^\n]*tools\/test\/testcontainers-execution-contract\.test\.mjs/)

  const fullCheckBlock = extractWorkflowStep(workflow, "Run backend full check")
  const nodeSetupBlock = extractWorkflowStep(workflow, "Set up Node.js for canonical public contract check")
  const verifierBlock = extractWorkflowStep(workflow, "Verify Testcontainers execution evidence")
  const rawArtifactBlock = extractWorkflowStep(workflow, "Upload Testcontainers raw XML evidence")
  const summaryArtifactBlock = extractWorkflowStep(workflow, "Upload Testcontainers execution summary")
  assert(workflow.indexOf(fullCheckBlock) < workflow.indexOf(nodeSetupBlock))
  assert(workflow.indexOf(nodeSetupBlock) < workflow.indexOf(verifierBlock))
  assert(workflow.indexOf(verifierBlock) < workflow.indexOf(rawArtifactBlock))
  assert(workflow.indexOf(rawArtifactBlock) < workflow.indexOf(summaryArtifactBlock))
  assert.match(fullCheckBlock, /github\.event_name != 'pull_request'/)
  assert.match(nodeSetupBlock, /if: always\(\) && steps\.changes\.outputs\.backend == 'true'/)
  assert.match(verifierBlock, /if: always\(\) && steps\.changes\.outputs\.backend == 'true' && github\.event_name != 'pull_request'/)
  assert.match(verifierBlock, /node tools\/ci\/verify-testcontainers-results\.mjs/)
  assert.match(verifierBlock, /--results back\/build\/test-results\/testcontainersTest/)
  assert.match(verifierBlock, /--summary back\/build\/test-results\/testcontainers-summary\.json/)
  assert.doesNotMatch(verifierBlock, /continue-on-error:\s*true/)
  for (const artifactBlock of [rawArtifactBlock, summaryArtifactBlock]) {
    assert.match(artifactBlock, /if: always\(\) && steps\.changes\.outputs\.backend == 'true' && github\.event_name != 'pull_request'/)
    assert.match(artifactBlock, /uses: actions\/upload-artifact@[a-f0-9]{40}/)
    assert.match(artifactBlock, /if-no-files-found: error/)
  }
  assert.match(rawArtifactBlock, /name: testcontainers-raw-xml-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/)
  assert.match(rawArtifactBlock, /back\/build\/test-results\/testcontainersTest\/TEST-\*\.xml/)
  assert.doesNotMatch(rawArtifactBlock, /testcontainers-summary\.json/)
  assert.match(summaryArtifactBlock, /name: testcontainers-summary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/)
  assert.match(summaryArtifactBlock, /back\/build\/test-results\/testcontainers-summary\.json/)
  assert.doesNotMatch(summaryArtifactBlock, /testcontainersTest\/TEST-/)
})

test("Flyway migration naming admits the exact beforeMigrate SQL callback form", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8")
  const namingBlock = extractWorkflowStep(workflow, "Validate Flyway migration naming")

  assert.match(namingBlock, /\^beforeMigrate__\[a-z0-9_\]\+\\\.sql\$/)
  assert.match(namingBlock, /back\/src\/main\/kotlin\/db\/migration\/\*\.kt/)
  assert.match(namingBlock, /\^V\[0-9\]\{8\}_\[0-9\]\{2\}__\[A-Za-z0-9_\]\+\\\.kt\$/)
  assert.doesNotMatch(namingBlock, /\^R__\[A-Za-z0-9_\]\+\\\.kt\$/)

  const nMinusOneBlock = extractWorkflowStep(workflow, "Run Flyway N-1 compatibility test")
  assert.match(
    nMinusOneBlock,
    /--tests com\.back\.infrastructure\.ProfileWorkspaceSnapshotReconcileMigrationTestcontainersIntegrationTest/,
  )
  assert.match(workflow, /--tests com\.back\.infrastructure\.ProfileWorkspaceLegacyRetirementTestcontainersIntegrationTest/)
})

test("served cutovers do not retain temporary Flyway lifecycle callbacks", () => {
  for (const migrationResources of migrationResourcePaths) {
    const callbacks = fs.readdirSync(migrationResources).filter((file) => /^beforeMigrate__.+\.sql$/.test(file))
    assert.deepEqual(callbacks, [])
  }

  const compatibilityAcceptance = fs.readFileSync(flywayCompatibilityTestPath, "utf8")
  assert.doesNotMatch(compatibilityAcceptance, /beforeMigrate__|retired persistence recovery/)
})

test("Gradle resolves the approved Testcontainers family version in PR and main gates", () => {
  const buildGradle = fs.readFileSync(buildGradlePath, "utf8")
  const jacocoGradle = fs.readFileSync(jacocoGradlePath, "utf8")
  const alignmentTask = extractBalancedBlock(
    buildGradle,
    'tasks.register("verifyTestcontainersVersionAlignment")',
  )
  const ciFastCheck = extractBalancedBlock(jacocoGradle, 'tasks.register("ciFastCheck")')
  const fullCheck = extractBalancedBlock(jacocoGradle, 'tasks.named("check")')

  assert.match(buildGradle, /val testcontainersVersion\s*=\s*"1\.21\.4"/)
  assert.match(
    buildGradle,
    /testImplementation\("org\.testcontainers:junit-jupiter:\$testcontainersVersion"\)/,
  )
  assert.match(
    buildGradle,
    /testImplementation\("org\.testcontainers:postgresql:\$testcontainersVersion"\)/,
  )
  assert.match(
    buildGradle,
    /testImplementation\("org\.testcontainers:testcontainers:\$testcontainersVersion"\)/,
  )
  assert.match(alignmentTask, /testRuntimeClasspath/)
  assert.match(alignmentTask, /testRuntimeClasspath\.resolve\(\)/)
  assert.match(alignmentTask, /ModuleComponentIdentifier/)
  assert.match(alignmentTask, /org\.testcontainers/)
  assert.match(alignmentTask, /\.isEmpty\(\)/)
  assert.match(alignmentTask, /testcontainersVersion/)
  assert.match(alignmentTask, /GradleException/)
  assert.match(ciFastCheck, /"verifyTestcontainersVersionAlignment"/)
  assert.match(fullCheck, /"verifyTestcontainersVersionAlignment"/)
})
