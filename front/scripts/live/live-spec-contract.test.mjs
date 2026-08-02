import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

// `production-live-verify.yml`(Vercel repository_dispatch)이 사라지면서 live 검증의 **자동 트리거**는
// 없어졌지만, `yarn test:e2e:live`(scripts/run-live-e2e.mjs)로 실행되는 e2e/live.spec.ts 자체는 남아
// 있다. 아래 계약은 그 spec이 실제로 무엇을 확인하는지를 고정한다 - preflight 헤더 하나가 조용히
// 빠져도 spec은 여전히 green이 되기 때문에, 이 검사가 없으면 라이브 검증이 껍데기만 남는다.
test("live spec pins the production CORS preflight and fail-closed skips", () => {
  const liveSpec = readFileSync(path.resolve(import.meta.dirname, "../../e2e/live.spec.ts"), "utf8")

  assert.match(liveSpec, /Access-Control-Request-Headers": "content-type,x-aquila-csrf"/)
  assert.match(liveSpec, /access-control-allow-credentials"\]\)\.toBe\("true"\)/)
  assert.match(liveSpec, /access-control-allow-headers/)
  assert.match(liveSpec, /\.split\(","\)/)
  assert.match(liveSpec, /header\.trim\(\)\.toLowerCase\(\)/)
  assert.match(liveSpec, /allowedHeaders\)\.toContain\("x-aquila-csrf"\)/)
  assert.match(
    liveSpec,
    /image upload endpoint accepts the production Web CORS preflight[\s\S]*?const apiBaseUrl = resolveApiBaseUrl\(webOrigin\)[\s\S]*?new URL\("\/post\/api\/v1\/posts\/images", apiBaseUrl\)/
  )
  assert.match(liveSpec, /test\.skip\(!explicitLiveApiBaseUrl, "E2E_API_BASE_URL is required"\)/)
  assert.match(liveSpec, /test\.skip\(!expectedFrontendCommitSha, "E2E_EXPECTED_FRONT_COMMIT_SHA is required"\)/)
  assert.doesNotMatch(liveSpec, /x-xsrf-token/i)
})
