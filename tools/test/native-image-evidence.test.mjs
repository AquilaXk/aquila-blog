import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const verifierPath = path.join(repoRoot, "tools/security/native-image-evidence.mjs")
const repo = "AquilaXk/aquila-blog"
const sha = "a".repeat(40)
const subject = "ghcr.io/aquilaxk/aquila-blog-back"
const digest = `sha256:${"b".repeat(64)}`
const signerWorkflow = `https://github.com/${repo}/.github/workflows/deploy.yml@refs/heads/main`
const runUri = `https://github.com/${repo}/actions/runs/123/attempts/1`

const predicateTypes = [
  "https://slsa.dev/provenance/v1",
  "https://spdx.dev/Document/v2.3",
  "https://cosign.sigstore.dev/attestation/vuln/v1",
]

function predicate(predicateType) {
  if (predicateType === predicateTypes[0]) {
    return { buildDefinition: {}, runDetails: {} }
  }
  if (predicateType === predicateTypes[1]) {
    return {
      spdxVersion: "SPDX-2.3",
      SPDXID: "SPDXRef-DOCUMENT",
      dataLicense: "CC0-1.0",
      packages: [{}],
    }
  }
  return {
    _type: predicateTypes[2],
    scanner: {
      uri: "https://trivy.dev",
      version: "0.72.0",
      db: { uri: "ghcr.io/aquasecurity/trivy-db", version: "2026-08-27" },
    },
    metadata: {},
    invocation: {},
    results: [{ vulnerabilities: [] }],
  }
}

function attestation(predicateType, overrides = {}) {
  return {
    verificationResult: {
      statement: {
        predicateType,
        predicate: predicate(predicateType),
        subject: [{ name: subject, digest: { sha256: digest.slice("sha256:".length) } }],
        ...overrides.statement,
      },
      signature: {
        certificate: {
          sourceRepositoryURI: `https://github.com/${repo}`,
          sourceRepositoryDigest: { sha1: sha },
          sourceRepositoryRef: "refs/heads/main",
          subjectAlternativeName: signerWorkflow,
          buildSignerURI: signerWorkflow,
          runInvocationURI: runUri,
          ...overrides.certificate,
        },
      },
    },
  }
}

function verify(input, environment = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "aquila-native-evidence-"))
  const paths = predicateTypes.map((predicateType, index) => {
    const file = path.join(directory, `${index}.json`)
    writeFileSync(file, JSON.stringify(input[index] ?? [attestation(predicateType)]))
    return file
  })
  const result = spawnSync("node", [verifierPath, "verify-attestation-set", ...paths], {
    encoding: "utf8",
    env: {
      ...process.env,
      SOURCE_REPOSITORY: repo,
      SOURCE_SHA: sha,
      IMAGE_SUBJECT: subject,
      IMAGE_DIGEST: digest,
      SIGNER_WORKFLOW: signerWorkflow,
      EXPECTED_RUN_URI: runUri,
      ...environment,
    },
  })
  rmSync(directory, { recursive: true, force: true })
  return result
}

test("verifies one exact attestation for each required predicate", () => {
  const result = verify([])

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    policy_id: "aquila-native-image-evidence-v1",
    repo,
    sha,
    subject,
    digest,
    predicates: predicateTypes,
    signer_workflow: signerWorkflow,
    run_uri: runUri,
  })
})

test("selects exactly one matching producer run from accumulated attestations", () => {
  const previousRun = `https://github.com/${repo}/actions/runs/122/attempts/1`
  const input = predicateTypes.map((predicateType) => [
    attestation(predicateType, { certificate: { runInvocationURI: previousRun } }),
    attestation(predicateType),
  ])

  const result = verify(input)
  assert.equal(result.status, 0, result.stderr)
})

test("rejects malformed inputs and an unexpected predicate", () => {
  const malformed = verify([[{}]])
  assert.notEqual(malformed.status, 0)

  const wrongPredicate = verify([[attestation("https://example.invalid/predicate")]])
  assert.notEqual(wrongPredicate.status, 0)
})

test("requires the gh signature certificate nesting and every predicate payload", () => {
  const missingPredicate = verify([[attestation(predicateTypes[0], { statement: { predicate: undefined } })]])
  assert.notEqual(missingPredicate.status, 0)

  const oldCertificateNesting = attestation(predicateTypes[0])
  oldCertificateNesting.verificationResult.certificate = oldCertificateNesting.verificationResult.signature.certificate
  delete oldCertificateNesting.verificationResult.signature
  assert.notEqual(verify([[oldCertificateNesting]]).status, 0)
})

test("rejects Trivy results that contain vulnerabilities", () => {
  const result = verify([null, null, [attestation(predicateTypes[2], {
    statement: {
      predicate: {
        ...predicate(predicateTypes[2]),
        results: [{ vulnerabilities: [{ vulnerabilityID: "CVE-2026-0001" }] }],
      },
    },
  })]])
  assert.notEqual(result.status, 0)
})

test("rejects a top-level Trivy database identity", () => {
  const invalid = predicate(predicateTypes[2])
  invalid.db = invalid.scanner.db
  delete invalid.scanner.db
  const result = verify([null, null, [attestation(predicateTypes[2], {
    statement: { predicate: invalid },
  })]])
  assert.notEqual(result.status, 0)
})

test("rejects extra attestations and any subject or certificate mismatch", () => {
  const extra = verify([[attestation(predicateTypes[0]), attestation(predicateTypes[0])]])
  assert.notEqual(extra.status, 0)

  const extraSubject = verify([[attestation(predicateTypes[0], {
    statement: {
      subject: [
        { name: subject, digest: { sha256: digest.slice("sha256:".length) } },
        { name: subject, digest: { sha256: digest.slice("sha256:".length) } },
      ],
    },
  })]])
  assert.notEqual(extraSubject.status, 0)

  const wrongDigest = verify([[attestation(predicateTypes[0], {
    statement: { subject: [{ name: subject, digest: { sha256: "c".repeat(64) } }] },
  })]])
  assert.notEqual(wrongDigest.status, 0)

  const wrongRun = verify([[attestation(predicateTypes[0], {
    certificate: { runInvocationURI: `https://github.com/${repo}/actions/runs/999/attempts/1` },
  })]])
  assert.notEqual(wrongRun.status, 0)
})

test("rejects unsupported repositories, source SHAs, subjects, and signer workflows", () => {
  assert.notEqual(verify([], { SOURCE_REPOSITORY: "AquilaXk/other" }).status, 0)
  assert.notEqual(verify([], { SOURCE_SHA: "A".repeat(40) }).status, 0)
  assert.notEqual(verify([], { IMAGE_SUBJECT: "ghcr.io/aquilaxk/aquila-blog-web-front" }).status, 0)
  assert.notEqual(verify([], { SIGNER_WORKFLOW: "https://github.com/AquilaXk/aquila-blog/.github/workflows/other.yml@refs/heads/main" }).status, 0)
})
