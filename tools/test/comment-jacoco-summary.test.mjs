import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const reportXml = `
<?xml version="1.0" encoding="UTF-8"?>
<report name="jacoco">
  <package name="com/back/example">
    <sourcefile name="Covered.kt">
      <counter type="LINE" missed="0" covered="10"/>
      <counter type="BRANCH" missed="0" covered="4"/>
    </sourcefile>
  </package>
  <counter type="INSTRUCTION" missed="0" covered="100"/>
  <counter type="LINE" missed="0" covered="10"/>
  <counter type="BRANCH" missed="0" covered="4"/>
  <counter type="METHOD" missed="0" covered="2"/>
  <counter type="CLASS" missed="0" covered="1"/>
</report>
`.trim()

const fullReportXml = `
<?xml version="1.0" encoding="UTF-8"?>
<report name="jacoco">
  <package name="com/back/example">
    <sourcefile name="Excluded.kt">
      <counter type="LINE" missed="5" covered="5"/>
      <counter type="BRANCH" missed="1" covered="3"/>
    </sourcefile>
  </package>
  <counter type="INSTRUCTION" missed="10" covered="90"/>
  <counter type="LINE" missed="5" covered="5"/>
  <counter type="BRANCH" missed="1" covered="3"/>
  <counter type="METHOD" missed="1" covered="1"/>
  <counter type="CLASS" missed="1" covered="1"/>
</report>
`.trim()

test("Jacoco summary exposes baseline-filtered and full coverage", () => {
  const dir = mkdtempSync(join(tmpdir(), "jacoco-summary-"))
  const reportPath = join(dir, "pr.xml")
  const fullReportPath = join(dir, "full.xml")
  const baselinePath = join(dir, "baseline.txt")

  writeFileSync(reportPath, reportXml)
  writeFileSync(fullReportPath, fullReportXml)
  writeFileSync(baselinePath, "com/back/example/Excluded.class\n")

  const output = execFileSync(
    "python3",
    [
      "tools/ci/comment-jacoco-summary.py",
      reportPath,
      baselinePath,
      "--full-report",
      fullReportPath,
    ],
    { encoding: "utf8" },
  )

  assert.match(output, /<!-- aquila-blog:jacoco-coverage-summary -->/)
  assert.match(output, /## JaCoCo coverage summary/)
  assert.match(output, /Status: \*\*Passed\*\*/)
  assert.match(output, /Line coverage after baseline exclusions: \*\*100\.00%\*\*/)
  assert.match(output, /Gate: new-code line coverage after static\/baseline exclusions must be 100%/)
  assert.match(output, /Baseline-excluded classes: `1`/)
  assert.match(output, /Full report Line coverage: \*\*50\.00%\*\*/)
  assert.match(output, /Full report Branch coverage: \*\*75\.00%\*\*/)
  assert.match(output, /Baseline-excluded class ratio: \*\*50\.00%\*\*/)
})
