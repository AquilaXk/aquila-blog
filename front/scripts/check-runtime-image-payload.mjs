#!/usr/bin/env node
/**
 * Homeserver runtime image payload budget (#1545).
 *
 * `front/Dockerfile.runtime` 의 마지막 스테이지는 정확히 세 경로만 복사한다:
 * `.next/standalone` → `/app`, `.next/static` → `/app/.next/static`, `public` → `/app/public`.
 * 나머지는 베이스 이미지(node:20-alpine + wget/app 유저)로 고정이므로, 이미지 크기가 회귀하는
 * 통로는 이 세 경로뿐이다. 이 게이트는 `yarn build` 산출물에서 그 합계를 재고 예산과 비교한다.
 *
 * 단위는 `docker images` 표기와 맞춰 전부 SI(10진) 바이트다.
 *
 * 예산 도출 (2026-08-01 실측, node:20-alpine arm64 빌더. payload 는 이 스크립트가 세는
 * 일반 파일 바이트 합계다 — 디렉터리 inode 를 함께 세는 `du -sb` 보다 4MB 가량 작다):
 * | | payload | `docker images` SIZE | content size |
 * |---|---|---|---|
 * | 최적화 전 | 135,244,573B | 397MB | 93.1MB |
 * | 최적화 후 | 88,601,986B | 331MB | 76.8MB |
 *
 * 두 점을 잇는 1차식이 `projectImageSizeBytes` 다. 예산 115MB 를 다 써도 투영 SIZE 는 약 368MB로
 * 상한 400MB 아래에 머문다. arch/libc 에 따라 `@img/sharp-*` 크기가 조금 달라지므로,
 * 실측 88.6MB 대비 26MB 남긴 이 폭이 플랫폼 편차와 정상적인 의존성 증가를 함께 흡수한다.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")

/** `docker images` SIZE 기준 운영 이미지 상한. 올려서 해결하지 않는다 (#1545). */
export const RUNTIME_IMAGE_SIZE_LIMIT_BYTES = 400_000_000

/** 위 도출식으로 정한 payload 예산. */
export const RUNTIME_PAYLOAD_LIMIT_BYTES = 115_000_000

/**
 * 베이스 이미지와 wget/app 유저 레이어처럼 payload 와 무관하게 고정인 몫.
 * 위 두 실측점의 절편이다.
 */
export const RUNTIME_IMAGE_FIXED_OVERHEAD_BYTES = 205_600_000

/**
 * payload 1B 당 SIZE 증가분. 1을 넘는 이유는 containerd 이미지 저장소의 DISK USAGE 가
 * 압축된 layer blob 과 풀린 snapshot 을 함께 세기 때문이다.
 */
export const PAYLOAD_TO_IMAGE_SIZE_RATIO = 1.415

/**
 * payload 크기에서 `docker images` SIZE 를 투영한다. 이미지를 직접 빌드하지 않는 CI 에서도
 * 상한 대비 여유를 숫자로 말할 수 있게 하는 것이 목적이다.
 *
 * @param {number} payloadBytes
 * @returns {number}
 */
export const projectImageSizeBytes = (payloadBytes) =>
  RUNTIME_IMAGE_FIXED_OVERHEAD_BYTES + payloadBytes * PAYLOAD_TO_IMAGE_SIZE_RATIO

/** Dockerfile.runtime 이 실제로 복사하는 경로들 (front 기준 상대 경로). */
export const RUNTIME_PAYLOAD_SOURCES = [".next/standalone", ".next/static", "public"]

/**
 * 심볼릭 링크는 따라가지 않는다 — `.bin/*` 는 이미 트리 안에 있는 파일을 가리키므로
 * 따라가면 같은 바이트를 두 번 세고 순환에 걸릴 수 있다.
 *
 * @param {string} absoluteDir
 * @returns {{ bytes: number, fileCount: number }}
 */
export const measureTree = (absoluteDir) => {
  let bytes = 0
  let fileCount = 0
  const stack = [absoluteDir]

  while (stack.length > 0) {
    const current = /** @type {string} */ (stack.pop())
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      bytes += fs.statSync(entryPath).size
      fileCount += 1
    }
  }

  return { bytes, fileCount }
}

/**
 * standalone `node_modules` 를 최상위 패키지(scope 포함) 단위로 집계한다.
 * 예산을 넘겼을 때 "무엇이 커졌는가"를 바로 읽을 수 있게 하는 것이 목적이다.
 *
 * @param {string} nodeModulesDir
 * @param {number} limit
 * @returns {{ name: string, bytes: number }[]}
 */
export const summarizeTopPackages = (nodeModulesDir, limit = 10) => {
  if (!fs.existsSync(nodeModulesDir)) return []

  /** @type {{ name: string, bytes: number }[]} */
  const packages = []
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(nodeModulesDir, entry.name)
    if (!entry.name.startsWith("@")) {
      packages.push({ name: entry.name, bytes: measureTree(entryPath).bytes })
      continue
    }
    for (const scoped of fs.readdirSync(entryPath, { withFileTypes: true })) {
      if (!scoped.isDirectory()) continue
      packages.push({
        name: `${entry.name}/${scoped.name}`,
        bytes: measureTree(path.join(entryPath, scoped.name)).bytes,
      })
    }
  }

  return packages.sort((a, b) => b.bytes - a.bytes).slice(0, limit)
}

