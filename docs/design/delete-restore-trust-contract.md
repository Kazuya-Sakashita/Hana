---
title: Delete restore trust contract
last_updated: 2026-07-23
owner: kazuya
requires_human_review:
  - privacy
  - release
  - design
---

# Delete restore trust contract

Hana currently uses logical deletion for memories, but the active product does not have a user-facing restore flow.

## Current Contract

| layer             | current behavior                                                          | product copy rule                                                      |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Memory delete API | The memory is hidden from normal reads by setting `deleted_at`.           | Active UI may say the memory will stop showing in the album.           |
| Restore UI        | No restore screen exists in the MVP app.                                  | Active UI must not say users can restore it themselves.                |
| Support restore   | No support process is documented.                                         | Active UI must not promise support-based restore.                      |
| Physical deletion | Account/profile deletion and later physical cleanup remain release-gated. | Do not mention exact physical deletion timing in memory delete dialog. |

## Active UI Rules

- Say what happens immediately: the page stops showing in the album.
- Keep the confirmation calm and reversible-feeling only through cancellation before delete.
- Do not claim "7 days" or any exact restore window.
- Do not say "you can restore this later" until restore UI/API/support flow is implemented and reviewed.

## Release Gate

Before Hana can promise restore in product copy, a human reviewer must confirm:

- Restore UI or support flow exists.
- API behavior and ownership checks are documented.
- Storage object behavior is documented.
- Privacy policy / terms match the product promise.
- Manual QA covers delete, restore, failed restore, and unauthorized restore attempts.
