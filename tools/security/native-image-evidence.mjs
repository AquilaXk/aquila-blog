import { readFileSync } from "node:fs"
import {
  extractTrivyCosignReport,
  filterTrivyReport,
  loadAllowlistForImport,
} from "../guards/check-vulnerability-exceptions.mjs"

const POLICY_ID = "aquila-native-image-evidence-v1"
const PREDICATE_TYPES = [
  "https://slsa.dev/provenance/v1",
  "https://spdx.dev/Document/v2.3",
  "https://cosign.sigstore.dev/attestation/vuln/v1",
]
const POLICY = {
  "AquilaXk/aquila-blog": {
    subject: "ghcr.io/aquilaxk/aquila-blog-back",
    signerWorkflow: "https://github.com/AquilaXk/aquila-blog/.github/workflows/deploy.yml@refs/heads/main",
    buildConfigWorkflows: {
      push: "https://github.com/AquilaXk/aquila-blog/.github/workflows/security.yml@refs/heads/main",
      workflow_dispatch: "https://github.com/AquilaXk/aquila-blog/.github/workflows/deploy.yml@refs/heads/main",
    },
  },
  "AquilaXk/aquila-blog-web": {
    subject: "ghcr.io/aquilaxk/aquila-blog-web-front",
    signerWorkflow: "https://github.com/AquilaXk/aquila-blog-web/.github/workflows/frontend-image.yml@refs/heads/main",
    buildConfigWorkflows: {
      push: "https://github.com/AquilaXk/aquila-blog-web/.github/workflows/frontend-image.yml@refs/heads/main",
    },
  },
}

function fail() {
  throw new Error("native image evidence verification failed")
}

function exactString(value) {
  return typeof value === "string" && value.length > 0
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function sourceDigestMatches(value, sha) {
  return value === sha
}

function assertEnvironment(environment) {
  const repo = environment.SOURCE_REPOSITORY
  const policy = POLICY[repo]
  const sha = environment.SOURCE_SHA
  const subject = environment.IMAGE_SUBJECT
  const digest = environment.IMAGE_DIGEST
  const buildTrigger = environment.EXPECTED_BUILD_TRIGGER
  const signerWorkflow = environment.SIGNER_WORKFLOW
  const runUri = environment.EXPECTED_RUN_URI
  const buildConfigWorkflow = policy?.buildConfigWorkflows?.[buildTrigger]

  if (!policy || !/^[a-f0-9]{40}$/.test(sha ?? "")) fail()
  if (!buildConfigWorkflow) fail()
  if (subject !== policy.subject || signerWorkflow !== policy.signerWorkflow) fail()
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) fail()
  if (runUri !== `https://github.com/${repo}/actions/runs/${runUri?.split("/").at(-3)}/attempts/${runUri?.split("/").at(-1)}`
    || !new RegExp(`^https://github\\.com/${repo}/actions/runs/[1-9][0-9]*/attempts/[1-9][0-9]*$`).test(runUri ?? "")) fail()

  return { repo, sha, subject, digest, buildConfigWorkflow, buildTrigger, signerWorkflow, runUri }
}

function assertPredicate(predicateType, predicate, expected, exceptions) {
  if (!object(predicate)) fail()

  if (predicateType === PREDICATE_TYPES[0]) {
    if (!object(predicate.buildDefinition) || !object(predicate.runDetails)) fail()
    return
  }

  if (predicateType === PREDICATE_TYPES[1]) {
    if (predicate.spdxVersion !== "SPDX-2.3"
      || predicate.SPDXID !== "SPDXRef-DOCUMENT"
      || predicate.dataLicense !== "CC0-1.0"
      || !Array.isArray(predicate.packages)
      || predicate.packages.length === 0) fail()
    return
  }

  let report
  try {
    report = extractTrivyCosignReport(predicate, {
      expectedArtifactName: `${expected.subject}@${expected.digest}`,
    })
  } catch {
    fail()
  }
  if (expected.repo === "AquilaXk/aquila-blog") {
    if (filterTrivyReport(report, exceptions).length > 0) fail()
    return
  }
  if (report.Results.some((result) => (
    Object.hasOwn(result, "Vulnerabilities") && result.Vulnerabilities.length !== 0
  ))) fail()
}

function parseAttestation(filePath, predicateType, expected, exceptions) {
  let entries
  try {
    entries = JSON.parse(readFileSync(filePath, "utf8"))
  } catch {
    fail()
  }
  if (!Array.isArray(entries) || entries.length === 0) fail()

  const matchingEntries = entries.filter((entry) => (
    entry?.verificationResult?.signature?.certificate?.runInvocationURI === expected.runUri
  ))
  if (matchingEntries.length !== 1) fail()

  const result = matchingEntries[0]?.verificationResult
  const statement = result?.statement
  const certificate = result?.signature?.certificate
  const digestHex = expected.digest.slice("sha256:".length)
  if (!statement || !certificate || statement.predicateType !== predicateType) fail()
  if (!Array.isArray(statement.subject) || statement.subject.length !== 1) fail()

  const [subject] = statement.subject
  if (subject?.name !== expected.subject || subject.digest === null || typeof subject.digest !== "object") fail()
  if (Object.keys(subject.digest).length !== 1 || subject.digest.sha256 !== digestHex) fail()
  if (certificate.sourceRepositoryURI !== `https://github.com/${expected.repo}`) fail()
  if (!sourceDigestMatches(certificate.sourceRepositoryDigest, expected.sha)) fail()
  if (certificate.sourceRepositoryRef !== "refs/heads/main") fail()
  if (certificate.subjectAlternativeName !== expected.signerWorkflow) fail()
  if (certificate.buildConfigURI !== expected.buildConfigWorkflow) fail()
  if (certificate.buildConfigDigest !== expected.sha) fail()
  if (certificate.buildSignerURI !== expected.signerWorkflow) fail()
  if (certificate.buildSignerDigest !== expected.sha) fail()
  if (certificate.buildTrigger !== expected.buildTrigger) fail()
  if (certificate.runInvocationURI !== expected.runUri) fail()
  if (certificate.githubWorkflowRepository !== expected.repo) fail()
  if (certificate.githubWorkflowSHA !== expected.sha) fail()
  if (certificate.githubWorkflowRef !== "refs/heads/main") fail()
  if (certificate.githubWorkflowTrigger !== expected.buildTrigger) fail()
  if (certificate.runnerEnvironment !== "github-hosted") fail()
  assertPredicate(predicateType, statement.predicate, expected, exceptions)
}

function verifyAttestationSet(paths, environment) {
  if (!Array.isArray(paths) || paths.length !== PREDICATE_TYPES.length || paths.some((value) => !exactString(value))) fail()
  const expected = assertEnvironment(environment)
  const exceptions = expected.repo === "AquilaXk/aquila-blog" ? loadAllowlistForImport() : []
  paths.forEach((filePath, index) => parseAttestation(filePath, PREDICATE_TYPES[index], expected, exceptions))

  return {
    policy_id: POLICY_ID,
    repo: expected.repo,
    sha: expected.sha,
    subject: expected.subject,
    digest: expected.digest,
    predicates: PREDICATE_TYPES,
    signer_workflow: expected.signerWorkflow,
    run_uri: expected.runUri,
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const [command, ...paths] = process.argv.slice(2)
    if (command !== "verify-attestation-set") fail()
    process.stdout.write(`${JSON.stringify(verifyAttestationSet(paths, process.env))}\n`)
  } catch {
    process.stderr.write("native image evidence verification failed\n")
    process.exitCode = 1
  }
}

export { POLICY_ID, PREDICATE_TYPES, verifyAttestationSet }
