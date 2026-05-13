# Global Blog Design Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the blog admin publish one global public blog design (`legacy | grid`), with light/dark mode available only for `legacy`.

**Architecture:** Persist `blogDesign` and `legacyBlogScheme` in the member profile workspace contract, publish them through `adminProfile`, and resolve public blog appearance from the published admin profile. Public routes consume additive Emotion theme tokens; admin/editor work surfaces keep their current operational UI except for the settings controls.

**Tech Stack:** Kotlin/Spring Boot member bounded context, Next.js pages router, React Query v5, Emotion styled components, Playwright, Gradle, Yarn.

---

## File Structure

- Modify `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberProfileWorkspace.kt`: add design defaults, normalization helpers, and workspace content fields.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberHasProfileCard.kt`: add legacy member attrs/getters/setters so non-workspace fallback profiles carry the same contract.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/MemberProxy.kt`: proxy the new member profile fields.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberWithUsernameDto.kt`: expose published design fields in public/admin profile responses.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberProfileWorkspaceResponseDto.kt`: expose draft/published design fields.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberController.kt`: accept design fields in profile card and workspace draft requests.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/application/port/input/MemberUseCase.kt`: add design arguments to the legacy profile-card use case.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberUseCaseAdapter.kt`: forward design arguments to the application service.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberApplicationService.kt`: persist design attrs from both legacy and workspace profile flows.
- Modify `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberProfileHydrator.kt`: hydrate persisted design attrs for member fallback responses.
- Modify `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberControllerTest.kt`: prove draft/save/publish behavior.
- Modify `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1MemberControllerWebMvcTest.kt`: prove public `adminProfile` exposes the published setting.
- Modify `front/src/types/index.ts`: add `BlogDesignType` and `LegacyBlogScheme`.
- Modify `front/src/libs/profileWorkspace.ts`: extend workspace model and normalization.
- Modify `front/src/hooks/useAdminProfile.ts` and `front/src/hooks/useAuthSession.ts`: type the two new fields.
- Modify `front/src/libs/server/adminProfile.ts`: include design fields in static and persisted public profile snapshots.
- Modify `front/src/pages/admin/profile.tsx`: add the admin-only public design settings section.
- Create `front/src/libs/blogAppearance.ts`: resolve effective public design/scheme from `AdminProfile`.
- Modify `front/src/styles/theme.ts`: add `blogDesign` and public design tokens.
- Modify `front/src/layouts/RootLayout/index.tsx` and `front/src/layouts/RootLayout/ThemeProvider/index.tsx`: apply global public appearance only on public blog routes.
- Modify `front/src/layouts/RootLayout/Header/index.tsx`: remove visitor public theme toggle on public blog routes and style header from public design tokens.
- Modify public surfaces under `front/src/routes/Feed/**`, `front/src/routes/About/**`, and `front/src/routes/Detail/PostDetail/**`: opt into grid tokens without changing article typography.
- Modify `front/e2e/admin-profile-state.spec.ts`, `front/e2e/smoke.spec.ts`, `front/e2e/mobile-layout.spec.ts`, and `front/e2e/perf.spec.ts`: add structural and public route regression coverage.
- Modify `front/contracts/openapi/openapi.json` only through the existing contract generation/fetch flow if backend verification updates it.
- Modify `front/packages/shared-contracts/src/generated/backend-openapi.d.ts` only through `yarn --cwd front contracts:generate` if the OpenAPI snapshot changes.
- Modify `docs/agent/frontend-ui.md` and `docs/agent/auth.md`: record the new global public design contract.

### Task 1: Backend Profile Contract

**Files:**
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberProfileWorkspace.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberHasProfileCard.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/MemberProxy.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberWithUsernameDto.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberProfileWorkspaceResponseDto.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberController.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/application/port/input/MemberUseCase.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberUseCaseAdapter.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberApplicationService.kt`
- Modify: `back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberProfileHydrator.kt`
- Test: `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberControllerTest.kt`
- Test: `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1MemberControllerWebMvcTest.kt`
- Generated: `front/contracts/openapi/openapi.json`
- Generated: `front/packages/shared-contracts/src/generated/backend-openapi.d.ts`

- [ ] **Step 1: Add failing backend assertions for the new public profile fields**

In `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1MemberControllerWebMvcTest.kt`, extend the `adminProfile` test setup and assertions:

```kotlin
adminMember.blogDesign = "grid"
adminMember.legacyBlogScheme = "light"

mockMvc
    .get("/member/api/v1/members/adminProfile") {
        secure = true
    }.andExpect {
        status { isOk() }
        jsonPath("$.blogDesign") { value("grid") }
        jsonPath("$.legacyBlogScheme") { value("light") }
    }
```

In `back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberControllerTest.kt`, add draft and publish assertions to the profile workspace test body:

```kotlin
"""
{
  "profileImageUrl": "",
  "profileRole": "Platform Engineer",
  "profileBio": "운영 가능한 시스템을 설계합니다.",
  "aboutHeadline": "이유를 먼저 따집니다.",
  "aboutRole": "Architecture Writer",
  "aboutBio": "문제와 운영을 같이 봅니다.",
  "aboutSections": [],
  "aboutProjectSectionTitle": "프로젝트",
  "aboutProjects": [],
  "blogTitle": "Aquila Workspace",
  "homeIntroTitle": "프로필 워크스페이스 실험실",
  "homeIntroDescription": "브랜드와 소개 문구를 분리 관리합니다.",
  "blogDesign": "grid",
  "legacyBlogScheme": "light",
  "serviceLinks": [],
  "contactLinks": []
}
""".trimIndent()
```

Add assertions after saving and after publishing:

```kotlin
jsonPath("$.draft.blogDesign") { value("grid") }
jsonPath("$.draft.legacyBlogScheme") { value("light") }
jsonPath("$.published.blogDesign") { value(previousPublishedDesign) }
jsonPath("$.published.legacyBlogScheme") { value(previousPublishedScheme) }
```

After publish, assert public profile response:

```kotlin
mockMvc
    .get("/member/api/v1/members/adminProfile")
    .andExpect {
        status { isOk() }
        jsonPath("$.blogDesign") { value("grid") }
        jsonPath("$.legacyBlogScheme") { value("light") }
    }
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run:

