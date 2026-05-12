const fs = require("node:fs")

const templatePath = require.resolve("lodash/template")
let source = fs.readFileSync(templatePath, "utf8")
let patched = source

if (patched.includes("assignWith(") && !patched.includes("assignWith = require('./assignWith')")) {
  patched = patched.replace(
    "var attempt = require('./attempt'),\n",
    "var attempt = require('./attempt'),\n    assignWith = require('./assignWith'),\n"
  )
}

if (patched.includes("arrayEach(") && !patched.includes("arrayEach = require('./_arrayEach')")) {
  patched = patched.replace(
    "var attempt = require('./attempt'),\n",
    "var attempt = require('./attempt'),\n    arrayEach = require('./_arrayEach'),\n"
  )
}

if (patched === source) {
  process.exit(0)
}

if (!patched.includes("assignWith = require('./assignWith')") || !patched.includes("arrayEach = require('./_arrayEach')")) {
  throw new Error(`Unable to patch lodash template module at ${templatePath}`)
}

fs.writeFileSync(templatePath, patched)
console.log(`[postinstall] patched lodash/template missing requires: ${templatePath}`)
