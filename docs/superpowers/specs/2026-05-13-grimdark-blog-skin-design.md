# Global Blog Design Setting

## Summary
- The blog admin controls one global public blog design setting: `legacy | grid`.
- Visitors do not choose the blog design or color mode from the public header.
- `legacy` keeps the current blog design and is the only design that supports light/dark mode.
- `grid` is the stronger gothic sci-fi public design. It is fixed to a dark presentation and ignores light/dark mode.
- The first release applies the selected global design only to public surfaces: home, feed, post detail, and About.
- Admin and editor work surfaces stay on the current operational design language in this scope, except for the admin controls needed to manage the global public blog setting.
- The grid design is an original gothic sci-fi treatment. It must not use official Warhammer 40K logos, faction marks, artwork, copy, or other IP assets.

## Goals
- Add a persisted global public blog design axis, `legacy | grid`, to the admin profile publish contract.
- Add a persisted global legacy color mode that is enabled only when the design is `legacy`.
- Make the public blog resolve its appearance from the published admin profile, not from a visitor-local skin selector.
- Preserve text readability by leaving public article typography unchanged.
- Keep the change reversible and testable through theme tokens and public-surface style hooks.

## Non-Goals
- No visitor-facing skin selector.
- No visitor-local design persistence.
- No admin work-surface skinning beyond settings controls.
- No editor skinning.
- No official Warhammer 40K assets.
- No dependency or package changes.
- No article font, font size, line-height, readable width, heading scale, or body copy changes.
- No unrelated behavior changes in routing, auth, comments, markdown parsing, or data fetching.

## User Experience
- The admin profile/settings workflow exposes a public blog design choice:
  - `legacy`: current public blog design.
  - `grid`: gothic sci-fi public blog design.
- The admin can choose light or dark mode only while `legacy` is selected.
- When `grid` is selected, the color mode control is disabled or hidden and the public blog renders with the grid dark appearance.
- Public visitors see the selected design directly. They do not see a design selector.
- Public visitors also do not get a light/dark toggle for `grid`; legacy light/dark behavior follows the admin's global legacy mode.
- `grid` changes the public blog's visual treatment through:
  - near-black page background with controlled texture or layered gradients,
  - dark iron surfaces,
  - muted brass borders,
  - deep red accent states,
  - sharper dividers and thin gothic sci-fi ornament lines,
  - stronger card/header/button atmosphere without changing layout density.
- If the published setting is invalid or unavailable, the site falls back to `legacy` and the existing configured scheme.

## Readability Contract
- Article text remains the primary constraint.
- The implementation must not change the existing article typography scale, line-height, readable width, or font family.
- Background and surface contrast must keep body text, inline links, code, blockquote, callout, and table content readable.
- Decorative texture must stay behind content and must not reduce text contrast.
- Mobile screens must keep the current information hierarchy and avoid adding fixed layers that crowd the reading area.

## Architecture
- Add `BlogDesignType = "legacy" | "grid"`.
- Add `LegacyBlogScheme = "light" | "dark"`.
- Extend the admin profile publish/workspace contract with:
  - `blogDesign: BlogDesignType`.
  - `legacyBlogScheme: LegacyBlogScheme`.
- Normalize invalid or missing values to:
  - `blogDesign = "legacy"`.
  - `legacyBlogScheme = CONFIG.blog.scheme` if it is `light` or `dark`, otherwise `dark`.
- Add a front-end appearance resolver:
  - Input: published `AdminProfile` plus config fallback.
  - Output: effective design and effective scheme.
  - Rule: `grid` always resolves to `scheme = "dark"`.
  - Rule: `legacy` resolves to the global `legacyBlogScheme`.
- Extend the Emotion theme with:
  - `blogDesign: BlogDesignType`,
  - public-design token fields for background, surfaces, borders, accents, and optional decorative CSS snippets.
- Keep `createTheme({ scheme, blogDesign })` as the single theme factory.
- Keep existing `colors[scheme]` available so current components continue to work.
- Add design-specific values as additive tokens instead of replacing every component color ad hoc.

## Public Surface Application
- `RootLayout` passes both effective `scheme` and `blogDesign` to `ThemeProvider`.
- Global styles may apply page-level grid background and selection/focus token adjustments.
- Header can read public design tokens for control, border, and accent styling, but it must not expose a public design selector.
- Feed cards, tag controls, profile/contact/service cards, and empty/loading states can opt into public design tokens.
- Post detail wrapper/header/footer/comment shell can opt into public design tokens.
- About page public sections can opt into public design tokens.
- Admin and editor routes must not receive page-specific grid styling in this first release.

## Admin Setting Behavior
- The admin profile/settings screen owns the public blog design controls.
- `legacy | grid` is a global setting published with the admin profile.
- The light/dark mode control is available only for `legacy`.
- When the admin switches to `grid`, any saved legacy light/dark value is retained for future return to `legacy`, but it does not affect the public grid render.
- The public profile preview should show the effective public design choice so the admin can verify the global setting before publishing.

## Error Handling
- Unknown stored or API-provided design values fall back to `legacy`.
- Unknown legacy scheme values fall back to the configured legacy scheme or `dark`.
- If backend profile fields are absent during a rolling deploy, the frontend uses the same fallbacks and keeps rendering.
- SSR and initial client render should prefer stable defaults to avoid hydration layout jumps.

## Testing
- Backend member/profile tests must cover persistence, workspace draft/publish, and public `/member/api/v1/members/adminProfile` response fields.
- Build: `yarn --cwd front build`.
- Bundle guard: `node front/scripts/check-bundle-size.mjs`.
- Playwright preflight: `yarn --cwd front playwright:preflight`.
- Public regression: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts e2e/mobile-layout.spec.ts --workers=1`.
- Layout/perf regression: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1`.
- Backend Kotlin style: `./gradlew -p back ktlintCheck`.
- Backend tests: `./gradlew -p back test`.
- Diff hygiene: `git diff --check`.

## Future Extension
- A later task can extend the same design tokens to admin and editor surfaces after the public blog proves stable.
- That later task should decide whether admin/editor use the same global public setting, a separate work-surface preference, or no alternate design.