```bash
back/gradlew -p back test --tests '*ApiV1MemberControllerWebMvcTest*' --tests '*ApiV1AdmMemberControllerTest*'
```

Expected: FAIL with unresolved `blogDesign`/`legacyBlogScheme` properties or missing JSON paths.

- [ ] **Step 3: Implement backend domain fields and normalization**

In `MemberProfileWorkspace.kt`, add constants and helpers near the top:

```kotlin
const val BLOG_DESIGN_LEGACY = "legacy"
const val BLOG_DESIGN_GRID = "grid"
const val LEGACY_BLOG_SCHEME_LIGHT = "light"
const val LEGACY_BLOG_SCHEME_DARK = "dark"

fun normalizeBlogDesign(value: String?): String =
    when (value?.trim()?.lowercase()) {
        BLOG_DESIGN_GRID -> BLOG_DESIGN_GRID
        else -> BLOG_DESIGN_LEGACY
    }

fun normalizeLegacyBlogScheme(value: String?): String =
    when (value?.trim()?.lowercase()) {
        LEGACY_BLOG_SCHEME_LIGHT -> LEGACY_BLOG_SCHEME_LIGHT
        else -> LEGACY_BLOG_SCHEME_DARK
    }
```

Extend `MemberProfileWorkspaceContent`:

```kotlin
val blogDesign: String = BLOG_DESIGN_LEGACY,
val legacyBlogScheme: String = LEGACY_BLOG_SCHEME_DARK,
```

In `normalizeMemberProfileWorkspaceContent`, return normalized values:

```kotlin
blogDesign = normalizeBlogDesign(content.blogDesign),
legacyBlogScheme = normalizeLegacyBlogScheme(content.legacyBlogScheme),
```

In `MemberHasProfileCard.kt`, add attrs and properties:

```kotlin
const val BLOG_DESIGN = "blogDesign"
const val LEGACY_BLOG_SCHEME = "legacyBlogScheme"
private const val BLOG_DESIGN_DEFAULT_VALUE = BLOG_DESIGN_LEGACY
private const val LEGACY_BLOG_SCHEME_DEFAULT_VALUE = LEGACY_BLOG_SCHEME_DARK
```

```kotlin
fun getOrInitBlogDesignAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
    member.getOrPutAttr(BLOG_DESIGN) {
        loader?.invoke() ?: MemberAttr(0, member, BLOG_DESIGN, BLOG_DESIGN_DEFAULT_VALUE)
    }

fun getOrInitLegacyBlogSchemeAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
    member.getOrPutAttr(LEGACY_BLOG_SCHEME) {
        loader?.invoke() ?: MemberAttr(0, member, LEGACY_BLOG_SCHEME, LEGACY_BLOG_SCHEME_DEFAULT_VALUE)
    }

var blogDesign: String
    get() = normalizeBlogDesign(getOrInitBlogDesignAttr().strValue)
    set(value) {
        getOrInitBlogDesignAttr().strValue = normalizeBlogDesign(value)
    }

var legacyBlogScheme: String
    get() = normalizeLegacyBlogScheme(getOrInitLegacyBlogSchemeAttr().strValue)
    set(value) {
        getOrInitLegacyBlogSchemeAttr().strValue = normalizeLegacyBlogScheme(value)
    }
```

Include the fields in `currentProfileWorkspaceContent` and `applyProfileWorkspaceContent`.

In `MemberProxy.kt`, proxy the properties:

```kotlin
override var blogDesign
    get() = real.blogDesign
    set(value) {
        real.blogDesign = value
    }

override var legacyBlogScheme
    get() = real.legacyBlogScheme
    set(value) {
        real.legacyBlogScheme = value
    }
```

- [ ] **Step 4: Implement backend DTO/request propagation**

In `MemberWithUsernameDto.kt`, add constructor parameters and values:

```kotlin
val blogDesign: String,
val legacyBlogScheme: String,
```

```kotlin
blogDesign = workspaceContent?.blogDesign ?: member.blogDesign,
legacyBlogScheme = workspaceContent?.legacyBlogScheme ?: member.legacyBlogScheme,
```

In `MemberProfileWorkspaceResponseDto.kt`, add fields to `MemberProfileWorkspaceContentDto`:

```kotlin
val blogDesign: String,
val legacyBlogScheme: String,
```

and constructor values:

```kotlin
blogDesign = content.blogDesign,
legacyBlogScheme = content.legacyBlogScheme,
```

In `ApiV1AdmMemberController.kt`, extend `UpdateProfileCardRequest` and `UpdateProfileWorkspaceDraftRequest`:

```kotlin
@field:Size(max = 20)
val blogDesign: String? = null,
@field:Size(max = 20)
val legacyBlogScheme: String? = null,
```

Pass the fields into `MemberProfileWorkspaceContent` in `toDomain()`:

```kotlin
blogDesign = blogDesign?.trim() ?: member.blogDesign,
legacyBlogScheme = legacyBlogScheme?.trim() ?: member.legacyBlogScheme,
```

Pass the fields through the legacy profile-card endpoint as well, so older admin flows and workspace fallback snapshots keep the same published contract.

For the legacy `profileCard` PATCH path, omitted request fields preserve the current member values:

```kotlin
blogDesign = reqBody.blogDesign?.trim() ?: member.blogDesign,
legacyBlogScheme = reqBody.legacyBlogScheme?.trim() ?: member.legacyBlogScheme,
```

In `MemberUseCase.kt`, add parameters after `homeIntroDescription`:

```kotlin
blogDesign: String,
legacyBlogScheme: String,
```

In `MemberUseCaseAdapter.modifyProfileCard`, add the same parameters and forward them:

```kotlin
blogDesign = blogDesign,
legacyBlogScheme = legacyBlogScheme,
```