/**
 * 마지막 `FROM` 스테이지의 베이스 이미지 참조를 돌려준다.
 * Dockerfile 키워드는 대소문자를 구분하지 않으므로 소문자 `from` 도 잡는다.
 *
 * @param {string} dockerfile
 * @returns {string | null}
 */
export const resolveRuntimeStageBaseImage = (dockerfile) => {
  const froms = [...dockerfile.matchAll(/^FROM\s+(\S+)/gim)].map((match) => match[1])
  return froms.at(-1) ?? null
}

/**
 * `next.config.js` 의 libc 짝맞춤 제외는 런타임 베이스가 musl(alpine)이라는 전제 위에 있다.
 * 베이스가 조용히 glibc 이미지로 바뀌면 payload 실측치와 예산 도출이 모두 무너지므로 여기서 막는다.
 *
 * @param {string} dockerfile
 * @returns {string}
 */
export const assertMuslRuntimeBase = (dockerfile) => {
  const baseImage = resolveRuntimeStageBaseImage(dockerfile)
  if (!baseImage) {
    throw new Error("Dockerfile.runtime has no FROM instruction")
  }
  if (!/(^|:|-)alpine/.test(baseImage.split("@")[0])) {
    throw new Error(
      `Dockerfile.runtime runtime stage must stay on an alpine (musl) base, got: ${baseImage}`
    )
  }
  return baseImage
}

/**
 * 마지막 스테이지의 `COPY --from=...` 소스 경로들을 front 기준 상대 경로로 돌려준다.
 *
 * @param {string} dockerfile
 * @returns {string[]}
 */
export const resolveCopiedPayloadSources = (dockerfile) => {
  const runtimeStage = dockerfile.split(/^FROM\s+/im).at(-1) ?? ""
  return [...runtimeStage.matchAll(/^COPY\s+(.+)$/gim)]
    .map((match) => match[1].trim().split(/\s+/))
    .filter((args) => args.some((arg) => arg.startsWith("--from=")))
    .map((args) => args.filter((arg) => !arg.startsWith("--")))
    .filter((args) => args.length >= 2)
    .map((args) => args[0].replace(/^\/app\//, ""))
}

/**
 * Dockerfile 이 복사하는 경로와 이 게이트가 재는 경로가 어긋나면 예산을 통과해도 실제 이미지는
 * 커질 수 있다 — 조용히 통과하는 게이트를 막기 위해 양쪽 목록이 같은지 먼저 확인한다.
 *
 * @param {string} dockerfile
 */
export const assertPayloadSourceParity = (dockerfile) => {
  const copied = [...resolveCopiedPayloadSources(dockerfile)].sort()
  const measured = [...RUNTIME_PAYLOAD_SOURCES].sort()
  if (copied.join("|") !== measured.join("|")) {
    throw new Error(
      "Dockerfile.runtime COPY sources drifted from RUNTIME_PAYLOAD_SOURCES: " +
        `copied=[${copied.join(", ")}] measured=[${measured.join(", ")}]`
    )
  }
}

/**
 * @param {{ projectRoot: string, limitBytes: number }} options
 */
export const evaluatePayload = ({ projectRoot, limitBytes }) => {
  const sources = RUNTIME_PAYLOAD_SOURCES.map((source) => {
    const absolutePath = path.join(projectRoot, source)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`runtime payload source not found: ${source} (run \`yarn build\` first)`)
    }
    return { source, ...measureTree(absolutePath) }
  })

  const totalBytes = sources.reduce((sum, entry) => sum + entry.bytes, 0)

  return {
    sources,
    totalBytes,
    limitBytes,
    remainingBytes: limitBytes - totalBytes,
    overBudget: totalBytes > limitBytes,
  }
}

const toMb = (bytes) => (bytes / 1_000_000).toFixed(2)

const main = () => {
  const dockerfile = fs.readFileSync(path.join(frontRoot, "Dockerfile.runtime"), "utf8")
  const baseImage = assertMuslRuntimeBase(dockerfile)
  assertPayloadSourceParity(dockerfile)
  console.log(`[runtime-payload] runtime base: ${baseImage.split("@")[0]}`)

  const result = evaluatePayload({
    projectRoot: frontRoot,
    limitBytes: RUNTIME_PAYLOAD_LIMIT_BYTES,
  })

  for (const entry of result.sources) {
    console.log(
      `[runtime-payload] ${entry.source}: ${toMb(entry.bytes)}MB (${entry.fileCount} files)`
    )
  }

  const topPackages = summarizeTopPackages(
    path.join(frontRoot, ".next/standalone/node_modules"),
    10
  )
  for (const entry of topPackages) {
    console.log(`[runtime-payload] top: ${entry.name} ${toMb(entry.bytes)}MB`)
  }

  const summary =
    `[runtime-payload] total=${toMb(result.totalBytes)}MB ` +
    `budget=${toMb(result.limitBytes)}MB remaining=${toMb(result.remainingBytes)}MB ` +
    `projectedImageSize=${toMb(projectImageSizeBytes(result.totalBytes))}MB ` +
    `imageLimit=${toMb(RUNTIME_IMAGE_SIZE_LIMIT_BYTES)}MB`

  if (result.overBudget) {
    console.error(`::error::${summary}`)
    console.error(
      "[runtime-payload] budget exceeded. 상한을 올리지 말고 next.config.js 의 " +
        "outputFileTracingExcludes 로 서버 런타임에 불필요한 의존성을 제외하라."
    )
    process.exit(1)
  }

  console.log(`${summary} status=OK`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
