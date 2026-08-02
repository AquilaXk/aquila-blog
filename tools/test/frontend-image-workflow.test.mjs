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

const REGISTRY_HOST = "ghcr.io"
const DERIVED_IMAGE = `${REGISTRY_HOST}/\${OWNER_LC}/\${REPO_NAME}-front`

// shell 대입과 GITHUB_OUTPUT 대입을 앵커해 뽑는다. 값이 아니라 조립식을 고정해야
// "IMAGE_NAME 은 맞는데 실제 push 대상은 다른 레지스트리"인 상태를 잡을 수 있다.
const shellAssignmentsIn = (source, name) =>
  [...source.matchAll(new RegExp(`^\\s*${name}="([^"]*)"$`, "gm"))].map((match) => match[1])

const shellOutputsIn = (source, name) =>
  [...source.matchAll(new RegExp(`^\\s*echo "${name}=([^"]*)"$`, "gm"))].map((match) => match[1])

// 이미지 레퍼런스의 host 는 첫 `/` 앞 세그먼트 하나뿐이다. 부분 문자열이나 prefix 로 확인하면
// `evil.example.com/ghcr.io/x`(중첩), `ghcr.io.evil.com/x`(유사 도메인), `ghcr.io@evil.com/x`
// (userinfo) 가 전부 통과한다. 세그먼트를 앵커해 정확히 비교해야 계약이 성립한다.
const HOST_SEGMENT = /^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]+)?$/i
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

function registryHostOf(imageReference) {
  // 이미지 레퍼런스는 scheme 을 갖지 않는다. scheme 이 붙어 있으면 레지스트리 참조가 아니다.
  if (URL_SCHEME.test(imageReference)) {
    return null
  }
  const host = imageReference.split("/", 1)[0]
  return HOST_SEGMENT.test(host) ? host : null
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
  assert.match(meta.run, /IMAGE_TAG="sha-\$\{BUILD_SHA\}"/)
  assert.match(meta.run, /front build sha is empty/)

  // 이미지 레퍼런스는 하나만 조립해야 한다. 두 번째 대입이 생기면 아래 host 검사를 우회한다.
  const imageNameAssignments = shellAssignmentsIn(meta.run, "IMAGE_NAME")
  assert.equal(imageNameAssignments.length, 1, "meta step must assign IMAGE_NAME exactly once")

  const imageReference = imageNameAssignments[0]
  assert.equal(
    registryHostOf(imageReference),
    REGISTRY_HOST,
    "image reference must be hosted on the intended registry",
  )
  assert.equal(
    imageReference,
    DERIVED_IMAGE,
    "registry owner and repository must be derived from the repository, not hardcoded",
  )

  // 실제 push 인자는 build.with.tags = steps.meta.outputs.image_ref 다. IMAGE_NAME 만 고정하면
  // IMAGE_REF 조립이나 output 대입을 바꿔 다른 레지스트리로 push 해도 계약이 통과한다.
  assert.deepEqual(
    shellAssignmentsIn(meta.run, "IMAGE_REF"),
    ["${IMAGE_NAME}:${IMAGE_TAG}"],
    "push target must be composed from the derived image name and the sha tag",
  )
  assert.deepEqual(
    shellOutputsIn(meta.run, "image_ref"),
    ["${IMAGE_REF}"],
    "image_ref output must publish the composed push target",
  )
  // image_name output 은 digest ref(`${IMAGE_NAME}@${DIGEST}`)의 host 출처라 같은 우회 경로다.
  assert.deepEqual(
    shellOutputsIn(meta.run, "image_name"),
    ["${IMAGE_NAME}"],
    "image_name output must publish the derived image name",
  )

  // 로그인 대상 레지스트리도 같은 host 여야 push 대상과 자격 증명이 어긋나지 않는다.
  assert.equal(stepByName(buildJob(document), "Login to GHCR").with.registry, REGISTRY_HOST)

  assert.doesNotMatch(source, /IMAGE_LATEST/, "front image must not publish a mutable latest ref")
  assert.doesNotMatch(source, /:latest/, "front image must not publish a mutable latest ref")
})

// 회귀 고정: host 를 부분 문자열로 확인하던 이전 구현은 아래 네 형태를 전부 통과시켰다.
// 계약의 목적이 "레퍼런스가 의도한 레지스트리를 가리키는가"이므로 부분 일치는 목적을 달성하지 못한다.
test("registry host parsing rejects nested, lookalike and userinfo hosts", () => {
  assert.equal(registryHostOf(DERIVED_IMAGE), REGISTRY_HOST)
  assert.equal(registryHostOf(`${REGISTRY_HOST}/owner/repo-front`), REGISTRY_HOST)

  for (const impostor of [
    `https://evil.example.com/${REGISTRY_HOST}/x`,
    `http://${REGISTRY_HOST}/x`,
    `evil.example.com/${REGISTRY_HOST}/x`,
    `${REGISTRY_HOST}.evil.com/x`,
    `${REGISTRY_HOST}@evil.com/x`,
    `${REGISTRY_HOST}:5000/x`,
    `evil${REGISTRY_HOST}/x`,
  ]) {
    assert.notEqual(
      registryHostOf(impostor),
      REGISTRY_HOST,
      `registry host check must reject ${impostor}`,
    )
  }
})

