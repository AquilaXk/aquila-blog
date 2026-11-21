import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const sha256Pattern = /^[a-f0-9]{64}$/

function resolveRoot(args) {
  if (args.length === 0) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  }
  if (args.length === 2 && args[0] === "--root") {
    return path.resolve(args[1])
  }
  throw new Error("Usage: node tools/contracts/write-public-manifest.mjs [--root <repository-root>]")
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function writePublicManifest(contractsDir) {
  const artifacts = {
    openapi: { path: "openapi.json", sha256: sha256(path.join(contractsDir, "openapi.json")) },
    errorCodes: { path: "error-codes.json", sha256: sha256(path.join(contractsDir, "error-codes.json")) },
    summaryFixtures: { path: "summary-fixtures.json", sha256: sha256(path.join(contractsDir, "summary-fixtures.json")) },
  }
  for (const artifact of Object.values(artifacts)) {
    if (!sha256Pattern.test(artifact.sha256)) {
      throw new Error(`Invalid SHA-256 for ${artifact.path}`)
    }
  }

  fs.writeFileSync(
    path.join(contractsDir, "manifest.json"),
    canonicalJson({ version: 1, contract: "aquila-public-api", artifacts }),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolveRoot(process.argv.slice(2))
  writePublicManifest(path.join(root, "contracts", "public-api"))
}
