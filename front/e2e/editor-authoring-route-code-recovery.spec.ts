import { expect, test } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"
import { collectEditorSelectionRuntimeErrors } from "./helpers/editorSelectionRuntimeGuard"
test.describe("editor authoring route code recovery", () => {
  test("실제 /editor/[id] 수정 진입은 pretty-code 원문으로 빈 코드블럭을 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<div class="aq-code-block">',
      '<div class="aq-code-toolbar"><span class="aq-code-language">TS</span></div>',
      '<div class="aq-code-body"><div class="aq-code-shell">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts" data-raw-code="const answer = 42;&#10;return answer">',
      '<span class="token keyword">const</span> answer = 42;',
      '</code>',
      '</pre>',
      '</div></div>',
      '</div>',
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/991", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 991,
          version: 7,
          title: "코드 복구 글",
          content: staleContent,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/991")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 복구 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "다음 문단입니다."
    )
    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const answer = 42;")
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("return answer")
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.keyword").first()).toBeVisible()
  })

  test("실제 /editor/[id] 수정 진입은 보이지 않는 placeholder 코드 fence를 pretty-code 원문으로 복구한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const staleContent = [
      "코드 placeholder 복구 대상입니다.",
      "",
      "```ts",
      "\u200B",
      "```",
      "",
      "복구 뒤 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<section><p>본문 앞 HTML</p>',
      '<div class="aq-code-block" data-language="ts" data-raw-code="const invisibleRestored = 306;&#10;return invisibleRestored">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts"></code>',
      "</pre></div></section>",
    ].join("")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/993", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 993,
          version: 9,
          title: "코드 invisible placeholder 복구 글",
          content: staleContent,
          contentHtml: prettyCodeHtml,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/993")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 invisible placeholder 복구 글")
    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("const invisibleRestored = 306;")
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText("return invisibleRestored")
  })

  test("실제 /editor/[id] 수정 진입은 content markdown 코드 본문만 있어도 코드블럭 본문을 유지한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const markdownOnlyContent = [
      "코드 본문 보존 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    String access = createAccessToken(user);",
      "    String refresh = createRefreshToken(user);",
      "",
      "    return new Token(access, refresh);",
      "}",
      "```",
      "",
      "마지막 문단입니다.",
    ].join("\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/994", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 994,
          version: 10,
          title: "코드 markdown-only 글",
          content: markdownOnlyContent,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/994")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 markdown-only 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "마지막 문단입니다."
    )

    const codeBlocks = page.locator(".aq-code-shell")
    await expect(codeBlocks).toHaveCount(2)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText("public Token login")
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText(
      "return new Token(access, refresh);"
    )

    await page.waitForTimeout(1_500)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText("public Token login")
  })

  test("실제 /editor/[id] 수정 진입은 frontmatter와 inline color 뒤의 코드블럭 본문을 유지한다", async ({
    page,
  }) => {
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const markdownWithMetaAndColor = [
      "---",
      'tags: ["Stateless", "인증", "JWT"]',
      'thumbnail: "https://api.aquilaxk.site/post/api/v1/images/posts/test.jpg#::aqfx=50::aqfy=60.1::aqfz=1"',
      "---",
      "",
      "## **시작하며**",
      "",
      '왜냐하면 중요한건 {{color:#34d399|**"어디에" **}}저장하느냐가 아니라',
      "",
      "요청을 처리할 때 {{color:#fb923c|**\"무엇이\"**}} 필요하냐 이기 때문입니다.",
      "",
      "---",
      "",
      "## 왜 이 문제가 중요한가",
      "",
      "보통 처음 인증을 구현한다면 이런 식으로 할 것 입니다",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "마지막 문단입니다.",
    ].join("\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/995", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 995,
          version: 11,
          title: "코드 frontmatter 글",
          content: markdownWithMetaAndColor,
          contentHtml: "",
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/995")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 frontmatter 글")
    await expectEditorToContainLoadedText(
      page.locator("[data-testid='block-editor-prosemirror']").first(),
      "마지막 문단입니다."
    )

    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible({ timeout: 15_000 })
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await page.waitForTimeout(1_500)
    await expect(codeBlock.locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
  })

  test("실제 /editor/[id] 수정 진입은 live 글 형상의 code/mermaid/table 혼합 문서에서도 코드 본문과 클릭 위치를 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const selectionRuntimeErrors = collectEditorSelectionRuntimeErrors(page)
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const liveShapeContent = [
      "---",
      'tags: ["Stateless", "인증", "JWT", "Refresh Token"]',
      'thumbnail: "https://api.aquilaxk.site/post/api/v1/images/posts/2026/04/67d7e75c-084a-4e01-af2c-2f35dbd7465e.jpg#::aqfx=50::aqfy=60.1::aqfz=1"',
      "---",
      "",
      "## **시작하며**",
      "",
      "백엔드 인증을 처음 배우면 대부분 이런 흐름으로 헷갈립니다.",
      "",
      "- “Stateless가 좋다는데, 왜 좋은 거지?”",
      "- “세션이랑 JWT는 뭐가 다른 거야?”",
      "- “JWT 쓰면 로그인 상태가 유지되는 거야?”",
      "- “Refresh Token은 왜 또 따로 있어?”",
      "",
      "처음에는 이렇게 외우기 쉽습니다.",
      "",
      "> **세션 = 서버 저장****토큰 = 클라이언트 저장**",
      "",
      "하지만 이걸로는 절대 이해가 되지 않습니다.",
      "",
      '왜냐하면 중요한건 {{color:#34d399|**"어디에" **}}저장하느냐가 아니라',
      "",
      '요청을 처리할 때 {{color:#fb923c|**"무엇이"**}} 필요하냐 이기 때문입니다.',
      "",
      "이 글에서는 가장 헷갈리는 지점부터 하나씩 이해해보겠습니다.",
      "",
      "---",
      "",
      "## 왜 이 문제가 중요한가",
      "",
      "보통 처음 인증을 구현한다면 이런 식으로 할 것 입니다",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "이 구조는 아주 직관적이지만 한가지 중요한 질문을 만듭니다.",
      "",
      '> **"서버는 도대체 어떻게 이 사용자가 로그인한 상태인지 아는걸까?"**',
      "",
      "이 질문에 대한 답은 간단합니다.",
      "",
      "> 👉 {{color:#fb923c|**서버가 사용자가 로그인한 상태를 기억**}}**하고 있기 때문입니다**",
      "",
      '이게 바로 흔히 말하는 {{color:#fb923c|**"Stateful"**}} 입니다.',
      "",
      "그렇다면 만약 {{color:#60a5fa|서버가 사용자의 로그인한 상태를 기억하지 않는다면}}요?",
      "",
      '이게 바로 {{color:#60a5fa|**"Stateless"**}} 입니다.',
      "",
      "**Stateless 에서는 서버가 사용자의 로그인한 상태를 기억하지 않습니다.**",
      "",
      "---",
      "",
      "## 핵심 개념 설명",
      "",
      "### 1. Stateful (세션 기반)",
      "",
      "```mermaid",
      "sequenceDiagram",
      "    participant Client",
      "    participant Server",
      "",
      "    Client->>Server: 로그인",
      "    Server-->>Client: Session ID",
      "",
      "    Client->>Server: 요청 + Session ID",
      "    Server->>Server: 세션 조회",
      "    Server-->>Client: 응답",
      "```",
      "",
      "### **핵심 포인트**",
      "",
      "- 서버가 사용자 상태를 기억함",
      "- 요청마다 “이 사용자가 누구인지” 조회 필요",
      "",
      "---",
      "",
      "### **헷갈리는 포인트**",
      "",
      "> “Session ID만 있으면 인증되는 거 아닌가요?”",
      "",
      "맞습니다.",
      "",
      "하지만 중요한 건 이겁니다.",
      "",
      "> **Session ID는 ‘열쇠’일 뿐이고, 실제 정보는 서버에 있다**",
      "",
      "---",
      "",
      "## **2. Stateless (토큰 기반)**",
      "",
      "이제 반대로 생각해봅니다.",
      "",
      "> ❓ “서버가 기억하지 않으려면?”",
      "",
      "👉 답은 하나입니다.",
      "",
      "> **요청 안에 모든 정보를 넣는다**",
      "",
      "---",
      "",
      "### **흐름 (JWT)**",
      "",
      "```mermaid",
      "sequenceDiagram",
      "    participant Client",
      "    participant Server",
      "",
      "    Client->>Server: 로그인",
      "    Server-->>Client: JWT 발급",
      "",
      "    Client->>Server: 요청 + JWT",
      "    Server->>Server: 토큰 검증",
      "    Server-->>Client: 응답",
      "```",
      "",
      "---",
      "",
      "### **핵심 포인트**",
      "",
      "- 서버는 상태를 저장하지 않음",
      "- JWT 안에 사용자 정보 포함",
      "",
      "---",
      "",
      "### **JWT 내부 예시**",
      "",
      "```",
      "{",
      '  "userId": 123,',
      '  "role": "USER",',
      '  "exp": 1710000000',
      "}",
      "```",
      "",
      "---",
      "",
      "### **헷갈리는 포인트**",
      "",
      "> “그럼 서버는 DB 안 보고도 인증이 가능한 건가요?”",
      "",
      "👉 맞습니다.",
      "",
      "왜냐하면",
      "",
      "> **토큰 자체가 ‘신분증’ 역할을 하기 때문입니다**",
      "",
      "---",
      "",
      "## **그런데 여기서 문제가 생깁니다**",
      "",
      "JWT 구조를 이해하면 자연스럽게 이런 생각이 듭니다.",
      "",
      "> ❓ “그럼 JWT를 오래 쓰면 로그인 계속 유지되겠네?”",
      "",
      "👉 맞습니다.",
      "",
      "하지만 동시에 **큰 문제**가 생깁니다.",
      "",
      "---",
      "",
      "## **문제 1. 토큰 탈취**",
      "",
      "- 누군가 JWT를 가져가면?",
      "- 그대로 로그인 가능",
      "",
      "👉 서버는 막을 방법이 없음",
      "",
      "---",
      "",
      "## **문제 2. 로그아웃 불가능**",
      "",
      "- 이미 발급된 토큰은 계속 유효",
      "",
      "👉 서버가 기억하지 않기 때문",
      "",
      "---",
      "",
      "## **문제 3. 권한 변경 반영 안 됨**",
      "",
      "- 유저 권한이 바뀌어도",
      "- 토큰은 그대로",
      "",
      "---",
      "",
      "## **그래서 등장한 것이 Refresh Token**",
      "",
      "---",
      "",
      "## **JWT + Refresh Token 구조**",
      "",
      "```mermaid",
      "sequenceDiagram",
      "    participant Client",
      "    participant Server",
      "",
      "    Client->>Server: 로그인",
      "    Server-->>Client: Access + Refresh",
      "",
      "    Client->>Server: API 요청 (Access)",
      "    Server-->>Client: 응답",
      "",
      "    Client->>Server: Access 만료 → Refresh 요청",
      "    Server-->>Client: 새 Access 발급",
      "```",
      "",
      "---",
      "",
      "## **역할 정리**",
      "",
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[146,139]} -->',
      "| **토큰** | **역할** |",
      "| --- | --- |",
      "| Access Token | API 인증 |",
      "| Refresh Token | Access 재발급 |",
      "",
      "---",
      "",
      "## **왜 둘로 나누는가**",
      "",
      "주니어 입장에서 가장 중요한 포인트입니다.",
      "",
      "### **❌ 하나로 해결하려 하면**",
      "",
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[125,147]} -->',
      "| **방식** | **문제** |",
      "| --- | --- |",
      "| Access 길게 | 보안 위험 |",
      "| Access 짧게 | 로그인 자주 끊김 |",
      "",
      "- Access Token 은 요청마다 서버로 보내어지기 때문에 탈취위험이 매우 높다",
      "",
      "---",
      "",
      "### **✅ 그래서 이렇게 나눕니다**",
      "",
      "- Access → 짧게 (보안)",
      "- Refresh → 길게 (사용자 경험) Access 토큰이 만료되면 Refresh로 갱신 ",
      "",
      "---",
      "",
      "## **잘못 이해하기 쉬운 부분**",
      "",
      "### **1. “Refresh Token도 Stateless다” (❌)**",
      "",
      "👉 대부분은 서버에 저장합니다",
      "",
      "**왜?**",
      "",
      "- 탈취 대응",
      "- 로그아웃 처리",
      "",
      "---",
      "",
      "### **2. “JWT 쓰면 서버가 아무것도 안 한다” (❌)**",
      "",
      "👉 실제로는",
      "",
      "- 서명 검증",
      "- 만료 확인",
      "- (경우에 따라) blacklist 체크",
      "",
      "---",
      "",
      "### **3. “토큰에 정보 많이 넣으면 좋다” (❌)**",
      "",
      "👉 변경 반영 안 됨",
      "",
      "---",
      "",
      "## **구현 예시 **",
      "",
      "### **로그인**",
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    String access = createAccessToken(user);   // 짧게",
      "    String refresh = createRefreshToken(user); // 길게",
      "",
      "    saveRefreshToken(user.getId(), refresh);",
      "",
      "    return new Token(access, refresh);",
      "}",
      "```",
      "",
      "---",
      "",
      "### **재발급**",
      "",
      "```java",
      "public String reissue(String refreshToken) {",
      "",
      "    if (!isValid(refreshToken)) {",
      "        throw new UnauthorizedException();",
      "    }",
      "",
      "    return createAccessToken(getUser(refreshToken));",
      "}",
      "```",
      "",
      "---",
      "",
      "## **이 구조에서 꼭 이해해야 할 포인트**",
      "",
      "- Access → 서버 저장 없음 (Stateless)",
      "- Refresh → 서버 저장 있음 (Stateful)",
      "",
      "👉 완전 Stateless는 아니다",
      "",
      "---",
      "",
      "## **운영에서 가장 먼저 터지는 문제들 (학습 관점)**",
      "",
      "### **1. “로그아웃했는데 왜 계속 요청이 되지?”**",
      "",
      "**원인**",
      "",
      "- Access Token이 아직 살아있음",
      "",
      "**해결 방법**",
      "",
      "- 짧은 TTL",
      "",
      "---",
      "",
      "### **2. “토큰 탈취되면 끝 아닌가요?”**",
      "",
      "👉 맞습니다 (Access 기준)",
      "",
      "**해결 방법**",
      "",
      "- 짧은 TTL",
      "- Refresh 관리",
      "",
      "---",
      "",
      "### **3. “왜 Refresh Token까지 DB에 넣어요?”**",
      "",
      "**이유**",
      "",
      "- 탈취 대응",
      "- 강제 로그아웃",
      "",
      "---",
      "",
      "### **4. “Access 만료되면 요청 계속 실패하는데요?”**",
      "",
      "**이유**",
      "",
      "- 재발급 로직 없음",
      "",
      "**해결 방법**",
      "",
      "- 자동 refresh 요청",
      "",
      "---",
      "",
      "## **운영 체크리스트 (학습용)**",
      "",
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
      "| **영역** | **점검 항목** | **확인 기준** |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access/Refresh 구분 | 역할 명확 |",
      "| 보안 | HTTPS 사용 | 필수 |",
      "| 저장소 | Refresh 저장 | DB/Redis |",
      "| 만료 | Access 짧게 | 15~60분 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
      "",
      "---",
      "",
      "## **마치며**",
      "",
      "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다.",
      "",
      "오히려 반대입니다.",
      "",
      "> **“서버가 상태를 덜 들고도 동작하도록 설계를 더 많이 고민하는 구조”**",
      "",
      "세션, JWT, Refresh Token은 각각 다른 기술이 아니라",
      "",
      "> **“상태를 어디에 둘 것인가”에 대한 선택지** 입니다.",
      "",
      "그리고 가장 중요한 한 문장은 이것입니다.",
      "",
      "> **Stateless는 기술이 아니라, 요청을 완결시키는 설계 방식이다**",
      "",
      "---",
      "",
      "## **참고**",
      "",
      "- https://d2.naver.com/helloworld/59361",
      "- https://engineering.linecorp.com/ko/blog/line-login-session-management",
      "- https://auth0.com/docs/tokens",
      "- https://datatracker.ietf.org/doc/html/rfc7519",
    ].join("\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/996", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 996,
          version: 12,
          title: "코드 live 형상 글",
          content: liveShapeContent,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/996")

    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("코드 live 형상 글")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다.")

    const codeBlocks = page.locator(".aq-code-shell")
    await expect(codeBlocks).toHaveCount(4)
    await expect(codeBlocks.nth(0).locator(".aq-code-highlight-layer")).toContainText(
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인"
    )
    await expect(codeBlocks.nth(1).locator(".aq-code-highlight-layer")).toContainText('"userId": 123')
    await expect(codeBlocks.nth(2).locator(".aq-code-highlight-layer")).toContainText("public Token login")
    await expect(codeBlocks.nth(2).locator(".aq-code-highlight-layer")).toContainText("createAccessToken")
    await expect(codeBlocks.nth(3).locator(".aq-code-highlight-layer")).toContainText("public String reissue")
    await expect(codeBlocks.nth(3).locator(".aq-code-highlight-layer")).toContainText("createAccessToken")

    const readScrollTop = () => page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    const readSelectionText = () =>
      page.evaluate(
        () =>
          window.getSelection()?.toString() ||
          document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
          document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
          ""
      )
    const accessTokenCell = editor.locator("td", { hasText: "Access Token" }).first()
    await accessTokenCell.scrollIntoViewIfNeeded()
    await accessTokenCell.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    const accessTokenDrag = await accessTokenCell.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const startOffset = textNode.data.indexOf("Access Token")
        if (startOffset < 0) continue
        const range = document.createRange(); range.setStart(textNode, startOffset); range.setEnd(textNode, startOffset + "Access Token".length)
        const rect = range.getBoundingClientRect()
        if (rect.width <= 2 || rect.height <= 2) {
          throw new Error("live shape access token text rect is too small")
        }
        return { endX: rect.right - 2, startX: rect.left + 2, y: rect.top + rect.height / 2 }
      }
      throw new Error("live shape access token text node is missing")
    })
    const beforeAccessTokenDrag = await readScrollTop()
    await page.mouse.move(accessTokenDrag.startX, accessTokenDrag.y)
    await page.mouse.down()
    await page.mouse.move(accessTokenDrag.endX, accessTokenDrag.y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(560)
    await expect.poll(readSelectionText).toContain("Access Token")
    await expect.poll(readSelectionText).not.toContain("문제")
    await expect.poll(readScrollTop).toBeLessThanOrEqual(beforeAccessTokenDrag + 24)
    await expect.poll(readScrollTop).toBeGreaterThanOrEqual(beforeAccessTokenDrag - 24)
    await page.waitForTimeout(240)
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(40))
    const closingParagraph = editor.locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." }).first()
    await expect(closingParagraph).toBeVisible()
    await closingParagraph.scrollIntoViewIfNeeded()
    const paragraphPoint = await closingParagraph.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: Math.min(rect.width / 2, 220),
        y: Math.min(rect.height / 2, 18),
      }
    })
    const beforeParagraphClick = await readScrollTop()
    await closingParagraph.click({ position: paragraphPoint })
    await page.waitForTimeout(360)
    await expect.poll(readScrollTop).toBeLessThanOrEqual(beforeParagraphClick + 24)
    await expect.poll(readScrollTop).toBeGreaterThanOrEqual(beforeParagraphClick - 24)
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(40))
    const tableCell = editor.locator("td", { hasText: "구현되어 있는가" }).first()
    await expect(tableCell).toBeVisible()
    const tableCellPosition = await tableCell.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      return {
        x: Math.min(rect.width / 2, 160),
        y: Math.min(rect.height / 2, 18),
      }
    })
    await tableCell.hover({ position: tableCellPosition })
    const beforeTableClick = await readScrollTop()
    await tableCell.click({ position: tableCellPosition })
    await page.waitForTimeout(560)
    await expect.poll(readScrollTop).toBeLessThanOrEqual(beforeTableClick + 24)
    await expect.poll(readScrollTop).toBeGreaterThanOrEqual(beforeTableClick - 24)
    expect(selectionRuntimeErrors).toEqual([])
  })
})
