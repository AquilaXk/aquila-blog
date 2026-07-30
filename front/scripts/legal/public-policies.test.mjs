import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildCanonicalManifest, validatePublicPolicies } from "./validate-public-policies.mjs"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const policySource = path.join(repoRoot, "front/legal/policies")

const copyPolicies = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aquila-public-policies-"))
  for (const name of fs.readdirSync(policySource)) {
    fs.copyFileSync(path.join(policySource, name), path.join(directory, name))
  }
  return directory
}

const writePolicy = (directory, name, policy) => {
  policy.contentSha256 = ""
  policy.contentSha256 = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex")
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(policy, null, 2)}\n`)
}

test("selects the highest effective policy for every public document", () => {
  const result = validatePublicPolicies({ policiesDir: policySource, frontendMetadataPath: path.join(repoRoot, "front/src/apis/backend/legal.ts") })

  assert.equal(result.ok, true)
  assert.deepEqual(result.manifest, {
    version: 1,
    contract: "aquila-public-legal-policies",
    active: {
      terms: { version: "1.0.2", contentSha256: "825642074982313f39c5d9bfbeffb20b12fc1a072addce8770b332652a75ad9b" },
      privacy: { version: "1.0.3", contentSha256: "b1a9d7f800214aeab69e0185c2a4721dc394afd3c47a581a3190888a17d95827" },
      cookies: { version: "1.0.3", contentSha256: "cc8be651603df0480886d6c258e16dd7228cbfe78fa2bf16ee07ae80359e0f99" },
    },
  })
})

test("a newer draft neither replaces active metadata nor changes the canonical manifest", () => {
  const directory = copyPolicies()
  const baseline = buildCanonicalManifest(validatePublicPolicies({ policiesDir: directory, frontendMetadataPath: path.join(repoRoot, "front/src/apis/backend/legal.ts") }).active)
  const draft = JSON.parse(fs.readFileSync(path.join(directory, "terms.ko-KR.v1.0.2.yaml"), "utf8"))
  draft.version = "9.0.0"
  draft.status = "draft"
  writePolicy(directory, "terms.ko-KR.v9.0.0.yaml", draft)

  const result = validatePublicPolicies({ policiesDir: directory, frontendMetadataPath: path.join(repoRoot, "front/src/apis/backend/legal.ts") })

  assert.equal(result.ok, true)
  assert.deepEqual(buildCanonicalManifest(result.active), baseline)
})

test("rejects a policy whose canonical content hash drifts", () => {
  const directory = copyPolicies()
  const policyPath = path.join(directory, "privacy.ko-KR.v1.0.3.yaml")
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"))
  policy.contentSha256 = "0".repeat(64)
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

  const result = validatePublicPolicies({ policiesDir: directory, frontendMetadataPath: path.join(repoRoot, "front/src/apis/backend/legal.ts") })

  assert.equal(result.ok, false)
  assert.match(result.errors.join("\n"), /contentSha256 mismatch/)
})

test("canonical manifest contains policy identity only, while frontend acceptance metadata excludes cookies", () => {
  const result = validatePublicPolicies({ policiesDir: policySource, frontendMetadataPath: path.join(repoRoot, "front/src/apis/backend/legal.ts") })
  const manifest = buildCanonicalManifest(result.active)

  assert.equal(result.ok, true)
  assert.equal("repository" in manifest, false)
  assert.equal("commit" in manifest, false)
  assert.equal(JSON.stringify(manifest).includes("cookies"), true)
})