// 회귀 고정: host 계약이 IMAGE_NAME 만 보던 동안에는 IMAGE_REF 를 다른 레지스트리로 바꿔도
// 전체 테스트가 green 이었다. 검사 대상이 실제 push 대상과 어긋나면 계약은 성립하지 않는다.
test("push target composition is pinned, not only the image name", () => {
  const derived = [
    '          IMAGE_NAME="ghcr.io/${OWNER_LC}/${REPO_NAME}-front"',
    '          IMAGE_TAG="sha-${BUILD_SHA}"',
    '          IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"',
    '            echo "image_name=${IMAGE_NAME}"',
    '            echo "image_ref=${IMAGE_REF}"',
  ].join("\n")

  assert.deepEqual(shellAssignmentsIn(derived, "IMAGE_REF"), ["${IMAGE_NAME}:${IMAGE_TAG}"])
  assert.deepEqual(shellOutputsIn(derived, "image_ref"), ["${IMAGE_REF}"])
  assert.deepEqual(shellOutputsIn(derived, "image_name"), ["${IMAGE_NAME}"])

  // IMAGE_NAME 은 그대로 두고 조립만 바꾸는 경로.
  const hijackedComposition = derived.replace(
    'IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"',
    'IMAGE_REF="evil.example.com/x:${IMAGE_TAG}"',
  )
  assert.deepEqual(shellAssignmentsIn(hijackedComposition, "IMAGE_NAME"), [DERIVED_IMAGE])
  assert.notDeepEqual(shellAssignmentsIn(hijackedComposition, "IMAGE_REF"), ["${IMAGE_NAME}:${IMAGE_TAG}"])
  assert.equal(registryHostOf(shellAssignmentsIn(hijackedComposition, "IMAGE_REF")[0]), "evil.example.com")

  // output 대입만 바꿔치기하는 경로.
  const reroutedOutput = derived.replace(
    'echo "image_ref=${IMAGE_REF}"',
    'echo "image_ref=evil.example.com/x:${IMAGE_TAG}"',
  )
  assert.notDeepEqual(shellOutputsIn(reroutedOutput, "image_ref"), ["${IMAGE_REF}"])

  // digest ref 의 host 출처인 image_name output 을 바꿔치기하는 경로.
  const reroutedDigestSource = derived.replace(
    'echo "image_name=${IMAGE_NAME}"',
    'echo "image_name=evil.example.com/x"',
  )
  assert.notDeepEqual(shellOutputsIn(reroutedDigestSource, "image_name"), ["${IMAGE_NAME}"])
})

test("build pushes the homeserver runtime Dockerfile from the front context", () => {
  const { document } = workflow()
  const build = stepByName(buildJob(document), "Build and push front image")

  assert.equal(build.with.context, "./front")
  // front/Dockerfile 은 front/Makefile 이 쓰는 로컬 개발 컨테이너다. 운영 이미지는 Dockerfile.runtime 뿐이다.
  assert.equal(build.with.file, "./front/Dockerfile.runtime")
  assert.equal(build.with.push, true)
  assert.equal(build.with.tags, "${{ steps.meta.outputs.image_ref }}")

  // 공개 도메인 값은 Dockerfile.runtime의 ARG 기본값이 갖는다(#1540). 여기서 주는 것은
  // 워크플로만 알 수 있는 값 하나 - 빌드된 commit SHA다. 이게 없으면
  // <meta name="aquila-build-sha">가 "unknown"이 되어 라이브 호스트가 어느 커밋인지 알 수 없다.
  assert.match(build.with["build-args"], /^NEXT_PUBLIC_AQUILA_BUILD_SHA=\$\{\{ steps\.meta\.outputs\.build_sha \}\}$/m)
  for (const domainArg of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BACKEND_URL"]) {
    assert.doesNotMatch(build.with["build-args"], new RegExp(domainArg), `${domainArg}는 Dockerfile ARG 기본값 소관이다`)
  }
})

