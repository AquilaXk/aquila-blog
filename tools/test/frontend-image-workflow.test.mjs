import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const workflowRelativePath = ".github/workflows/frontend-image.yml"
const testRelativePath = "tools/test/frontend-image-workflow.test.mjs"
const workflowPath = path.join(repoRoot, workflowRelativePath)
const ciWorkflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const deployWorkflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")

// `on:` 은 YAML 1.1 boolean 이라 파싱하면 키가 `true` 로 바뀐다. trigger 검증은 원문 정규식으로,
// 구조(permissions/jobs/steps) 검증은 파싱 결과로 나눠서 본다. ruby 파서는
// sync-public-contract-workflow.test.mjs 와 같은 경로를 재사용한다.
function parseWorkflow(filePath) {
  const ruby = [
    'require "yaml"',
    'require "json"',
    "puts JSON.generate(YAML.load_file(ARGV.fetch(0)))",
  ].join("; ")
  const result = spawnSync("ruby", ["-e", ruby, filePath], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || `${filePath} must parse as YAML`)
  return JSON.parse(result.stdout)
}

function workflow() {
  assert.equal(existsSync(workflowPath), true, `${workflowRelativePath} must exist`)
  return { document: parseWorkflow(workflowPath), source: readFileSync(workflowPath, "utf8") }
}

function buildJob(document) {
  const jobNames = Object.keys(document.jobs)
  assert.deepEqual(jobNames, ["build-and-push"], "front image workflow owns exactly one job")
  return document.jobs["build-and-push"]
}

function stepByName(job, name) {
  const step = job.steps.find((candidate) => candidate.name === name)
  assert.ok(step, `missing workflow step: ${name}`)
  return step
}

function stepIndex(job, name) {
  const index = job.steps.findIndex((candidate) => candidate.name === name)
  assert.notEqual(index, -1, `missing workflow step: ${name}`)
  return index
}

test("front image build triggers on front changes and never on pull_request", () => {
  const { source } = workflow()

  assert.match(source, /^on:\n  push:\n    branches:\n      - main\n    paths:\n/m)
  // front/ 하위는 Dockerfile.runtime 의 `COPY . .` 로 대부분 빌드 컨텍스트에 들어간다. 과소 트리거는
  // main 에 반영된 front 변경이 이미지에 반영되지 않은 채 stale digest 로 배포되는 결함이므로
  // 상위집합인 front/** 를 트리거로 고정한다.
  assert.match(source, /^      - "front\/\*\*"$/m)
  // 워크플로 자신의 변경도 재빌드를 유발해야 한다. 자기 경로를 빼면 빌드 방식 변경이 반영되지 않는다.
  assert.match(source, /^      - "\.github\/workflows\/frontend-image\.yml"$/m)
  assert.match(source, /^  workflow_dispatch:$/m)
  // pull_request 트리거는 fork PR 에 GHCR push 권한을 요구하게 만든다. 이 워크플로는 main push 전용이다.
  assert.doesNotMatch(source, /^  pull_request(_target)?:$/m)
})

