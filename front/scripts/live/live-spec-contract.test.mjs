import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

// `production-live-verify.yml`(Vercel repository_dispatch)이 사라지면서 live 검증의 **자동 트리거**는
// 없어졌지만, `yarn test:e2e:live`(scripts/run-live-e2e.mjs)로 실행되는 e2e/live.spec.ts 자체는 남아
// 있다. 아래 계약은 그 spec이 실제로 무엇을 확인하는지를 고정한다 - same-origin 경계가 조용히
// 빠져도 spec은 여전히 green이 되기 때문에, 이 검사가 없으면 라이브 검증이 껍데기만 남는다.
test("live spec pins the same-origin image preflight and editor save cleanup", () => {
  const liveSpec = readFileSync(path.resolve(import.meta.dirname, "../../e2e/live.spec.ts"), "utf8")
  const liveAuth = readFileSync(path.resolve(import.meta.dirname, "../../e2e/helpers/liveAuth.ts"), "utf8")

  assert.match(
    liveSpec,
    /image upload endpoint accepts the same-origin production preflight without CORS headers[\s\S]*?const apiBaseUrl = resolveApiBaseUrl\(webOrigin\)[\s\S]*?new URL\("\/post\/api\/v1\/posts\/images", apiBaseUrl\)[\s\S]*?access-control-allow-origin"\]\)\.toBeUndefined\(\)/
  )
  assert.match(liveSpec, /__live_e2e_\$\{crypto\.randomUUID\(\)\}/)
  assert.equal(
    (liveSpec.match(/page\.request\.post\(`\$\{apiBaseUrl\}\/post\/api\/v1\/posts`/g) ?? []).length,
    1
  )
  assert.match(
    liveSpec,
    /data: \{[\s\S]*?title: canaryTitle,[\s\S]*?content: canarySeedContent,[\s\S]*?published: false,[\s\S]*?listed: false/
  )
  assert.match(liveSpec, /headers: \{ "X-Aquila-CSRF": "1" \}/)
  assert.match(liveSpec, /createResponse\.status\(\) !== 201 \|\| typeof createBody\?\.data\?\.id !== "number"/)
  assert.match(liveSpec, /postId = createBody\.data\.id/)
  assert.doesNotMatch(liveSpec, /posts\/temp|tempResponse\.ok\(\)|waitForResponse\([\s\S]*?posts\\\/temp|openAdminNewPostEntry/)
  assert.match(liveSpec, /toHaveURL\(new RegExp\(`\/editor\/\$\{postId\}/)
  assert.match(
    liveSpec,
    /expect\(titleInput\)\.toHaveValue\(canaryTitle\)[\s\S]*?expect\(editorContent\)\.toHaveValue\(canarySeedContent\)[\s\S]*?Visibility"\)\)\.toHaveValue\("PRIVATE"\)[\s\S]*?titleInput\.fill\(savedTitle\)/
  )
  assert.match(liveSpec, /publishDialog = page\.getByRole\("dialog", \{ name: "수정 설정" \}\)/)
  assert.match(liveSpec, /publishDialog\.getByRole\("button", \{ name: "변경 반영", exact: true \}\)\.click\(\)/)
  assert.match(liveSpec, /postWriteUrl = `\*\*\/post\/api\/v1\/posts\/\$\{postId\}`/)
  assert.match(liveSpec, /await page\.route\(postWriteUrl, postWriteRoute\)/)
  assert.match(
    liveSpec,
    /const request = route\.request\(\)[\s\S]*?request\.method\(\) !== "PUT"[\s\S]*?await route\.fallback\(\)[\s\S]*?return[\s\S]*?request\.postDataJSON\(\)/
  )
  assert.match(liveSpec, /payload\?\.published !== false \|\| payload\.listed !== false/)
  assert.match(
    liveSpec,
    /catch \{[\s\S]*?await route\.fulfill\(\{ status: 400,[\s\S]*?return[\s\S]*?payload\?\.published !== false \|\| payload\.listed !== false[\s\S]*?await route\.fulfill\(\{ status: 400,[\s\S]*?return/
  )
  assert.doesNotMatch(liveSpec, /route\.abort\(/)
  assert.match(liveSpec, /response\.request\(\)\.method\(\) === "PUT"[\s\S]*?pathname === `\/post\/api\/v1\/posts\/\$\{postId\}`/)
  assert.match(liveSpec, /await page\.unroute\(postWriteUrl, postWriteRoute\)/)
  assert.match(liveSpec, /await page\.goto\(`\/editor\/\$\{postId\}`\)/)
  assert.match(liveSpec, /expect\(page\.getByLabel\("Visibility"\)\)\.toHaveValue\("PRIVATE"\)/)
  assert.match(
    liveSpec,
    /finally \{[\s\S]*?page\.unroute\(postWriteUrl, postWriteRoute\)[\s\S]*?cleanupLiveEditorPost\(page, postId\)/
  )
  assert.match(liveAuth, /return parsed\.origin/)
  assert.doesNotMatch(liveAuth, /E2E_API_BASE_URL/)
  assert.doesNotMatch(liveAuth, /stripTrailingSlash/)
  assert.match(
    liveAuth,
    /posts\/\$\{postId\}[\s\S]*?soft-delete[\s\S]*?adm\/posts\/\$\{postId\}\/hard[\s\S]*?hard-delete/
  )
  assert.match(liveSpec, /test\.skip\(!explicitLiveApiBaseUrl, "E2E_API_BASE_URL is required"\)/)
  assert.match(
    liveSpec,
    /const webOrigin = new URL\(process\.env\.PLAYWRIGHT_BASE_URL \|\| page\.url\(\)\)\.origin[\s\S]*?new URL\("\/actuator\/health\/readiness", webOrigin\)/
  )
  assert.match(liveSpec, /test\.skip\(!expectedFrontendCommitSha, "E2E_EXPECTED_FRONT_COMMIT_SHA is required"\)/)
  assert.doesNotMatch(liveSpec, /access-control-allow-credentials/)
})
