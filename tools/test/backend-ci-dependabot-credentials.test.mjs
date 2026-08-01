import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const backendPullRequestWorkflow = readFileSync(
  path.join(repoRoot, ".github/workflows/backend-ci.yml"),
  "utf8",
)

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
