#!/usr/bin/env node
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const RUNTIME_TARGET = "home-server-runtime"

function usage() {
  return [
    "Usage: node tools/repo-split/materialize-compose-test-env.mjs \\",
    "  --source <example.env> --output <test.env> --contract <env.contract.json>",
    "",
    "Writes a non-routable environment file for `docker compose config` only.",
  ].join("\n")
}

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--help" || flag === "-h") return { help: true }
    if (!["--source", "--output", "--contract"].includes(flag)) {
      throw new Error(`unknown argument: ${flag}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${flag}`)
    if (values.has(flag)) throw new Error(`duplicate argument: ${flag}`)
    values.set(flag, value)
    index += 1
  }

  for (const flag of ["--source", "--output", "--contract"]) {
    if (!values.has(flag)) throw new Error(`missing required argument: ${flag}`)
  }
  return {
    contract: path.resolve(values.get("--contract")),
    output: path.resolve(values.get("--output")),
    source: path.resolve(values.get("--source")),
  }
}

function collectTargetKeys(contract, targetName, visiting = new Set()) {
  const target = contract.targets?.[targetName]
  if (!target || !Array.isArray(target.keys)) {
    throw new Error(`${targetName} deploy env contract is missing`)
  }
  if (visiting.has(targetName)) {
    throw new Error(`deploy env contract inheritance cycle at ${targetName}`)
  }

  const nextVisiting = new Set(visiting)
  nextVisiting.add(targetName)
  const inherited = target.extends
    ? collectTargetKeys(contract, target.extends, nextVisiting)
    : []
  return [...inherited, ...target.keys]
}

function materialize({ contract: contractPath, output, source }) {
  if (source === output) throw new Error("source and output must differ")

  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const digest = "0".repeat(64)
  const overrides = new Map()
  for (const key of collectTargetKeys(contract, RUNTIME_TARGET)) {
    if (key?.kind !== "digest-image") continue
    if (typeof key.name !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(key.name)) {
      throw new Error("digest-image contract keys must use uppercase environment variable names")
    }
    const slug = key.name.toLowerCase().replaceAll("_", "-")
    overrides.set(key.name, `registry.invalid/aquila-standalone/${slug}@sha256:${digest}`)
  }
  if (overrides.size === 0) {
    throw new Error(`${RUNTIME_TARGET} must define at least one digest-image key`)
  }

  const retained = readFileSync(source, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=/.exec(line)
      return !match || !overrides.has(match[1])
    })

  const syntheticLines = [...overrides.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
  const content = `${retained.join("\n").replace(/\n*$/, "")}\n\n# Standalone Compose validation images\n${syntheticLines.join("\n")}\n`

  writeFileSync(output, content, { mode: 0o600 })
  chmodSync(output, 0o600)
  process.stdout.write(`materialize-compose-test-env: wrote ${output} with ${overrides.size} synthetic image values\n`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
  } else {
    materialize(options)
  }
} catch (error) {
  process.stderr.write(`materialize-compose-test-env: ${error.message}\n`)
  process.exitCode = 1
}
