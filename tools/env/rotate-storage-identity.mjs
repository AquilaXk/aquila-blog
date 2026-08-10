#!/usr/bin/env node

import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnvText } from "./validate-env.mjs"

const scriptPath = fileURLToPath(import.meta.url)
const currentKeys = [
  "CUSTOM_STORAGE_ACCESSKEY",
  "CUSTOM_STORAGE_SECRETKEY",
  "CUSTOM_STORAGE_CREDENTIAL_VERSION",
]
const previousKeys = [
  "CUSTOM_STORAGE_PREVIOUS_ACCESSKEY",
  "CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION",
  "CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS",
]
const managedKeys = new Set([...currentKeys, ...previousKeys])
const maxSignedLong = 9223372036854775807n

const parseArgs = (argv) => {
  const mode = argv[0]
  if (mode !== "prepare" && mode !== "finalize") throw new Error("mode must be prepare or finalize")
  const args = { mode }
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") args.envFile = argv[++index]
    else if (arg === "--credential-file") args.credentialFile = argv[++index]
    else if (arg === "--now-epoch-seconds") args.nowEpochSeconds = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.envFile) throw new Error("--env-file is required")
  if (mode === "prepare" && !args.credentialFile) throw new Error("--credential-file is required for prepare")
  if (mode === "finalize" && args.credentialFile) throw new Error("--credential-file is not valid for finalize")
  return args
}

const requirePrivateRegularFile = (filePath, label) => {
  const stat = lstatSync(filePath)
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`)
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must not grant group or other permissions`)
}

const canonicalPositiveLong = (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= maxSignedLong

const requireGeneratedCredential = (filePath) => {
  requirePrivateRegularFile(filePath, "credential file")
  const parsed = JSON.parse(readFileSync(filePath, "utf8"))
  const accessKey = typeof parsed.accessKey === "string" ? parsed.accessKey : ""
  const secretKey = typeof parsed.secretKey === "string" ? parsed.secretKey : ""
  if (parsed.status !== "success") throw new Error("generated credential status must be success")
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(accessKey)) {
    throw new Error("generated access key is invalid")
  }
  if (
    !secretKey ||
    secretKey !== secretKey.trim() ||
    secretKey.length < 8 ||
    secretKey.length > 40 ||
    !/^[-A-Za-z0-9+/_~.=]+$/.test(secretKey)
  ) {
    throw new Error("generated secret key is invalid")
  }
  return { accessKey, secretKey }
}

const updateEnvText = (text, values) => {
  const kept = String(text || "")
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
      return !match || !managedKeys.has(match[1])
    })
  while (kept.length > 0 && kept.at(-1) === "") kept.pop()
  for (const key of currentKeys) kept.push(`${key}=${values[key]}`)
  for (const key of previousKeys) {
    if (values[key]) kept.push(`${key}=${values[key]}`)
  }
  return `${kept.join("\n")}\n`
}

const writePrivateAtomic = (filePath, content) => {
  const temporary = `${filePath}.tmp-${process.pid}`
  let descriptor
  try {
    descriptor = openSync(temporary, "wx", 0o600)
    writeFileSync(descriptor, content, "utf8")
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, filePath)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

const prepare = (args, text) => {
  const env = parseEnvText(text)
  const rootAccessKey = env.get("MINIO_ROOT_USER") || ""
  const rootSecretKey = env.get("MINIO_ROOT_PASSWORD") || ""
  const currentAccessKey = env.get("CUSTOM_STORAGE_ACCESSKEY") || ""
  const currentSecretKey = env.get("CUSTOM_STORAGE_SECRETKEY") || ""
  const currentVersion = env.get("CUSTOM_STORAGE_CREDENTIAL_VERSION") || ""
  const previousValues = previousKeys.map((key) => env.get(key) || "")
  if (previousValues.some(Boolean)) throw new Error("a storage identity rotation is already pending")

  const generated = requireGeneratedCredential(args.credentialFile)
  if (generated.accessKey === rootAccessKey || generated.secretKey === rootSecretKey) {
    throw new Error("generated application identity must differ from MinIO root identity")
  }
  if (generated.accessKey === currentAccessKey || generated.secretKey === currentSecretKey) {
    throw new Error("rotation must use a newly generated application identity")
  }

  const initialRootMigration = currentAccessKey === rootAccessKey || currentSecretKey === rootSecretKey
  let nextVersion = 1n
  const values = {
    CUSTOM_STORAGE_ACCESSKEY: generated.accessKey,
    CUSTOM_STORAGE_SECRETKEY: generated.secretKey,
    CUSTOM_STORAGE_CREDENTIAL_VERSION: "1",
  }
  if (!initialRootMigration) {
    if (!canonicalPositiveLong(currentVersion)) throw new Error("current storage credential version is invalid")
    nextVersion = BigInt(currentVersion) + 1n
    if (nextVersion > maxSignedLong) throw new Error("storage credential version is exhausted")
    const now = args.nowEpochSeconds === undefined ? BigInt(Math.floor(Date.now() / 1000)) : BigInt(args.nowEpochSeconds)
    if (now <= 0n || now > maxSignedLong) throw new Error("now epoch seconds must be a positive signed 64-bit integer")
    values.CUSTOM_STORAGE_CREDENTIAL_VERSION = nextVersion.toString()
    values.CUSTOM_STORAGE_PREVIOUS_ACCESSKEY = currentAccessKey
    values.CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION = currentVersion
    values.CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS = now.toString()
  }

  writePrivateAtomic(args.envFile, updateEnvText(text, values))
  rmSync(args.credentialFile)
  console.log(
    `[storage-identity] prepared version=${nextVersion} previous_present=${initialRootMigration ? "false" : "true"}`,
  )
}

const finalize = (args, text) => {
  const env = parseEnvText(text)
  const values = Object.fromEntries(currentKeys.map((key) => [key, env.get(key) || ""]))
  if (!values.CUSTOM_STORAGE_ACCESSKEY || !values.CUSTOM_STORAGE_SECRETKEY || !canonicalPositiveLong(values.CUSTOM_STORAGE_CREDENTIAL_VERSION)) {
    throw new Error("current storage identity is incomplete")
  }
  writePrivateAtomic(args.envFile, updateEnvText(text, values))
  console.log(`[storage-identity] finalized version=${values.CUSTOM_STORAGE_CREDENTIAL_VERSION}`)
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  requirePrivateRegularFile(args.envFile, "env file")
  const text = readFileSync(args.envFile, "utf8")
  if (args.mode === "prepare") prepare(args, text)
  else finalize(args, text)
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`[storage-identity] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