In `MemberApplicationService.modifyProfileCard`, add the same parameters, persist normalized member values, and save their attrs before `syncDraftWorkspaceFromLegacy(member)`:

```kotlin
member.blogDesign = blogDesign
member.legacyBlogScheme = legacyBlogScheme
saveBlogDesignAttr(member)
saveLegacyBlogSchemeAttr(member)
```

In `MemberApplicationService.saveProfileWorkspaceDraft`, persist the new attrs after the existing home intro attr saves:

```kotlin
saveBlogDesignAttr(member)
saveLegacyBlogSchemeAttr(member)
```

Add private attr savers near the other profile attr save helpers:

```kotlin
private fun saveBlogDesignAttr(member: Member) {
    memberAttrRepository.save(member.getOrInitBlogDesignAttr())
}

private fun saveLegacyBlogSchemeAttr(member: Member) {
    memberAttrRepository.save(member.getOrInitLegacyBlogSchemeAttr())
}
```

In `MemberProfileHydrator.kt`, include the new attr names in `profileAttrNames` and initialize them in `hydrateAll`:

```kotlin
BLOG_DESIGN,
LEGACY_BLOG_SCHEME,
```

```kotlin
member.getOrInitBlogDesignAttr()
member.getOrInitLegacyBlogSchemeAttr()
```

- [ ] **Step 5: Run backend targeted tests and style**

Run:

```bash
back/gradlew -p back test --tests '*ApiV1MemberControllerWebMvcTest*' --tests '*ApiV1AdmMemberControllerTest*'
back/gradlew -p back ktlintCheck
back/gradlew -p back test --tests 'com.back.global.springDoc.OpenApiContractExportTest' --no-daemon
cp back/build/openapi/openapi.json front/contracts/openapi/openapi.json
yarn --cwd front contracts:generate
(
  cd front
  yarn contracts:check
)
```

Expected: PASS.

- [ ] **Step 6: Commit backend contract**

```bash
git add back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberProfileWorkspace.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/memberMixin/MemberHasProfileCard.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/domain/shared/MemberProxy.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberWithUsernameDto.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/dto/MemberProfileWorkspaceResponseDto.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberController.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/application/port/input/MemberUseCase.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberUseCaseAdapter.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberApplicationService.kt \
  back/src/main/kotlin/com/back/boundedContexts/member/application/service/MemberProfileHydrator.kt \
  back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1AdmMemberControllerTest.kt \
  back/src/test/kotlin/com/back/boundedContexts/member/adapter/web/ApiV1MemberControllerWebMvcTest.kt \
  front/contracts/openapi/openapi.json \
  front/packages/shared-contracts/src/generated/backend-openapi.d.ts
git commit -m "feat(profile): global blog design 계약 추가"
git push
```

### Task 2: Frontend Settings Contract

**Files:**
- Modify: `front/src/types/index.ts`
- Modify: `front/src/libs/profileWorkspace.ts`
- Modify: `front/src/hooks/useAdminProfile.ts`
- Modify: `front/src/hooks/useAuthSession.ts`
- Modify: `front/src/libs/server/adminProfile.ts`
- Modify: `front/src/pages/admin/profile.tsx`
- Test: `front/e2e/admin-profile-state.spec.ts`

- [ ] **Step 1: Add failing frontend model tests**

In `front/e2e/admin-profile-state.spec.ts`, extend the `buildProfileWorkspaceAdminProfileCacheFields` fixture with:

```ts
blogDesign: "grid",
legacyBlogScheme: "light",
```

Add assertions:

```ts
expect(bridge.blogDesign).toBe("grid")
expect(bridge.legacyBlogScheme).toBe("light")
```

Add a normalization test:

```ts
test("profile workspace 정규화는 전역 블로그 디자인 fallback을 고정한다", () => {
  const normalized = normalizeProfileWorkspaceContent({
    profileImageUrl: "",
    profileRole: "",
    profileBio: "",
    aboutHeadline: "",
    aboutRole: "",
    aboutBio: "",
    aboutSections: [],
    aboutProjectSectionTitle: "",
    aboutProjects: [],
    blogTitle: "",
    homeIntroTitle: "",
    homeIntroDescription: "",
    blogDesign: "unknown" as never,
    legacyBlogScheme: "blue" as never,
    serviceLinks: [],
    contactLinks: [],
  })

  expect(normalized.blogDesign).toBe("legacy")
  expect(normalized.legacyBlogScheme).toBe("dark")
})
```

Add a source contract test:

```ts
test("profile 화면은 전역 블로그 디자인 설정과 legacy 전용 scheme control을 가진다", () => {
  const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

  expect(source).toContain('id: "design"')
  expect(source).toContain('label: "디자인"')
  expect(source).toContain('updateDraft("blogDesign",')
  expect(source).toContain('updateDraft("legacyBlogScheme",')
  expect(source).toContain('draft.blogDesign === "legacy"')
})
```

- [ ] **Step 2: Run frontend targeted test to verify it fails**

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/admin-profile-state.spec.ts --workers=1
```

Expected: FAIL because `blogDesign`/`legacyBlogScheme` are missing from types and the admin page source.

- [ ] **Step 3: Extend frontend types and workspace normalization**

In `front/src/types/index.ts`, add:

```ts
export type BlogDesignType = "legacy" | "grid"
export type LegacyBlogScheme = "light" | "dark"
```

In `front/src/libs/profileWorkspace.ts`, import the types and extend `ProfileWorkspaceContent`/`LegacyProfileLike`:

```ts
import type { BlogDesignType, LegacyBlogScheme } from "src/types"
```

```ts
blogDesign: BlogDesignType
legacyBlogScheme: LegacyBlogScheme
```

Add helpers:

```ts
export const normalizeBlogDesign = (value: unknown): BlogDesignType =>
  value === "grid" ? "grid" : "legacy"

export const normalizeLegacyBlogScheme = (value: unknown): LegacyBlogScheme =>
  value === "light" ? "light" : "dark"
