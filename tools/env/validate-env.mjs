#!/usr/bin/env node
import { readFileSync } from "node:fs"
import crypto from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const repoRoot = path.resolve(scriptDir, "../..")
const defaultContractPath = path.join(repoRoot, "deploy/env/env.contract.json")

export const parseEnvText = (text) => {
  const env = new Map()
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "")
    if (!line.trim() || /^\s*#/.test(line)) continue
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    const quote = value[0]
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1)
    }
    env.set(match[1], value)
  }
  return env
}

export const loadContract = (contractPath = defaultContractPath) =>
  JSON.parse(readFileSync(contractPath, "utf8"))

const valueOf = (env, key) => env.get(key)?.trim() || ""

const isRequired = (definition, env) => {
  if (definition.required === false) {
    if (!definition.requiredWhen) return false
  }
  if (!definition.requiredWhen) return definition.required !== false
  return valueOf(env, definition.requiredWhen.key) === String(definition.requiredWhen.equals)
}

const resolveTarget = (contract, targetName) => {
  const target = contract.targets?.[targetName]
  if (!target) throw new Error(`Unknown env target: ${targetName}`)
  if (!target.extends) return { ...target, keys: [...(target.keys || [])] }

  const parent = resolveTarget(contract, target.extends)
  return {
    ...parent,
    ...target,
    keys: [...(parent.keys || []), ...(target.keys || [])],
    crossChecks: [...(parent.crossChecks || []), ...(target.crossChecks || [])],
  }
}

const safeError = (key, message) => ({ key, message })

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

