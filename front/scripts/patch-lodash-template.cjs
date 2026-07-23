const fs = require("node:fs")
const crypto = require("node:crypto")

const templatePath = require.resolve("lodash/template")
const originalSha256 = "3e995a1962c52317214e6411c40487a50bbd3cdd40deb83941bc3f85cdd9c976"
const patchedSha256 = "46094496a50579f3112ec77abb38ab1e2fb05a51f09162e6a74bafa55a485c50"

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")

let source = fs.readFileSync(templatePath, "utf8")
const sourceSha256 = sha256(source)

if (sourceSha256 === patchedSha256) {
  process.exit(0)
}

if (sourceSha256 !== originalSha256) {
  throw new Error(`Unexpected lodash template module checksum at ${templatePath}: ${sourceSha256}`)
}

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
  throw new Error(`Unable to patch lodash template module at ${templatePath}`)
}

if (
  !patched.includes("assignWith = require('./assignWith')") ||
  !patched.includes("arrayEach = require('./_arrayEach')") ||
  sha256(patched) !== patchedSha256
) {
  throw new Error(`Unable to patch lodash template module at ${templatePath}`)
}

fs.writeFileSync(templatePath, patched)
console.log(`[postinstall] patched lodash/template missing requires: ${templatePath}`)