```

Add fields to every `normalizeProfileWorkspaceContent`, `buildProfileWorkspaceAdminProfileCacheFields`, and `buildProfileWorkspaceFromLegacy` object:

```ts
blogDesign: normalizeBlogDesign(content.blogDesign),
legacyBlogScheme: normalizeLegacyBlogScheme(content.legacyBlogScheme),
```

```ts
blogDesign: normalized.blogDesign,
legacyBlogScheme: normalized.legacyBlogScheme,
```

```ts
blogDesign: normalizeBlogDesign(value?.blogDesign),
legacyBlogScheme: normalizeLegacyBlogScheme(value?.legacyBlogScheme),
```

- [ ] **Step 4: Extend admin profile/auth types**

In `front/src/hooks/useAdminProfile.ts`, add to `AdminProfile` and `AdminProfileLike`:

```ts
blogDesign?: BlogDesignType
legacyBlogScheme?: LegacyBlogScheme
```

and in `toAdminProfile`:

```ts
blogDesign: normalizeBlogDesign(value.blogDesign),
legacyBlogScheme: normalizeLegacyBlogScheme(value.legacyBlogScheme),
```

In `front/src/hooks/useAuthSession.ts`, add the optional fields to `AuthMember`.

In `front/src/pages/admin/profile.tsx`, extend `MemberMe` and SSR merge with:

```ts
blogDesign: profile.blogDesign || member.blogDesign || "legacy",
legacyBlogScheme: profile.legacyBlogScheme || member.legacyBlogScheme || "dark",
```

In `front/src/libs/server/adminProfile.ts`, import the same normalizers and add fallback/cookie snapshot fields:

```ts
import { normalizeBlogDesign, normalizeLegacyBlogScheme } from "src/libs/profileWorkspace"
```

```ts
blogDesign: "legacy",
legacyBlogScheme: "dark",
```

```ts
blogDesign: normalizeBlogDesign(profile.blogDesign),
legacyBlogScheme: normalizeLegacyBlogScheme(profile.legacyBlogScheme),
```

```ts
blogDesign: normalizeBlogDesign(parsed.blogDesign),
legacyBlogScheme: normalizeLegacyBlogScheme(parsed.legacyBlogScheme),
```

- [ ] **Step 5: Add admin design settings UI**

In `front/src/pages/admin/profile.tsx`, extend the section id:

```ts
type WorkspaceSectionId = "identity" | "about" | "home" | "design" | "links"
```

Add a section entry after `home`:

```ts
{
  id: "design",
  label: "디자인",
},
```

In `pickWorkspaceSectionContent`, add:

```ts
case "design":
  return {
    blogDesign: content.blogDesign,
    legacyBlogScheme: content.legacyBlogScheme,
  }
```

In the section state initial map, add:

```ts
design: { dirty: false, publishedDiff: false },
```

In `renderActiveSection`, add:

```tsx
case "design":
  return (
    <SectionStack>
      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>공개 블로그 디자인</h3>
            <p>방문자에게 보이는 전역 디자인입니다. Grid는 dark presentation으로 고정됩니다.</p>
          </div>
        </SectionBlockHeader>
        <SegmentedControl aria-label="공개 블로그 디자인">
          <SegmentButton
            type="button"
            data-active={draft.blogDesign === "legacy"}
            onClick={() => updateDraft("blogDesign", "legacy")}
          >
            Legacy
          </SegmentButton>
          <SegmentButton
            type="button"
            data-active={draft.blogDesign === "grid"}
            onClick={() => updateDraft("blogDesign", "grid")}
          >
            Grid
          </SegmentButton>
        </SegmentedControl>
      </FieldSectionCard>

      {draft.blogDesign === "legacy" ? (
        <FieldSectionCard>
          <SectionBlockHeader>
            <div>
              <h3>Legacy 색상 모드</h3>
              <p>Legacy 디자인에서만 공개 블로그의 light/dark를 선택합니다.</p>
            </div>
          </SectionBlockHeader>
          <SegmentedControl aria-label="Legacy 색상 모드">
            <SegmentButton
              type="button"
              data-active={draft.legacyBlogScheme === "light"}
              onClick={() => updateDraft("legacyBlogScheme", "light")}
            >
              Light
            </SegmentButton>
            <SegmentButton
              type="button"
              data-active={draft.legacyBlogScheme === "dark"}
              onClick={() => updateDraft("legacyBlogScheme", "dark")}
            >
              Dark
            </SegmentButton>
          </SegmentedControl>
        </FieldSectionCard>
      ) : (
        <FieldSectionCard>
          <SectionBlockHeader>
            <div>
              <h3>Grid 색상 모드</h3>
              <p>Grid 디자인은 가독성 보호를 위해 dark presentation으로 고정됩니다.</p>
            </div>
          </SectionBlockHeader>
        </FieldSectionCard>
      )}
    </SectionStack>
  )
```

Extend the preview rail with a design card when `activeSection === "design"`:

```tsx
{activeSection === "design" ? (
  <PreviewHomeCard>
    <span>Design</span>
    <strong>{previewContent.blogDesign === "grid" ? "Grid" : "Legacy"}</strong>
    <p>
      {previewContent.blogDesign === "legacy"
        ? `Legacy ${previewContent.legacyBlogScheme}`
        : "Grid dark presentation"}
    </p>
  </PreviewHomeCard>
) : null}
```

- [ ] **Step 6: Run frontend admin contract test**

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/admin-profile-state.spec.ts --workers=1
```

Expected: PASS.

- [ ] **Step 7: Commit frontend settings contract**

```bash
git add front/src/types/index.ts \
  front/src/libs/profileWorkspace.ts \
  front/src/hooks/useAdminProfile.ts \
  front/src/hooks/useAuthSession.ts \
  front/src/libs/server/adminProfile.ts \
  front/src/pages/admin/profile.tsx \
  front/e2e/admin-profile-state.spec.ts
git commit -m "feat(profile): global blog design 설정 UI 추가"
git push
```