test("front image workflow keeps the least privilege GHCR token surface", () => {
  const { document, source } = workflow()

  assert.deepEqual(document.permissions, { contents: "read" })
  assert.deepEqual(buildJob(document).permissions, { contents: "read", packages: "write" })

  const secretReferences = [...source.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((match) => match[1])
  assert.deepEqual(
    [...new Set(secretReferences)],
    ["GITHUB_TOKEN"],
    "front image build must not read any secret other than the workflow GITHUB_TOKEN",
  )
  assert.doesNotMatch(source, /secrets\s*\[/, "dynamic secret indexing hides which secret is read")
})

test("image name and tag are derived from the repository, matching the backend rule", () => {
  const { document, source } = workflow()
  const meta = stepByName(buildJob(document), "Calculate front image name and tag")

  assert.match(meta.run, /OWNER_LC="\$\(echo "\$\{GITHUB_REPOSITORY_OWNER\}" \| tr '\[:upper:\]' '\[:lower:\]'\)"/)
  assert.match(meta.run, /REPO_NAME="\$\(basename "\$\{GITHUB_REPOSITORY\}"\)"/)
  assert.match(meta.run, /IMAGE_NAME="ghcr\.io\/\$\{OWNER_LC\}\/\$\{REPO_NAME\}-front"/)
  assert.match(meta.run, /IMAGE_TAG="sha-\$\{BUILD_SHA\}"/)
  assert.match(meta.run, /front build sha is empty/)

  // 레지스트리 참조는 전수로 확인한다. 부정 매칭 하나보다 "registry로 시작하는 토큰이 전부
  // 파생형과 정확히 일치하는가"가 더 강하고, hardcoded owner·잘못된 suffix·참조 부재를 모두 잡는다.
  // 호스트명을 문자열 리터럴로 두면 CodeQL이 URL sanitization 검사로 오인하므로
  // dockerfile-supply-chain.test.mjs 와 같은 방식으로 조립한다.
  const registryPrefix = `${["ghcr", "io"].join(".")}/`
  const derivedImage = `${registryPrefix}\${OWNER_LC}/\${REPO_NAME}-front`
  const registryReferences = source.split(/\s|"|'/).filter((token) => token.startsWith(registryPrefix))

  assert.ok(registryReferences.length > 0, "front image must target the GitHub container registry")
  for (const reference of registryReferences) {
    assert.equal(
      reference,
      derivedImage,
      "registry owner and repository must be derived from the repository, not hardcoded",
    )
  }

  assert.doesNotMatch(source, /IMAGE_LATEST/, "front image must not publish a mutable latest ref")
  assert.doesNotMatch(source, /:latest/, "front image must not publish a mutable latest ref")
})

test("build pushes the homeserver runtime Dockerfile from the front context", () => {
  const { document } = workflow()
  const build = stepByName(buildJob(document), "Build and push front image")

  assert.equal(build.with.context, "./front")
  // front/Dockerfile 은 front/Makefile 이 쓰는 로컬 개발 컨테이너다. 운영 이미지는 Dockerfile.runtime 뿐이다.
  assert.equal(build.with.file, "./front/Dockerfile.runtime")
  assert.equal(build.with.push, true)
  assert.equal(build.with.tags, "${{ steps.meta.outputs.image_ref }}")
  assert.equal("build-args" in build.with, false, "NEXT_PUBLIC_* 주입은 #1540 소관이다")
})

test("digest export is fail-closed and is the only ref exposed to consumers", () => {
  const { document } = workflow()
  const job = buildJob(document)
  const exportStep = stepByName(job, "Export front digest image ref")

  assert.equal(job.outputs.front_image_ref, "${{ steps.front_image.outputs.front_image_ref }}")
  assert.equal(exportStep.id, "front_image")
  assert.equal(exportStep.env.FRONT_IMAGE_DIGEST, "${{ steps.build_front_image.outputs.digest }}")
  assert.match(exportStep.run, /front image digest is empty/)
  assert.match(exportStep.run, /front_image_ref=\$\{IMAGE_NAME\}@\$\{FRONT_IMAGE_DIGEST\}/)
  assert.match(exportStep.run, /exit 1/)
  // 태그 ref 를 소비 계약으로 내보내면 mutable 참조가 배포에 새어 들어간다.
  assert.equal("front_image_tag_ref" in job.outputs, false)
})

test("every action is pinned by full commit SHA", () => {
  const { document } = workflow()
  const uses = buildJob(document)
    .steps.filter((step) => step.uses)
    .map((step) => step.uses)

  assert.ok(uses.length > 0, "front image workflow must use pinned actions")
  for (const reference of uses) {
    assert.match(reference, /^[\w.-]+\/[\w.\/-]+@[0-9a-f]{40}$/, `action must be SHA pinned: ${reference}`)
  }

  const checkout = buildJob(document).steps.find((step) => step.uses.startsWith("actions/checkout@"))
  assert.ok(checkout, "front image workflow must check out the repository")
  assert.equal(checkout.with["persist-credentials"], false)
})

// security.yml 의 container-image-scan 은 front 쪽에서 bare `node:20-alpine` 태그만 본다. 그래서
// Dockerfile.runtime 의 runtime stage 가 설치하는 apk 패키지(wget)는 어떤 스캔에도 잡히지 않았다.
// 그 공백은 실제로 push 된 digest 를 스캔해야만 닫힌다 (#1537).
test("the pushed image itself is scanned by digest, not the bare base tag", () => {
  const { document, source } = workflow()
  const job = buildJob(document)
  const scan = stepByName(job, "Trivy scan pushed front image")

  assert.equal(scan.env.IMAGE, "${{ steps.front_image.outputs.front_image_ref }}")
  assert.doesNotMatch(source, /node:20-alpine/, "front image scan must not fall back to the base tag")
  assert.ok(
    stepIndex(job, "Export front digest image ref") < stepIndex(job, "Trivy scan pushed front image"),
    "scan must run against the digest the build actually published",
  )
  assert.match(scan.run, /trivy image .*--pkg-types os/s)
  assert.match(scan.run, /--list-all-pkgs/)
  assert.match(scan.run, /check-vulnerability-exceptions\.mjs --filter-trivy/)
})

test("the image scan proves it reached the runtime stage package database", () => {
  const { document } = workflow()
  const scan = stepByName(buildJob(document), "Trivy scan pushed front image")

  // 구조적으로는 유효하지만 패키지를 하나도 파싱하지 못한 리포트는 allowlist filter 를 그대로 통과한다.
  assert.match(scan.run, /scanned_packages/)
  assert.match(scan.run, /refusing to pass/)
  // wget 은 dockerfile-supply-chain.test.mjs 가 runtime stage 계약으로 고정한 패키지다. 스캔 결과에
  // 그것이 없으면 스캔이 runtime stage 를 실제로 읽지 못했다는 뜻이다.
  assert.match(scan.run, /wget/)
})

test("image size is measured and reported on every build", () => {
  const { document } = workflow()
  const size = stepByName(buildJob(document), "Report front image size")

  assert.equal(size.env.FRONT_IMAGE_REF, "${{ steps.front_image.outputs.front_image_ref }}")
  assert.match(size.run, /docker image inspect --format '\{\{\.Size\}\}'/)
  assert.match(size.run, /GITHUB_STEP_SUMMARY/)
  assert.match(size.run, /front image size lookup returned no bytes/)
})

// Locked Decision 2 (Epic #1535): Web 은 GHCR push 까지, 홈서버 배포는 Platform 이 한다.
// deploy.yml 에 front 빌드가 들어가면 소유권 분리와 verify-deploy-workflow-classification.sh 가 함께 깨진다.
test("platform deploy workflow never builds or names the front image", () => {
  const deploySource = readFileSync(deployWorkflowPath, "utf8")

  assert.doesNotMatch(deploySource, /Dockerfile\.runtime/)
  assert.doesNotMatch(deploySource, /-front"/)
  assert.doesNotMatch(deploySource, /front_image_ref/)
})

// 파일만 추가하고 CI 에 배선하지 않으면 이 계약 테스트 전체가 조용히 잠든다 (#1477 교정 사례).
test("this contract test is actually wired into CI", () => {
  const ciSource = readFileSync(ciWorkflowPath, "utf8")

  assert.ok(
    ciSource.includes(`node --test ${testRelativePath}`),
    `${testRelativePath} must be executed by a CI step`,
  )
  const pathsEntries = [...ciSource.matchAll(new RegExp(`^      - "${testRelativePath}"$`, "gm"))]
  assert.equal(
    pathsEntries.length,
    2,
    `${testRelativePath} must be registered in both the pull_request and push paths filters`,
  )
})
