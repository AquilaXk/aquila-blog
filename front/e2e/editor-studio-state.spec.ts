import { expect, test } from "@playwright/test"
import {
  deriveEditorPersistenceState,
  isPublishActionDisabled,
} from "src/routes/Admin/editorStudioState"
import { resolveEditorMetaSnapshot, restoreEmptyFencedCodeBlocks } from "src/routes/Admin/editorStudioMetaModel"
import { createBlockEditorLoadGuardState, restoreBlockEditorCodeLossUpdate } from "src/routes/Admin/editorLoadSyncGuard"
import { buildPreviewSummaryFromMarkdown, normalizeCardSummary, normalizePersistedSummary } from "src/libs/postSummary"
import { restoreEditorDocCodeBlocksFromMarkdown } from "src/components/editor/serialization"

test.describe("editor studio state", () => {
  test("기존 글은 서버 baseline과 같으면 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:1",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "",
      loadingKey: "",
    })

    expect(state.text).toBe("저장됨")
    expect(state.tone).toBe("success")
    expect(state.isPersistedEditBaseline).toBe(true)
  })

  test("기존 글을 수정하면 저장되지 않은 변경으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:2",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("저장되지 않은 변경")
    expect(state.tone).toBe("idle")
    expect(state.isPersistedEditBaseline).toBe(false)
  })

  test("새 글은 local draft와 같으면 자동 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "create",
      hasSelectedManagedPost: false,
      hasEditorDraftContent: true,
      editorStateFingerprint: "local:1",
      serverBaselineFingerprint: "",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("자동 저장됨")
    expect(state.tone).toBe("success")
    expect(state.isAutoSavedCreateDraft).toBe(true)
  })

  test("수정 반영 버튼은 edit mode + not loading + 최소 유효성일 때만 활성이다", () => {
    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(false)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "create",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "modifyPost",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: false,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: true,
      })
    ).toBe(true)
  })

  test("summary sentinel placeholder는 저장값으로 재사용하지 않고 본문 기준 요약으로 되돌린다", () => {
    const content =
      "## Stateless란 무엇인가?\n\nStateless는 서버가 요청 사이 사용자 상태를 저장하지 않고, 요청만으로 인증·인가 판단에 필요한 정보를 처리하는 방식이다."

    expect(normalizePersistedSummary("요약을 생성할 수 없습니다.")).toBe("")
    expect(normalizeCardSummary("요약을 생성할 수 없습니다.", { fallback: "" })).toBe("")
    expect(buildPreviewSummaryFromMarkdown(content, 150, "")).toContain(
      "Stateless는 서버가 요청 사이 사용자 상태를 저장하지 않고"
    )
  })

  test("contentHtml fallback은 빈 fenced code body를 pretty-code 원문으로 복구한다", () => {
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const htmlRecoveredContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "const answer = 42;",
      "return answer",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")

    expect(restoreEmptyFencedCodeBlocks(staleContent, htmlRecoveredContent)).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
  })

  test("contentHtml fallback은 pretty-code raw attribute만 있어도 빈 코드블럭을 복구한다", () => {
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "",
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

    expect(resolveEditorMetaSnapshot(staleContent, prettyCodeHtml).body).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
  })

  test("contentHtml fallback은 두 줄짜리 빈 fenced code body도 pretty-code 원문으로 복구한다", () => {
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
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts" data-raw-code="const answer = 42;&#10;return answer">',
      '</code>',
      '</pre>',
      '</div>',
    ].join("")

    expect(resolveEditorMetaSnapshot(staleContent, prettyCodeHtml).body).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
  })

  test("초기 editor doc의 빈 코드블럭은 source markdown의 non-empty fence로 복구한다", () => {
    const sourceMarkdown = [
      "코드 본문 보존 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    return new Token(access, refresh);",
      "}",
      "```",
    ].join("\n")
    const staleDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "코드 본문 보존 대상입니다." }],
        },
        { type: "codeBlock", attrs: { language: "text" }, content: [] },
        { type: "codeBlock", attrs: { language: "java" }, content: [] },
      ],
    }

    const restored = restoreEditorDocCodeBlocksFromMarkdown(sourceMarkdown, staleDoc)

    expect(restored.changed).toBe(true)
    expect(restored.doc.content?.[1]?.content?.[0]?.text).toBe("로그인 -> 세션 생성 -> 이후 요청에서 세션 확인")
    expect(restored.doc.content?.[2]?.content?.[0]?.text).toContain("return new Token(access, refresh);")
  })

  test("초기 editor doc의 보이지 않는 placeholder 코드블럭은 source markdown의 non-empty fence로 복구한다", () => {
    const sourceMarkdown = [
      "코드 본문 visibility 복구 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
    ].join("\n")
    const staleDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "코드 본문 visibility 복구 대상입니다." }],
        },
        { type: "codeBlock", attrs: { language: "text" }, content: [{ type: "text", text: "\u200B" }] },
      ],
    }

    const restored = restoreEditorDocCodeBlocksFromMarkdown(sourceMarkdown, staleDoc)

    expect(restored.changed).toBe(true)
    expect(restored.doc.content?.[1]?.content?.[0]?.text).toBe("로그인 -> 세션 생성 -> 이후 요청에서 세션 확인")
  })

  test("source/current 코드블럭 매핑이 어긋나면 빈 NodeView를 잘못한 source 본문으로 복구하지 않는다", () => {
    const sourceMarkdown = [
      "코드 본문 구조 이동 방지 대상입니다.",
      "",
      "```ts",
      "const access = createAccessToken(user)",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "    return new Token(access, refresh);",
      "}",
      "```",
    ].join("\n")
    const staleDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "코드 본문 구조 이동 방지 대상입니다." }],
        },
        { type: "codeBlock", attrs: { language: "java" }, content: [] },
        { type: "codeBlock", attrs: { language: "ts" }, content: [] },
      ],
    }

    const restored = restoreEditorDocCodeBlocksFromMarkdown(sourceMarkdown, staleDoc)

    expect(restored.changed).toBe(false)
    expect(restored.doc).toBe(staleDoc)
    expect(restored.doc.content?.[1]?.content || []).toHaveLength(0)
    expect(restored.doc.content?.[2]?.content || []).toHaveLength(0)
  })

  test("초기 로드 guard는 서버 baseline보다 빈 code fence가 들어온 editor update를 복구한다", () => {
    const expectedBody = [
      "코드 손실 방지 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "    return new Token(access, refresh);",
      "}",
      "```",
      "",
      "```mermaid",
      "sequenceDiagram",
      "    participant Client",
      "    participant Server",
      "```",
      "",
      "```ts",
      "const access = createAccessToken(user)",
      "```",
    ].join("\n")
    const staleEditorUpdate = [
      "코드 손실 방지 대상입니다.",
      "",
      "```text",
      "```",
      "",
      "```java",
      "\u200B",
      "```",
      "",
      "```mermaid",
      "sequenceDiagram",
      "    participant Client",
      "    participant Server",
      "```",
      "",
      "```ts",
      "```",
    ].join("\n")
    const guardState = createBlockEditorLoadGuardState(expectedBody, 1_000, 1_200)

    const restored = restoreBlockEditorCodeLossUpdate({
      nextMarkdown: staleEditorUpdate,
      guardState,
      nowMs: 1_300,
    })

    expect(restored.changed).toBe(true)
    expect(restored.markdown).toContain("로그인 -> 세션 생성 -> 이후 요청에서 세션 확인")
    expect(restored.markdown).toContain("return new Token(access, refresh);")
    expect(restored.markdown).toContain("const access = createAccessToken(user)")
    expect(restored.markdown.indexOf("sequenceDiagram")).toBeLessThan(
      restored.markdown.indexOf("const access = createAccessToken(user)")
    )
  })

})