const hostnamePattern = /^(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/

const isUrl = (value) => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const hostOf = (value) => {
  try {
    return new URL(value).hostname
  } catch {
    return ""
  }
}

// DNS 호스트 비교용 정규화. 대소문자와 FQDN 후행 점은 같은 호스트를 가리킨다.
const normalizeHost = (value) => String(value || "").trim().toLowerCase().replace(/\.$/, "")

// 진성 하위 도메인만 참이다. 동일 호스트와 접미사 위조(blog.example.evil)는 거짓이다.
const isStrictSubdomainOf = (candidate, parent) => {
  const child = normalizeHost(candidate)
  const root = normalizeHost(parent)
  if (!child || !root || child === root) return false
  return child.endsWith(`.${root}`)
}

const validateKind = (definition, value) => {
  switch (definition.kind) {
    case undefined:
      return null
    case "boolean":
      return /^(true|false)$/i.test(value) ? null : "must be true or false"
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "must be an email"
    case "hostname":
      return hostnamePattern.test(value) ? null : "must be a hostname"
    case "integer":
      return /^-?\d+$/.test(value) ? null : "must be an integer"
    case "safe-absolute-path":
      if (!value.startsWith("/")) return "must be an absolute path"
      if (value === "/") return "must not be filesystem root"
      if (/\/{2,}/.test(value)) return "must not contain repeated path separators"
      if (/(^|\/)\.\.?($|\/)/.test(value)) return "must not contain traversal path segments"
      return null
    case "url":
      return isUrl(value) ? null : "must be a URL"
    case "https-url":
      if (!isUrl(value)) return "must be a URL"
      return value.startsWith("https://") ? null : "must start with https://"
    case "pinned-image":
      if (value.endsWith(":latest") || value.includes(":latest@")) return "must not use latest tag"
      return value.includes("@sha256:") || /:[^/:]+$/.test(value) ? null : "must include tag or digest"
    case "digest-image":
      if (value.endsWith(":latest") || value.includes(":latest@")) return "must not use latest tag"
      return /^[^@\s]+@sha256:[a-f0-9]{64}$/i.test(value) ? null : "must include sha256 digest"
    default:
      return `unknown validation kind: ${definition.kind}`
  }
}

export const validateEnvText = ({ contract, target, text }) => {
  const resolved = resolveTarget(contract, target)
  const env = parseEnvText(text)
  const placeholder = new RegExp(contract.placeholderPattern, "i")
  const errors = []
  const warnings = []

  for (const definition of resolved.keys || []) {
    const value = valueOf(env, definition.name)
    const required = isRequired(definition, env)

    if (!value) {
      if (required) {
        errors.push(safeError(definition.name, "is required"))
        continue
      }

      // 키가 아예 없는 것과, 있는데 빈 것은 다르다.
      //
      // Caddy의 {$VAR:default}는 변수가 unset일 때만 기본값을 쓴다. 존재하되 빈 값이면 빈
      // 문자열을 그대로 보간해 설정을 무너뜨린다 — 증상은 키마다 갈린다(vhost 소멸 /
      // host matcher 없는 :80 catch-all / upstream 주소 파손). 그런데 이 분기가 falsy 값을
      // 그냥 넘겨 왔기 때문에 required: false 키의 빈 값은 무조건 통과했고, kind·minLength·
      // allowedValues 같은 형태 검사가 아예 닿지 못했다.
      //
      // 값의 형태를 선언한 키는 빈 값을 의미 있는 상태로 쓰지 않는다. 그래서 present-but-empty를
      // 거부한다. 개별 키 나열이 아니라 계약 층 규칙이라, 새로 선언되는 보간 키도 자동으로 덮인다.
      // 예외는 requiredWhen 게이트가 꺼진 키뿐이다 — 거기서 빈 값은 "기능 꺼짐"이라는 문서화된
      // 상태이고, 줄을 지우는 것과 같은 뜻이다.
      // rejectEmptyValue는 그 예외에서 다시 빠져나오는 opt-in이다. requiredWhen 게이트가 닫혀
      // 있어도 빈 값이 어떤 상태도 뜻하지 않는 키(Caddy 주소, SSR upstream)에 붙인다.
      const declaresValueShape =
        definition.kind !== undefined || Boolean(definition.allowedValues) || Boolean(definition.minLength)
      const exemptWhileGateClosed = Boolean(definition.requiredWhen) && definition.rejectEmptyValue !== true
      if (env.has(definition.name) && declaresValueShape && !exemptWhileGateClosed) {
        errors.push(safeError(definition.name, "must be removed entirely rather than set to an empty value"))
        continue
      }

      if (definition.warnWhenAbsent) {
        // required: false인데 소비하는 코드 경로가 살아 있으면, 빈 값은 "기능 꺼짐"이 아니라
        // "조용히 아무것도 안 함"이 된다. 그 침묵을 여기서 깬다.
        warnings.push(safeError(definition.name, definition.warnWhenAbsent))
      }
      continue
    }

    if (definition.placeholderForbidden !== false && placeholder.test(value)) {
      errors.push(safeError(definition.name, "must not contain placeholder value"))
    }

    if (definition.allowedValues && !definition.allowedValues.includes(value)) {
      errors.push(safeError(definition.name, `must be one of: ${definition.allowedValues.join(", ")}`))
    }

    if (definition.minLength && value.length < definition.minLength) {
      errors.push(safeError(definition.name, `must be at least ${definition.minLength} characters`))
    }

    if (definition.forbiddenValues?.includes(value)) {
      errors.push(safeError(definition.name, "must not use forbidden value"))
    }

    // 전환 창 전용 키처럼, 설정돼 있다는 사실 자체가 임시 상태를 뜻하는 값이 있다.
    // 조용히 영구 잔존하면 그 임시 상태가 영구가 된다.
    if (definition.warnWhenPresent) {
      warnings.push(safeError(definition.name, definition.warnWhenPresent))
    }

    if (definition.forbiddenSha256?.includes(sha256(value))) {
      errors.push(safeError(definition.name, "must not use forbidden fingerprint"))
    }

    if (definition.mustDifferFrom && value === valueOf(env, definition.mustDifferFrom)) {
      errors.push(safeError(definition.name, `must differ from ${definition.mustDifferFrom}`))
    }

    const kindError = validateKind(definition, value)
    if (kindError) errors.push(safeError(definition.name, kindError))

    if (!kindError && definition.kind === "integer") {
      const numericValue = Number(value)
      if (Number.isInteger(definition.min) && numericValue < definition.min) {
        errors.push(safeError(definition.name, `must be greater than or equal to ${definition.min}`))
      }
      if (Number.isInteger(definition.max) && numericValue > definition.max) {
        errors.push(safeError(definition.name, `must be less than or equal to ${definition.max}`))
      }
    }
  }

  for (const check of resolved.crossChecks || []) {
    if (check.type === "urlHostEquals") {
      const urlHost = normalizeHost(hostOf(valueOf(env, check.urlKey)))
      const expectedHost = normalizeHost(valueOf(env, check.hostKey))
      if (urlHost && expectedHost && urlHost !== expectedHost) {
        errors.push(safeError(check.urlKey, `${check.hostKey} must match ${check.urlKey} host`))
      }
    }

    if (check.type === "cookieDomainScope") {
      // 인증 쿠키 Domain은 front/back 호스트의 공통 접미사로 계산된다(AuthCookieDomainPolicy).
      // 그래서 쿠키 도메인·web 호스트·API 호스트는 한 덩어리로만 의미가 있고, 따로 움직이면
      // 공통 접미사가 한 단계 위로 올라가 우리 소유가 아닌 호스트로 세션 쿠키가 전송된다.
      //
      // 스위치는 API_DOMAIN 하나다. deploy.yml이 배포 직전에 같은 표로 나머지를 덮어쓰므로
      // 여기서도 같은 표를 쓴다. 비교는 raw 문자열이 아니라 host 기준이다 — HOME_SERVER_ENV의
      // CUSTOM_PROD_*는 후행 슬래시·대소문자 정도가 실 운영값과 다를 수 있고, 그것 때문에
      // 배포가 막히면 안 된다(하드 핀이 원래 존재했던 이유다).
      const apiHost = normalizeHost(valueOf(env, check.apiHostKey))
      const topologies = check.topologies || {}
      // Object.hasOwn: `constructor`·`__proto__` 같은 prototype 키가 topology로 해석되면
      // 이 crossCheck가 통째로 무력화된다.
      const topology = apiHost && Object.hasOwn(topologies, apiHost) ? topologies[apiHost] : undefined

      // 1) 표 자체를 검증한다. 값 대조만 하면 표가 틀렸을 때 아무도 못 잡는다 -
      //    deploy.yml도 같은 표를 읽으므로 잘못된 값을 그대로 따라 핀한다.
      //    선택된 항목만 보면 전환 순간까지 오염을 못 잡으므로 표 전체를 본다.
      //    불변식을 위반하는 것이 알려진 전환 전 조합은 legacyUnsafeTopology 하나로만 격리한다.
      const invariants = check.invariants || {}
      const forbiddenCookieDomains = invariants.forbiddenCookieDomains || []
      const legacyKey = invariants.legacyUnsafeTopology
      for (const [name, entry] of Object.entries(topologies)) {
        if (name === legacyKey) {
          if (entry.structurallyUnsafe !== true) {
            errors.push(safeError(check.apiHostKey, `topology ${name} is the declared legacy exception and must be labelled structurallyUnsafe`))
          }
          continue
        }
        if (entry.structurallyUnsafe === true) {
          errors.push(safeError(check.apiHostKey, `topology ${name} claims an undeclared legacy exception`))
          continue
        }
        if (entry.cookieDomain !== entry.frontHost) {
          errors.push(safeError(check.apiHostKey, `topology ${name} is unsafe: cookieDomain must equal frontHost`))
        }
        if (entry.webHost && entry.webHost !== entry.cookieDomain) {
          errors.push(safeError(check.apiHostKey, `topology ${name} is unsafe: webHost must equal cookieDomain`))
        }
        if (!isStrictSubdomainOf(entry.backHost, entry.cookieDomain)) {
          errors.push(safeError(check.apiHostKey, `topology ${name} is unsafe: backHost must be a subdomain of cookieDomain`))
        }
        // admin embed allowlist는 Caddy의 frame-ancestors로 들어간다. 표가 web 호스트 밖의
        // origin을 선언하면 그 origin이 관리 화면을 iframe으로 감쌀 권한을 갖는다.
        const declaredEmbedOrigins = String(entry.adminEmbedOrigins || "").split(/\s+/).filter(Boolean)
        if (declaredEmbedOrigins.some((origin) => normalizeHost(hostOf(origin)) !== normalizeHost(entry.webHost || entry.frontHost))) {
          errors.push(safeError(check.apiHostKey, `topology ${name} is unsafe: adminEmbedOrigins must stay on its own web host`))
        }
        if (forbiddenCookieDomains.includes(entry.cookieDomain)) {
          errors.push(safeError(check.apiHostKey, `topology ${name} is unsafe: cookieDomain is owned by another service`))
        }
      }

      if (apiHost && !topology) {
        errors.push(safeError(check.apiHostKey, "has no declared prod site topology"))
      } else if (topology) {
        // 2) secret 값이 선택된 topology와 일치하는가. 비교는 host 기준이다.
        //
        // pinnedByDeploy 키는 오너가 유지보수하는 값이 아니다. deploy.yml이 같은 표에서 파생해
        // 덮어쓰므로 error로 올리면 "곧 교체될 값" 때문에 배포가 막힌다. 대신 교체 예정을
        // 알린다 - M3가 지적한 "무고지 변경"은 침묵이 문제였지 교체 자체가 아니다.
        // CUSTOM_PROD_* 셋은 오너가 API_DOMAIN과 한 세트로 갱신하는 값이라 error를 유지한다.
        const comparisons = [
          { key: check.domainKey, actual: valueOf(env, check.domainKey), expected: topology.cookieDomain, label: "must be the cookie domain declared for" },
          { key: check.frontUrlKey, actual: hostOf(valueOf(env, check.frontUrlKey)), expected: topology.frontHost, label: "host must be the web host declared for" },
          { key: check.backUrlKey, actual: hostOf(valueOf(env, check.backUrlKey)), expected: topology.backHost, label: "host must be the API host declared for" },
          { key: check.webDomainKey, actual: valueOf(env, check.webDomainKey), expected: topology.webHost, pinnedByDeploy: true },
          { key: check.publicEdgeProbeUrlKey, actual: hostOf(valueOf(env, check.publicEdgeProbeUrlKey)), expected: hostOf(topology.publicEdgeProbeBaseUrl), pinnedByDeploy: true },
          { key: check.revalidateUrlKey, actual: hostOf(valueOf(env, check.revalidateUrlKey)), expected: hostOf(topology.revalidateUrl), pinnedByDeploy: true },
        ]
        for (const { key, actual, expected, label, pinnedByDeploy } of comparisons) {
          if (!key || !expected) continue
          const rawValue = valueOf(env, key)
          const normalizedActual = normalizeHost(actual)
          if (!normalizedActual) {
            // 빈 값을 조용히 건너뛰면 fail-open이다. 값이 있는데 host가 안 나오는 경우만 잡는다.
            if (rawValue && !pinnedByDeploy) {
              errors.push(safeError(key, `must resolve to a host to be checked against ${check.apiHostKey}=${apiHost}`))
            }
            continue
          }
          if (normalizedActual === normalizeHost(expected)) continue
          if (pinnedByDeploy) {
            warnings.push(safeError(key, `will be replaced by the deploy to match ${check.apiHostKey}=${apiHost}`))
          } else {
            errors.push(safeError(key, `${label} ${check.apiHostKey}=${apiHost}`))
          }
        }

        // 3) admin embed origin allowlist는 목록이다. 하나라도 front 호스트 밖이면
        //    Caddy의 frame-ancestors가 타 서비스 origin에 embed 권한을 계속 준다.
        //    이 키도 deploy.yml이 덮어쓰므로 교체 예정을 알린다.
        if (check.adminEmbedOriginsKey) {
          const rawOrigins = valueOf(env, check.adminEmbedOriginsKey)
          const origins = rawOrigins.split(/\s+/).filter(Boolean)
          const outside = origins.filter((origin) => normalizeHost(hostOf(origin)) !== normalizeHost(topology.frontHost))
          if (rawOrigins && (origins.length === 0 || outside.length > 0)) {
            // 어떤 origin이 embed 권한을 잃는지 이름을 대야 오너가 배포 전에 판단할 수 있다.
            const removed = outside.length > 0 ? outside.join(" ") : rawOrigins
            warnings.push(
              safeError(
                check.adminEmbedOriginsKey,
                `the deploy will replace this with "${topology.adminEmbedOrigins}", removing iframe embed rights from: ${removed}`,
              ),
            )
          }
        }

        if (topology.warn) warnings.push(safeError(check.apiHostKey, topology.warn))
      }
    }

    if (check.type === "pathWithin") {
      const parentPath = (valueOf(env, check.parentKey) || check.defaultParent || "").replace(/\/+$/, "")
      const childPath = valueOf(env, check.childKey).replace(/\/+$/, "")
      const samePathDisallowed = check.strict !== false && parentPath && childPath && childPath === parentPath
      if (samePathDisallowed || (parentPath && childPath && !childPath.startsWith(`${parentPath}/`))) {
        errors.push(safeError(check.childKey, `must be inside ${check.parentKey}`))
      }
    }

    if (check.type === "pathNotWithin") {
      const parentPath = (valueOf(env, check.parentKey) || check.defaultParent || "").replace(/\/+$/, "")
      const relativeParent = (check.relativeParent || "").replace(/^\/+|\/+$/g, "")
      const forbiddenPath = relativeParent ? `${parentPath}/${relativeParent}` : parentPath
      const childPath = valueOf(env, check.childKey).replace(/\/+$/, "")
      if (forbiddenPath && childPath && (childPath === forbiddenPath || childPath.startsWith(`${forbiddenPath}/`))) {
        errors.push(safeError(check.childKey, `must not be inside ${check.parentKey}/${relativeParent}`))
      }
    }
  }

  return { ok: errors.length === 0, target, errors, warnings }
}

const parseArgs = (argv) => {
  const args = { contract: defaultContractPath }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--target") args.target = argv[++index]
    else if (arg === "--file") args.file = argv[++index]
    else if (arg === "--contract") args.contract = argv[++index]
    else if (arg === "--source-env-var") args.sourceEnvVar = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.target) throw new Error("--target is required")
  if (!args.file && !args.sourceEnvVar) throw new Error("--file or --source-env-var is required")

  const text = args.sourceEnvVar ? process.env[args.sourceEnvVar] || "" : readFileSync(args.file, "utf8")
  const result = validateEnvText({
    contract: loadContract(args.contract),
    target: args.target,
    text,
  })

  for (const warning of result.warnings || []) {
    console.error(`[env-contract] WARN ${warning.key}: ${warning.message}`)
  }

  if (!result.ok) {
    console.error(`[env-contract] ${result.target} validation failed`)
    for (const error of result.errors) {
      console.error(`- ${error.key}: ${error.message}`)
    }
    process.exit(1)
  }

  console.log(`[env-contract] ${result.target} validation ok`)
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`[env-contract] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
