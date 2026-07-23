---
title: Album full-list QA contract
last_updated: 2026-07-23
owner: kazuya
requires_human_review:
  - accessibility
  - design
---

# Album full-list QA contract

Hana's album must not look like only the most recent memories exist when a user has more than the first page.

## Current Contract

| topic           | contract                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| Initial render  | `/album` keeps server-rendered first page for fast first paint.                        |
| Pagination      | `GET /memories` returns `page.next_cursor`; the client uses it to fetch the next page. |
| Append behavior | Loading more appends pages and keeps the first SSR page visible.                       |
| End state       | When `next_cursor` is null, the load-more action disappears.                           |
| Empty state     | Empty album still shows the gentle first-memory CTA.                                   |

## QA Data Shape

Synthetic QA should cover:

- 0 memories: empty state.
- 1 to 49 memories: no load-more action.
- 50 memories with `next_cursor: null`: no load-more action.
- 51 or more memories: load-more action appears, appends older memories, and disappears on final page.
- Favorite toggle after loading an older page updates without resetting the list.

## Evidence Rules

- Do not use real child photos, names, image URLs, storage keys, or AI generated memory text in QA artifacts.
- Use synthetic titles such as `ページ 001`.
- Screenshot URLs must not expose signed image URLs.