### Task 3: Public Appearance Resolver And Theme

**Files:**
- Create: `front/src/libs/blogAppearance.ts`
- Modify: `front/src/styles/theme.ts`
- Modify: `front/src/layouts/RootLayout/ThemeProvider/index.tsx`
- Modify: `front/src/layouts/RootLayout/ThemeProvider/Global/index.tsx`
- Modify: `front/src/layouts/RootLayout/index.tsx`
- Modify: `front/src/layouts/RootLayout/Header/index.tsx`
- Modify: `front/src/layouts/RootLayout/Header/ThemeToggle.tsx`
- Modify: `front/src/pages/_app.tsx`
- Modify: `front/src/pages/admin.tsx`
- Modify: `front/src/pages/posts/[id].tsx`
- Modify: `front/src/libs/server/postDetailPage.ts`
- Modify: `front/src/hooks/useAdminProfile.ts`
- Modify: `front/src/routes/Admin/AdminShell.tsx`
- Test: `front/e2e/smoke.spec.ts`
- Test: `front/e2e/mobile-layout.spec.ts`

- [ ] **Step 1: Add failing resolver unit coverage through Playwright source checks**

In `front/e2e/smoke.spec.ts`, add a source contract test:

```ts
test("public blog appearance는 adminProfile 전역 설정에서 resolve된다", async () => {
  const resolverSource = readFileSync(path.resolve(__dirname, "../src/libs/blogAppearance.ts"), "utf8")
  const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")
  const headerSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/index.tsx"), "utf8")
  const logoSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/Logo.tsx"), "utf8")
  const adminShellSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")
  const appSource = readFileSync(path.resolve(__dirname, "../src/pages/_app.tsx"), "utf8")
  const postDetailPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/postDetailPage.ts"), "utf8")
  const useAdminProfileSource = readFileSync(path.resolve(__dirname, "../src/hooks/useAdminProfile.ts"), "utf8")

  expect(resolverSource).toContain('blogDesign === "grid"')
  expect(resolverSource).toContain('scheme: "dark"')
  expect(resolverSource).not.toContain("src/libs/profileWorkspace")
  expect(rootLayoutSource).toContain("resolvePublicBlogAppearance")
  expect(rootLayoutSource).toContain("usePublicAdminProfile(initialAdminProfile")
  expect(headerSource).toContain("showThemeToggle")
  expect(logoSource).not.toContain("useAdminProfile")
  expect(logoSource).toContain("blogTitle")
  expect(adminShellSource).not.toContain("useAdminProfile")
  expect(appSource).toContain("initialAdminProfile={initialAdminProfile}")
  expect(postDetailPageSource).toContain("queryKey.adminProfile()")
  expect(postDetailPageSource).toContain("initialAdminProfile")
  expect(postDetailPageSource).toContain('initialAdminProfileSource === "static-fallback"')
  expect(appSource).toContain("initialAdminProfileShouldRefetch")
  expect(rootLayoutSource).toContain("refetchOnMount: initialAdminProfileShouldRefetch")
  expect(rootLayoutSource).toContain("staleTimeMs: initialAdminProfileShouldRefetch ? 0 : undefined")
  expect(useAdminProfileSource).toContain("enabled?: boolean")
  expect(useAdminProfileSource).toContain("refetchOnMount?: boolean")
  expect(useAdminProfileSource).toContain("staleTimeMs?: number")
})
```

Also add behavioral coverage for the post detail admin profile seed helper:

```ts
import { resolveStaticAdminProfileSeed } from "../src/libs/server/postDetailPage"

test("post detail adminProfile seed marks published and fallback sources", async () => {
  const publishedProfile = {
    username: "aquila",
    name: "aquila",
    nickname: "aquila",
    profileImageUrl: "/avatar.png",
    blogDesign: "grid" as const,
    legacyBlogScheme: "light" as const,
  }

  await expect(resolveStaticAdminProfileSeed(async () => publishedProfile)).resolves.toMatchObject({
    profile: { blogDesign: "grid", legacyBlogScheme: "light" },
    source: "published",
  })
  await expect(
    resolveStaticAdminProfileSeed(async () => {
      throw new Error("admin profile unavailable")
    })
  ).resolves.toMatchObject({
    profile: { blogDesign: "legacy", legacyBlogScheme: "dark" },
    source: "static-fallback",
  })
})
```

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts --workers=1
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 2: Create the resolver**

Create `front/src/libs/blogAppearance.ts`:

```ts
import { CONFIG } from "site.config"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import type { BlogDesignType, LegacyBlogScheme, SchemeType } from "src/types"

export type PublicBlogAppearance = {
  blogDesign: BlogDesignType
  scheme: SchemeType
  legacyBlogScheme: LegacyBlogScheme
}

const resolveConfigScheme = (): LegacyBlogScheme =>
  CONFIG.blog.scheme === "light" ? "light" : "dark"

const normalizeBlogDesign = (value: unknown): BlogDesignType =>
  value === "grid" ? "grid" : "legacy"

const normalizeLegacyBlogScheme = (value: unknown): LegacyBlogScheme =>
  value === "light" ? "light" : "dark"

export const resolvePublicBlogAppearance = (
  profile: Pick<AdminProfile, "blogDesign" | "legacyBlogScheme"> | null | undefined
): PublicBlogAppearance => {
  const blogDesign = normalizeBlogDesign(profile?.blogDesign)
  const legacyBlogScheme = normalizeLegacyBlogScheme(profile?.legacyBlogScheme || resolveConfigScheme())

  return {
    blogDesign,
    legacyBlogScheme,
    scheme: blogDesign === "grid" ? "dark" : legacyBlogScheme,
  }
}
```

- [ ] **Step 3: Extend theme tokens**

In `front/src/styles/theme.ts`, add:

```ts
import { BlogDesignType } from "src/types"
```

Add token types:

