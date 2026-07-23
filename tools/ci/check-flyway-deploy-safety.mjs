#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const parseArgs = (argv) => {
  const args = { json: false, repoRoot: process.cwd() }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") args.json = true
    else if (arg === "--repo-root") args.repoRoot = argv[++index]
    else if (arg === "--changed-files") args.changedFiles = argv[++index]
    else if (arg === "--output") args.output = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.changedFiles) throw new Error("--changed-files is required")
  return args
}

const readChangedFiles = (file) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const isMigrationFile = (file) => /^back\/src\/main\/resources\/db\/migration\/.+\.sql$/.test(file)

const isProceduralBodyPrefix = (statement) =>
  /\bdo\s+(?:language\s+[a-z_][a-z0-9_]*\s+)?$/i.test(statement) || /\bas\s*$/i.test(statement)

const stripCommentsAndStrings = (sql, options = {}) => {
  const inspectStringLiterals = options.inspectStringLiterals === true
  let output = ""
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index]
    const next = sql[index + 1]

    if (current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1
      output += "\n"
      continue
    }

    if (current === "/" && next === "*") {
      index += 2
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1
      index += 1
      output += " "
      continue
    }

    if (current === "$") {
      const rest = sql.slice(index)
      const delimiter = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0]
      if (delimiter) {
        const closeIndex = sql.indexOf(delimiter, index + delimiter.length)
        if (closeIndex !== -1) {
          const currentStatement = output.slice(output.lastIndexOf(";") + 1)
          const isProceduralBody = isProceduralBodyPrefix(currentStatement)
          const body = sql.slice(index + delimiter.length, closeIndex)
          index = closeIndex + delimiter.length - 1
          if (isProceduralBody || inspectStringLiterals) {
            output += ` ${stripCommentsAndStrings(body, { inspectStringLiterals: true })} `
          } else {
            output += " "
          }
          continue
        }
      }
    }

    if ((current === "E" || current === "e") && next === "'") {
      const currentStatement = output.slice(output.lastIndexOf(";") + 1)
      const isProceduralBody = isProceduralBodyPrefix(currentStatement)
      const captureLiteral = isProceduralBody || inspectStringLiterals
      index += 2
      let literal = ""
      while (index < sql.length) {
        if (sql[index] === "\\") {
          if (captureLiteral && index + 1 < sql.length) literal += sql[index + 1]
          index += 2
          continue
        }
        if (sql[index] === "'" && sql[index + 1] === "'") {
          if (captureLiteral) literal += "'"
          index += 2
          continue
        }
        if (sql[index] === "'") break
        if (captureLiteral) literal += sql[index]
        index += 1
      }
      if (captureLiteral) {
        output += ` ${stripCommentsAndStrings(literal, { inspectStringLiterals: true })} `
      } else {
        output += " "
      }
      continue
    }

    if (current === "'") {
      const currentStatement = output.slice(output.lastIndexOf(";") + 1)
      const isProceduralBody = isProceduralBodyPrefix(currentStatement)
      const captureLiteral = isProceduralBody || inspectStringLiterals
      index += 1
      let literal = ""
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          if (captureLiteral) literal += "'"
          index += 2
          continue
        }
        if (sql[index] === "'") break
        if (captureLiteral) literal += sql[index]
        index += 1
      }
      if (captureLiteral) {
        output += ` ${stripCommentsAndStrings(literal, { inspectStringLiterals: true })} `
      } else {
        output += " "
      }
      continue
    }

    output += current
  }
  return output
}

const destructiveRules = [
  { rule: "drop-table", pattern: /\bdrop\s+table\b/i },
  { rule: "drop-schema", pattern: /\bdrop\s+schema\b/i },
  { rule: "drop-schema-object", pattern: /\bdrop\s+(?:database|domain|extension|function|materialized\s+view|procedure|sequence|trigger|type|view)\b/i },
  { rule: "drop-column", pattern: /\balter\s+table\b[^;]*?\bdrop\s+(?:column\s+)?(?!constraint\b|not\b|default\b)[a-zA-Z_"]/i },
  { rule: "truncate-table", pattern: /(?:^|;|\bbegin\b|\bthen\b|\belse\b|\bloop\b|\bexecute\b)\s*truncate\s+(?:table\s+)?\b/i },
  { rule: "rename-table", pattern: /\balter\s+table\b[^;]*?\brename\s+to\b/i },
  { rule: "rename-column", pattern: /\balter\s+table\b[^;]*?\brename\s+(?:column\s+)?(?!constraint\b|to\b)[^;]*?\bto\b/i },
  { rule: "alter-column-type", pattern: /\balter\s+table\b[^;]*?\balter\s+(?:column\s+)?[^;]*?\btype\b/i },
  { rule: "set-not-null", pattern: /\balter\s+table\b[^;]*?\balter\s+(?:column\s+)?[^;]*?\bset\s+not\s+null\b/i },
]

const inspectFile = ({ repoRoot, file }) => {
  const fullPath = path.join(repoRoot, file)
  if (!existsSync(fullPath)) return [{ file, rule: "missing-migration-file" }]
  const stripped = stripCommentsAndStrings(readFileSync(fullPath, "utf8"))
  return destructiveRules
    .filter(({ pattern }) => pattern.test(stripped))
    .map(({ rule }) => ({ file, rule }))
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const checkedFiles = readChangedFiles(args.changedFiles).filter(isMigrationFile)
  const findings = checkedFiles.flatMap((file) => inspectFile({ repoRoot: args.repoRoot, file }))
  const result = {
    version: 1,
    ok: findings.length === 0,
    blocked: findings.length > 0,
    checkedFiles,
    findings,
  }
  const output = `${JSON.stringify(result, null, 2)}\n`

  if (args.output) writeFileSync(args.output, output)

  if (args.json) process.stdout.write(output)
  else if (result.blocked) {
    for (const finding of findings) {
      process.stderr.write(`destructive migration blocked: ${finding.file} ${finding.rule}\n`)
    }
  } else {
    process.stdout.write(`Flyway deploy safety passed: ${checkedFiles.length} migration files checked\n`)
  }

  process.exit(result.blocked ? 1 : 0)
}

main()
