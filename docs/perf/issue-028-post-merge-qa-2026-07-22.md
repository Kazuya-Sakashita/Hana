# ISSUE-028 Post-Merge QA (2026-07-22)

## Scope

- GitHub Issue: #43
- Implementing PR: #44
- Base commit checked: `a14c086` (`origin/main` at QA start)
- QA branch: `codex/issue-043-post-merge-qa`
- Worktree: `/private/tmp/hana-issue43-post-merge-qa`

This QA verifies the merged `next/image` implementation for ISSUE-028 without
touching the active feature worktree.

## Result

| Check                                                                       | Result           | Evidence                                                                                                           |
| --------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `next.config.ts` keeps private signed URLs out of Vercel Image Optimization | PASS             | `images.unoptimized: true`; Supabase `remotePatterns` present                                                      |
| Main signed-URL image surfaces use `next/image`                             | PASS             | `/`, `/album`, `/memory/[memoryId]` import and render `Image`                                                      |
| Legacy `<img>` remains in `src/app` or `src/components`                     | PASS             | `rg -n "<img" src/app src/components` returned no matches                                                          |
| `/album` uses thumbnail signed URLs                                         | PASS (code/test) | `fetchMemoriesWithCovers` calls `generateSignedImageUrl(..., 'thumbnail')`; integration test expects `_thumb.webp` |
| `/memory/[memoryId]` uses preview signed URLs                               | PASS (code/test) | `fetchMemoryWithPreviews` calls `generateSignedImageUrl(..., 'preview')`; integration test expects `_preview.webp` |
| Memory detail first image is priority                                       | PASS (code)      | `priority={idx === 0}` on detail `Image`                                                                           |
| Full project gate                                                           | PASS             | `pnpm pr:gate` passed: format, lint, route-map, typecheck, 271 tests, build                                        |
| Variant-related integration tests                                           | PASS             | `uploads-url`, `memories`, `uploads`: 46 tests passed                                                              |

## Commands Run

```bash
pnpm install
pnpm pr:gate
pnpm test tests/integration/v1/uploads-url.test.ts tests/integration/v1/memories.test.ts tests/integration/v1/uploads.test.ts
rg -n "<img" src/app src/components
rg -n "from 'next/image'|<Image|<NextImage|priority=|sizes=|unoptimized" next.config.ts src/app src/components
rg -n "deriveVariantKey|generateSignedImageUrl\\(|'thumbnail'|'preview'|_thumb|_preview" src/features src/app/v1 tests/integration/v1
```

## Still Requires Authenticated Browser QA

The following acceptance criteria need an authenticated environment with real
memory/image data and should not be marked done from static checks alone:

- DevTools Network confirms `/album` image requests are `*_thumb.webp` signed URLs.
- DevTools Network confirms `/memory/{id}` image requests are `*_preview.webp` signed URLs.
- Viewport-outside `/album` images are not loaded during initial page load.
- Lighthouse mobile confirms "Properly size images" does not regress.
- `/memory/{id}` LCP is remeasured against the 2026-05-27 baseline.

## Recommendation

Keep GitHub Issue #43 open until the authenticated browser QA above is captured.
If no real data/staging environment is available, split that work into a small
follow-up issue and close #43 only after recording the limitation explicitly.