```ts
type PublicDesignTokens = {
  pageBackgroundColor: string
  pageBackgroundImage: string
  surface: string
  surfaceElevated: string
  border: string
  borderStrong: string
  accent: string
  accentMuted: string
  textMuted: string
  shadow: string
}
```

Extend Emotion theme:

```ts
blogDesign: BlogDesignType
publicDesign: PublicDesignTokens
```

Add factory:

```ts
const createPublicDesignTokens = (scheme: SchemeType, blogDesign: BlogDesignType): PublicDesignTokens => {
  if (blogDesign === "grid") {
    return {
      pageBackgroundColor: "#090806",
      pageBackgroundImage:
        "linear-gradient(180deg, rgba(112, 25, 25, 0.14), transparent 18rem), radial-gradient(circle at 82% 0%, rgba(185, 140, 72, 0.12), transparent 24rem)",
      surface: "rgba(18, 17, 15, 0.94)",
      surfaceElevated: "rgba(28, 25, 21, 0.96)",
      border: "rgba(159, 126, 72, 0.26)",
      borderStrong: "rgba(185, 140, 72, 0.42)",
      accent: "#9d2f2f",
      accentMuted: "rgba(157, 47, 47, 0.18)",
      textMuted: "#c0b7aa",
      shadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
    }
  }

  return {
    pageBackgroundColor: scheme === "light" ? "#f3f5f8" : colors.dark.gray1,
    pageBackgroundImage:
      scheme === "light"
        ? "radial-gradient(circle at 18% -12%, rgba(37, 99, 235, 0.025), transparent 26%), radial-gradient(circle at 88% 0%, rgba(148, 163, 184, 0.04), transparent 22%)"
        : "none",
    surface: colors[scheme].gray1,
    surfaceElevated: colors[scheme].gray2,
    border: colors[scheme].gray5,
    borderStrong: colors[scheme].gray6,
    accent: colors[scheme].accentControl,
    accentMuted: colors[scheme].accentSurfaceSubtle,
    textMuted: colors[scheme].gray10,
    shadow: variables.ui.card.shadow,
  }
}
```

Update `Options` and `createTheme`:

```ts
type Options = {
  scheme: SchemeType
  blogDesign?: BlogDesignType
}
```

```ts
blogDesign: options.blogDesign ?? "legacy",
publicDesign: createPublicDesignTokens(options.scheme, options.blogDesign ?? "legacy"),
```

- [ ] **Step 4: Apply appearance only on public routes**

In `ThemeProvider/index.tsx`, accept `blogDesign` and call `createTheme({ scheme, blogDesign })`.

In `_app.tsx`, pass page-level `initialAdminProfile` into `RootLayout` so public pages can render the published admin profile appearance on SSR/first paint:

```ts
const initialAdminProfile = pageProps.initialAdminProfile ?? null
```

```tsx
<RootLayout initialAdminProfile={initialAdminProfile}>
```

In `RootLayout/index.tsx`, import `AdminProfile`, `useQuery`, and resolver. Add a lightweight public profile query and route guard:

```ts
const isPublicBlogRoute =
  router.pathname === "/" || router.pathname === "/about" || router.pathname === "/posts/[id]"
const adminProfile = usePublicAdminProfile(initialAdminProfile, { enabled: isPublicBlogRoute })
const publicAppearance = resolvePublicBlogAppearance(isPublicBlogRoute ? adminProfile : null)
const effectiveScheme = isPublicBlogRoute ? publicAppearance.scheme : scheme
const effectiveBlogDesign = isPublicBlogRoute ? publicAppearance.blogDesign : "legacy"
```

In `postDetailPage.ts`, fetch or fall back to the public admin profile during static prop generation, set `queryKey.adminProfile()` in the dehydrated React Query state, and return `initialAdminProfile` plus `initialAdminProfileSource` in props. If the source is `static-fallback`, use the short recovery revalidation window instead of the normal 1-hour ISR window.

In `posts/[id].tsx`, include `initialAdminProfile` and `initialAdminProfileSource` in the page props type so `_app.tsx` can consume them without changing article rendering.

In `_app.tsx`/`RootLayout/index.tsx`, derive `initialAdminProfileShouldRefetch` from `initialAdminProfileSource === "static-fallback"` and pass `refetchOnMount: initialAdminProfileShouldRefetch` plus `staleTimeMs: initialAdminProfileShouldRefetch ? 0 : undefined` into the public-route-only profile query.

In `useAdminProfile.ts`, keep the existing full profile hook for profile/about/admin callers. RootLayout must use a lightweight public profile query so non-public routes do not pull profile workspace/cookie/admin profile fetch code into the shared `_app` chunk.

Pass:

```tsx
<ThemeProvider scheme={effectiveScheme} blogDesign={effectiveBlogDesign}>
  <Scripts />
  <Header fullWidth={false} showThemeToggle={!isPublicBlogRoute} />
  ...
</ThemeProvider>
```

In `Header/index.tsx`, extend props:

```ts
type Props = {
  fullWidth: boolean
  showThemeToggle?: boolean
}
```

Render:

```tsx
{showThemeToggle ? <ThemeToggle /> : null}
```

- [ ] **Step 5: Move global background to public design tokens**

In `Global/index.tsx`, replace local body background constants with:

```ts
const bodyBackgroundColor = theme.publicDesign.pageBackgroundColor
const bodyBackgroundImage = theme.publicDesign.pageBackgroundImage
```

Keep `* { color-scheme: ${theme.scheme}; }` so grid uses dark color-scheme through the resolver.

- [ ] **Step 6: Run resolver/theme checks**

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts --workers=1
yarn --cwd front build
```

Expected: PASS.

- [ ] **Step 7: Commit resolver/theme**

```bash
git add front/src/libs/blogAppearance.ts \
  front/src/styles/theme.ts \
  front/src/layouts/RootLayout/ThemeProvider/index.tsx \
  front/src/layouts/RootLayout/ThemeProvider/Global/index.tsx \
  front/src/layouts/RootLayout/index.tsx \
  front/src/layouts/RootLayout/Header/index.tsx \
  front/src/pages/_app.tsx \
  front/src/pages/posts/[id].tsx \
  front/src/libs/server/postDetailPage.ts \
  front/src/hooks/useAdminProfile.ts \
  front/e2e/smoke.spec.ts