test("runtime Dockerfile declares the build SHA arg the workflow injects", () => {
  const dockerfile = readFileSync(path.join(repoRoot, "front/Dockerfile.runtime"), "utf8")

  assert.match(dockerfile, /^ARG NEXT_PUBLIC_AQUILA_BUILD_SHA=""$/m)
  // NEXT_PUBLIC_*는 빌드 시점에 번들로 인라인된다. ENV로 넘기지 않으면 next build가 못 본다.
  assert.match(dockerfile, /^ENV NEXT_PUBLIC_AQUILA_BUILD_SHA=\$\{NEXT_PUBLIC_AQUILA_BUILD_SHA\}$/m)
  // builder 스테이지에서 선언돼야 한다. ENV는 스테이지를 넘지 않는다.
  const builderStage = dockerfile.slice(dockerfile.indexOf("AS builder"), dockerfile.lastIndexOf("FROM node:"))
  assert.match(builderStage, /NEXT_PUBLIC_AQUILA_BUILD_SHA/)
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

  // 그 계약 테스트는 아직 CI 에 배선돼 있지 않다(#1549). marker 가 깨졌을 때 표시되는 원인이
  // 실제 원인(wget 의도적 제거)을 가리지 않도록, 실패 메시지가 두 갈래와 계약 테스트를 지목해야 한다.
  // 주석이 아니라 실패 경로 안을 봐야 한다. step 전체를 대상으로 하면 위쪽 설명 주석이 대신
  // 매칭돼, 정작 운영자에게 닿는 메시지에서 안내가 사라져도 통과한다.
  const markerFailureAnchor = "Front image scan missed the runtime stage"
  const markerFailureIndex = scan.run.indexOf(markerFailureAnchor)
  assert.notEqual(markerFailureIndex, -1, "scan must annotate the runtime stage marker failure")

  const markerFailureBlock = scan.run.slice(markerFailureIndex)
  assert.match(markerFailureBlock, /front\/Dockerfile\.runtime/)
  assert.match(markerFailureBlock, /dockerfile-supply-chain\.test\.mjs/)
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
//
// 원래 이 테스트는 deploy.yml 이 front 이미지를 "이름조차" 부르지 못하게 막았다. Platform 에
// front 역할이 아직 없던 시점에는 그것이 빌드 금지의 가장 싼 근사였지만, Locked Decision 2 의
// 후반부(#1539)가 Platform 에 front **배포**를 맡기면서 그 근사가 배포까지 같이 막게 됐다.
// 그래서 금지 대상을 빌드 그 자체로 좁히고, 대신 "이름은 digest ref 를 만드는 데만 쓴다"를
// 명시적으로 고정한다. 느슨해진 것이 아니라 옮겨간 것이다 - 빌드 신호는 Dockerfile 하나에서
// 빌드 컨텍스트·캐시 스코프·build-arg·push 로 넓어졌고, 태그 ref 로의 회귀도 새로 막는다.
test("platform deploy workflow deploys the front image but never builds or publishes it", () => {
  const deploySource = readFileSync(deployWorkflowPath, "utf8")

  // 빌드 신호. 하나라도 나타나면 Web 소유 경계를 넘은 것이다.
  assert.doesNotMatch(deploySource, /Dockerfile\.runtime/)
  // `context: ./front` 와 `context: front` 는 buildx 에 같은 뜻이다. 한쪽만 막으면 우회가 된다.
  assert.doesNotMatch(deploySource, /^\s*context:\s*\.?\/?front(\/|\s*$)/m)
  assert.doesNotMatch(deploySource, /scope=front-image/)
  assert.doesNotMatch(deploySource, /NEXT_PUBLIC_AQUILA_BUILD_SHA/)
  // Platform 은 어떤 이미지도 registry 에 직접 올리지 않는다.
  assert.doesNotMatch(deploySource, /docker push/)

  // packages 쓰기 권한을 가진 job 은 backend 빌드 하나뿐이다. front job 은 읽기만 한다.
  // 원문 문자열을 세면 주석·설명에 오탐하므로 job 스코프로 판정한다.
  const deployDocument = parseWorkflow(deployWorkflowPath)
  const packagesWriteJobs = Object.entries(deployDocument.jobs)
    .filter(([, job]) => job.permissions?.packages === "write")
    .map(([name]) => name)
  assert.deepEqual(packagesWriteJobs, ["buildAndPush"])
  assert.equal(deployDocument.jobs.frontBlueGreenDeploy.permissions.packages, "read")

  // 배포는 허용된다. 다만 front 이미지 이름이 나오는 곳은 digest ref 를 만드는 지점 하나여야
  // 하고, 그 결과는 항상 @sha256 이다. 태그 ref 로 되돌아가면 mutable 참조가 홈서버에 닿는다.
  assert.match(deploySource, /FRONT_IMAGE_NAME="ghcr\.io\/\$\{OWNER_LC\}\/\$\{REPO_NAME\}-front"/)
  assert.match(deploySource, /front_image_ref=\$\{FRONT_IMAGE_NAME\}@\$\{FRONT_IMAGE_DIGEST\}/)
  assert.doesNotMatch(deploySource, /front_image_ref=\$\{FRONT_IMAGE_NAME\}:/)
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
