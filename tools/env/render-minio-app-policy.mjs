#!/usr/bin/env node

import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnvText } from "./validate-env.mjs"

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const repoRoot = path.resolve(scriptDir, "../..")
const defaultTemplatePath = path.join(repoRoot, "deploy/homeserver/minio-app-policy.template.json")

const parseArgs = (argv) => {
  const args = { template: defaultTemplatePath }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") args.envFile = argv[++index]
    else if (arg === "--output") args.output = argv[++index]
    else if (arg === "--template") args.template = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.envFile) throw new Error("--env-file is required")
  if (!args.output) throw new Error("--output is required")
  return args
}

const requireValue = (env, key) => {
  const value = env.get(key) || ""
  if (!value || value !== value.trim()) throw new Error(`${key} must be present without edge whitespace`)
  return value
}

const validateBucket = (bucket) => {
  if (
    bucket.length < 3 ||
    bucket.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) ||
    bucket.includes("..") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  ) {
    throw new Error("CUSTOM_STORAGE_BUCKET must be a concrete S3 bucket name")
  }
}

const validatePrefix = (prefix, key) => {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(prefix) ||
    prefix.startsWith("/") ||
    prefix.endsWith("/") ||
    prefix.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${key} must be a normalized object-key prefix`)
  }
}

const prefixesOverlap = (left, right) =>
  left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)

export const renderPolicy = ({ envText, templateText }) => {
  const env = parseEnvText(envText)
  const bucket = requireValue(env, "CUSTOM_STORAGE_BUCKET")
  const postPrefix = requireValue(env, "CUSTOM_STORAGE_KEYPREFIX")
  const cloudPrefix = requireValue(env, "CUSTOM_STORAGE_CLOUD_KEY_PREFIX")
  validateBucket(bucket)
  validatePrefix(postPrefix, "CUSTOM_STORAGE_KEYPREFIX")
  validatePrefix(cloudPrefix, "CUSTOM_STORAGE_CLOUD_KEY_PREFIX")
  if (prefixesOverlap(postPrefix, cloudPrefix)) {
    throw new Error("CUSTOM_STORAGE_KEYPREFIX and CUSTOM_STORAGE_CLOUD_KEY_PREFIX must not overlap")
  }

  const rendered = templateText
    .replaceAll("{{BUCKET}}", bucket)
    .replaceAll("{{POST_PREFIX}}", postPrefix)
    .replaceAll("{{CLOUD_PREFIX}}", cloudPrefix)
  if (rendered.includes("{{")) throw new Error("MinIO application policy contains unresolved placeholders")
  return JSON.parse(rendered)
}

const writeAtomic = (output, content) => {
  const temporary = `${output}.tmp-${process.pid}`
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
    renameSync(temporary, output)
  } finally {
    rmSync(temporary, { force: true })
  }
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const policy = renderPolicy({
    envText: readFileSync(args.envFile, "utf8"),
    templateText: readFileSync(args.template, "utf8"),
  })
  writeAtomic(args.output, `${JSON.stringify(policy, null, 2)}\n`)
  console.log("[minio-policy] rendered")
}

if (process.argv[1] === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`[minio-policy] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