git commit -m "feat(frontend): public blog appearance resolver 추가"
git push
```

### Task 4: Grid Public Surface Styling

**Files:**
- Modify: `front/src/layouts/RootLayout/Header/index.tsx`
- Modify: `front/src/layouts/RootLayout/Header/Logo.tsx`
- Modify: `front/src/routes/Feed/index.tsx`
- Modify: `front/src/routes/Feed/PostList/PostCard.tsx`
- Modify: `front/src/routes/Feed/SearchInput.tsx`
- Modify: `front/src/routes/Feed/TagList.tsx`
- Modify: `front/src/routes/Feed/ProfileCard.tsx`
- Modify: `front/src/routes/Feed/ServiceCard.tsx`
- Modify: `front/src/routes/Feed/ContactCard.tsx`
- Modify: `front/src/pages/about.tsx`
- Modify: `front/src/routes/Detail/PostDetail/index.tsx`
- Modify: `front/src/routes/Detail/PostDetail/PostHeader.tsx`
- Modify: `front/src/libs/server/adminProfile.ts`
- Modify: `front/src/libs/server/postDetailPage.ts`
- Modify: `front/src/pages/index.tsx`
- Modify: `front/src/styles/theme.ts`
- Modify: `front/e2e/smoke.spec.ts`
- Modify: `front/e2e/mobile-layout.spec.ts`
- Modify: `front/e2e/perf.spec.ts`

- [x] **Step 1: Add public styling guard checks**

In `front/e2e/mobile-layout.spec.ts`, add a source contract test:

```ts
test("grid design은 공개 화면 토큰만 사용하고 article typography를 변경하지 않는다", () => {
  const detailSource = readFileSync(path.resolve(__dirname, "../src/routes/Detail/PostDetail/index.tsx"), "utf8")
  const themeSource = readFileSync(path.resolve(__dirname, "../src/styles/theme.ts"), "utf8")

  expect(themeSource).toContain('blogDesign === "grid"')
  expect(detailSource).toContain("theme.publicDesign")
  expect(detailSource).not.toContain("font-size: ${({ theme }) => theme.blogDesign")
  expect(detailSource).not.toContain("line-height: ${({ theme }) => theme.blogDesign")
})
```

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/mobile-layout.spec.ts --workers=1
```

Expected: FAIL until public surface styling consumes `theme.publicDesign`.

- [x] **Step 2: Apply grid tokens to header without layout changes**

In `Header/index.tsx`, update `StyledWrapper` background and border:

```ts
background-color: ${({ theme }) =>
  theme.blogDesign === "grid"
    ? "rgba(9, 8, 6, 0.88)"
    : theme.scheme === "light"
      ? "rgba(249, 251, 254, 0.94)"
      : `${theme.colors.gray1}e6`};
border-bottom: 1px solid ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
box-shadow: ${({ theme }) =>
  theme.blogDesign === "grid" ? "0 10px 28px rgba(0, 0, 0, 0.28)" : "none"};
```

In `Logo.tsx`, keep existing font size and weight. Only adjust color for grid:

```ts
color: ${({ theme }) => (theme.blogDesign === "grid" ? "#f4ead7" : theme.colors.gray12)};
```

- [x] **Step 3: Apply grid tokens to feed surfaces**

In feed cards and rail cards, replace only background/border/shadow/color accents with conditional tokens:

```ts
border: ${({ theme }) =>
  `${theme.variables.ui.card.borderWidth}px solid ${
    theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray4
  }`};
background: ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.surface : theme.colors.gray1};
box-shadow: ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.shadow : "var(--post-card-shadow)"};
```

For hover border:

```ts
border-color: ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray5};
```

Do not change `font-size`, `line-height`, `letter-spacing`, `max-width`, grid breakpoints, or card dimensions.

- [x] **Step 4: Apply grid tokens to About and Detail surfaces**

In `front/src/pages/about.tsx` and `front/src/routes/Detail/PostDetail/**`, change only page/container surface colors, borders, shadows, and decorative dividers:

```ts
background: ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.surface : theme.colors.gray1};
border-color: ${({ theme }) =>
  theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
```

For links and small accents:

```ts
color: ${({ theme }) =>
  theme.blogDesign === "grid" ? "#d8b46a" : theme.colors.accentLink};
```

Do not modify article typography declarations in markdown renderer, post content body, heading scales, or readable width variables.

- [x] **Step 5: Keep SSG fallback seeds from blocking public design refetch**

Home/About can render a static fallback admin profile when backend fetch is unavailable during SSG/SSR. That fallback must set `initialAdminProfileSource: "static-fallback"` so `RootLayout` refetches the published public admin profile on mount and the grid design is not hidden behind a stale legacy seed.

- [x] **Step 6: Run public layout/perf focused checks**

Run:

```bash
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/mobile-layout.spec.ts --workers=1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1
node front/scripts/check-bundle-size.mjs
yarn --cwd front build
```

Expected: PASS.

Observed:
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1` initially failed after the grid refetch fix because Header grid tokens were applied to operational legacy routes. Header was corrected to use `publicDesign` only when `theme.blogDesign === "grid"`.
- `node front/scripts/check-bundle-size.mjs` initially failed with `/ raw` 19 bytes over budget after the style/refetch patch. The root cause was the long theme background-image literal; preserving the same visual intent with compact CSS hex literals brought the route back under budget.

- [x] **Step 7: Commit public surface styling**

```bash
git add front/src/layouts/RootLayout/Header/index.tsx \
  front/src/layouts/RootLayout/Header/Logo.tsx \
  front/src/libs/server/adminProfile.ts \
  front/src/libs/server/postDetailPage.ts \
  front/src/pages/index.tsx \
  front/src/routes/Feed/index.tsx \
  front/src/routes/Feed/PostList/PostCard.tsx \
  front/src/routes/Feed/SearchInput.tsx \
  front/src/routes/Feed/TagList.tsx \
  front/src/routes/Feed/ProfileCard.tsx \
  front/src/routes/Feed/ServiceCard.tsx \
  front/src/routes/Feed/ContactCard.tsx \
  front/src/pages/about.tsx \
  front/src/styles/theme.ts \
  front/src/routes/Detail/PostDetail/index.tsx \
  front/src/routes/Detail/PostDetail/PostHeader.tsx \
  front/e2e/smoke.spec.ts \
  front/e2e/mobile-layout.spec.ts \
  front/e2e/perf.spec.ts \
  docs/superpowers/plans/2026-05-13-global-blog-design-setting.md
