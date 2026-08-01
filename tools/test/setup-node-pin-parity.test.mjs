import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowRoots = [
  path.join(repoRoot, ".github/workflows"),
  path.join(repoRoot, "front/.github/workflows"),
]

// front/.github/workflows 는 저장소 분리 전까지만 존재한다. 분리가 실행되면 이 경로가 사라지는데,
// readdirSync 를 무방비로 부르면 테스트 등록 이전인 모듈 로드 시점에 ENOENT 로 죽어 이 파일을
// 실행하는 CI step 전체가 계약 검증 없이 중단된다. 없는 루트는 건너뛰고 남은 루트만 검사한다.
const workflowFiles = workflowRoots
  .filter((root) => existsSync(root))
  .flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
      .map((entry) => path.join(root, entry.name)),
  )

test("monorepo and extracted Web workflows use one pinned setup-node release", () => {
  const references = []

  for (const file of workflowFiles) {
    const source = readFileSync(file, "utf8")
    for (const line of source.split(/\r?\n/)) {
      if (!line.includes("actions/setup-node@")) continue

      const match = line.match(/actions\/setup-node@([0-9a-f]{40})\s+#\s+(v\S+)/)
      assert.ok(match, `${path.relative(repoRoot, file)} must pin setup-node by full SHA and version comment: ${line.trim()}`)
      references.push({
        file: path.relative(repoRoot, file),
        sha: match[1],
        version: match[2],
      })
    }
  }

  assert.ok(references.length > 0, "at least one setup-node workflow reference is required")

  const shas = new Set(references.map(({ sha }) => sha))
  const versions = new Set(references.map(({ version }) => version))
  const details = references.map(({ file, sha, version }) => `${file}: ${sha} (${version})`).join("\n")

  assert.equal(shas.size, 1, `setup-node SHA drift detected:\n${details}`)
  assert.equal(versions.size, 1, `setup-node version comment drift detected:\n${details}`)
})
