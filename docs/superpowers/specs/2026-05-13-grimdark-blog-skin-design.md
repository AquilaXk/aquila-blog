# Grimdark Blog Skin Design

## Summary
- Public blog users can switch between the current `classic` skin and a stronger `grimdark` skin.
- The first release applies only to public surfaces: home, feed, post detail, and About.
- Admin and editor surfaces stay on the current design language in this scope.
- Grimdark is an original gothic sci-fi treatment. It must not use official Warhammer 40K logos, faction marks, artwork, copy, or other IP assets.

## Goals
- Add a blog-skin axis, `classic | grimdark`, separate from the existing `scheme: light | dark` axis.
- Make the skin choice persistent across reloads.
- Preserve text readability by leaving public article typography unchanged.
- Keep the change reversible and testable through theme tokens and public-surface style hooks.

## Non-Goals
- No admin skinning.
- No editor skinning.
- No official Warhammer 40K assets.
- No dependency or package changes.
- No article font, font size, line-height, readable width, heading scale, or body copy changes.
- No unrelated behavior changes in routing, auth, comments, markdown parsing, or data fetching.

## User Experience
- The header exposes a compact skin selector near the current light/dark theme toggle.
- `classic` keeps the current visual language.
- `grimdark` changes the public blog's visual treatment through:
  - near-black page background with controlled texture or layered gradients,
  - dark iron surfaces,
  - muted brass borders,
  - deep red accent states,
  - sharper dividers and thin gothic sci-fi ornament lines,
  - stronger card/header/button atmosphere without changing layout density.
- The selected skin is stored client-side and restored on reload.
- If stored data is invalid or unavailable, the site falls back to `classic`.

## Readability Contract
- Article text remains the primary constraint.
- The implementation must not change the existing article typography scale, line-height, readable width, or font family.
- Background and surface contrast must keep body text, inline links, code, blockquote, callout, and table content readable.
- Decorative texture must stay behind content and must not reduce text contrast.
- Mobile screens must keep the current information hierarchy and avoid adding fixed layers that crowd the reading area.

## Architecture
- Add a `SkinType = "classic" | "grimdark"` type.
- Add a `useSkin` hook parallel to `useScheme`.
  - Query key: a dedicated `skin` key.
  - Persistence: cookie-based, matching the existing scheme persistence pattern.
  - Default: `classic`.
  - Invalid cookie values are ignored.
- Extend the Emotion theme with:
  - `skin: SkinType`,
  - public-skin token fields for background, surfaces, borders, accents, and optional decorative CSS snippets.
- Keep `createTheme({ scheme, skin })` as the single theme factory.
- Keep existing `colors[scheme]` available so current components continue to work.
- Add skin-specific values as additive tokens instead of replacing every component color ad hoc.

## Public Surface Application
- `RootLayout` passes both `scheme` and `skin` to `ThemeProvider`.
- Global styles may apply page-level grimdark background and selection/focus token adjustments.
- Header can read skin tokens for control, border, and accent styling.
- Feed cards, tag controls, profile/contact/service cards, and empty/loading states can opt into public skin tokens.
- Post detail wrapper/header/footer/comment shell can opt into public skin tokens.
- About page public sections can opt into public skin tokens.
- Admin and editor routes must not receive page-specific grimdark changes in this first release.

## Selector Behavior
- The selector is a small, accessible control in the header.
- It must expose both choices by name and indicate the selected skin.
- It must not replace the existing light/dark toggle.
- It must be usable at the header mobile breakpoint without causing nav/auth layout shifts.
- It persists immediately when changed.

## Error Handling
- Unknown stored skin values fall back to `classic`.
- Cookie write failures do not block rendering; the selected state can still update in memory for the current session.
- SSR and initial client render should prefer stable defaults to avoid hydration layout jumps.

## Testing
- Build: `yarn --cwd front build`.
- Bundle guard: `node front/scripts/check-bundle-size.mjs`.
- Playwright preflight: `yarn --cwd front playwright:preflight`.
- Public regression: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/smoke.spec.ts e2e/mobile-layout.spec.ts --workers=1`.
- Layout/perf regression: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/perf.spec.ts --workers=1`.
- Diff hygiene: `git diff --check`.

## Future Extension
- A later task can extend the same skin tokens to admin and editor surfaces after the public blog proves stable.
- That later task should decide whether admin/editor use the same skin selector or a separate preference.