git commit -m "feat(frontend): grid public blog 디자인 적용"
git push
```

Observed: commit `fadbd491` pushed to `feat/grimdark-blog-skin`.

### Task 5: Contract Docs And Full Verification

**Files:**
- Modify: `docs/agent/frontend-ui.md`
- Modify: `docs/agent/auth.md`
- Modify: `docs/agent/grimdark-blog-skin-plan-2026-05-13.md`
- Modify: `front/contracts/openapi/openapi.json` if the contract generation flow changes it
- Create or modify: `.codex/tmp/pr-grimdark-blog-skin.md`

- [x] **Step 1: Update the local source-of-truth plan and briefs**

In `docs/agent/grimdark-blog-skin-plan-2026-05-13.md`, make sure `commit_plan` exactly matches the commits created in this work:

```md
1. `docs(frontend): grimdark blog skin 설계 고정`
2. `docs(frontend): global blog 디자인 설정 계약 갱신`
3. `docs(frontend): global blog 디자인 구현 계획 추가`
4. `feat(profile): global blog design 계약 추가`
5. `feat(profile): global blog design 설정 UI 추가`
6. `feat(frontend): public blog appearance resolver 추가`
7. `feat(frontend): grid public blog 디자인 적용`
8. `docs(frontend): global blog design 운영 계약 반영`
```

In `docs/agent/frontend-ui.md`, add the public design invariant:

```yaml
- "공개 블로그 디자인은 published admin profile의 `blogDesign=legacy|grid` 전역 설정을 따른다. 방문자용 디자인 선택 UI는 두지 않는다."
- "`legacy`만 `legacyBlogScheme=light|dark`를 적용하고, `grid`는 dark presentation으로 고정한다."
- "grid 디자인은 배경/surface/border/card/header/link accent만 바꾸며 공개 상세 본문 타이포 scale/line-height/readable width/font는 변경하지 않는다."
```

In `docs/agent/auth.md`, add the member/profile contract invariant:

```yaml
- "공개 `/member/api/v1/members/adminProfile`과 관리자 profile workspace 응답은 `blogDesign`과 `legacyBlogScheme`을 포함해야 하며, 누락/invalid 값은 legacy/dark로 정규화한다."
```

- [x] **Step 2: Run full related verification**

Run in order:

```bash
back/gradlew -p back ktlintCheck
back/gradlew -p back test
yarn --cwd front build
node front/scripts/check-bundle-size.mjs
yarn --cwd front playwright:preflight
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/admin-profile-state.spec.ts --workers=1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts e2e/mobile-layout.spec.ts --workers=1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1
git diff --check
CURRENT_TASK_SLUG=grimdark-blog-skin bash tools/guards/current-task-preflight.sh
```

Expected: PASS. On command failure, classify it as code regression or environment/permission before retrying.

Observed:
- `back/gradlew -p back ktlintCheck` PASS
- `back/gradlew -p back test` PASS
- `yarn --cwd front build` PASS
- `node front/scripts/check-bundle-size.mjs` PASS
- `yarn --cwd front playwright:preflight` PASS
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/admin-profile-state.spec.ts --workers=1` PASS
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts e2e/mobile-layout.spec.ts --workers=1` PASS
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1` PASS

- [x] **Step 3: Commit docs and contract artifacts**

Repository hook forbids tracking ignored `docs/agent/**` files. Keep `docs/agent/frontend-ui.md`, `docs/agent/auth.md`, and `docs/agent/grimdark-blog-skin-plan-2026-05-13.md` updated as local agent briefs, and commit the tracked implementation plan as the PR-visible operating contract.

```bash
git add docs/superpowers/plans/2026-05-13-global-blog-design-setting.md
git commit -m "docs(frontend): global blog design 운영 계약 반영"
git push
```

Observed: docs commit `354364de` pushed to `feat/grimdark-blog-skin`.

- [x] **Step 4: Open the PR**

Create `.codex/tmp/pr-grimdark-blog-skin.md` with the repository PR template. The first section must include:

```md
close #227
```

Include:

```md
## Summary
- 관리자 전역 설정으로 공개 블로그 디자인 `legacy | grid`를 publish한다.
- `legacy`에서만 light/dark를 적용하고 `grid`는 dark presentation으로 고정한다.
- 공개 블로그는 visitor-local 선택 UI 없이 published admin profile을 기준으로 렌더한다.

## Verification
- [ ] back/gradlew -p back ktlintCheck
- [ ] back/gradlew -p back test
- [ ] yarn --cwd front build
- [ ] node front/scripts/check-bundle-size.mjs
- [ ] yarn --cwd front playwright:preflight
- [ ] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/admin-profile-state.spec.ts --workers=1
- [ ] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts e2e/mobile-layout.spec.ts --workers=1
- [ ] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1
- [ ] git diff --check
```

Run:

```bash
gh pr create --repo AquilaXk/aquila-blog --base main --head feat/grimdark-blog-skin --title "[Feat] Global blog 디자인 설정" --body-file .codex/tmp/pr-grimdark-blog-skin.md --draft
```

Expected: a draft PR URL targeting `main`.

Observed: draft PR `#228` targeting `main`: https://github.com/AquilaXk/aquila-blog/pull/228
