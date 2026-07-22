---
title: Memory photo alt privacy policy
last_updated: 2026-07-23
owner: kazuya
requires_human_review:
  - accessibility
  - privacy
  - design
---

# Memory photo alt privacy policy

Hana's memory photos are sensitive family content.
Alt text must avoid guessing details about a child, place, emotion, or event.

## Current Policy

| surface                    | alt policy                     | reason                                                                                                                    |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Home recent thumbnails     | Decorative alt (`alt=""`)      | The visible memory title is already inside the same link. Repeating it through the image duplicates the link name.        |
| Album thumbnails           | Decorative alt (`alt=""`)      | Date, title, and body preview already label the card/link.                                                                |
| Memory detail hero photo   | Generic alt (`記録のしゃしん`) | The photo is the main content, so screen readers should know it exists, but Hana should not infer private image contents. |
| Record upload preview      | Generic selected-photo alt     | The user has just selected the image, and the preview is part of the form confirmation.                                   |
| Missing image placeholders | Hidden from assistive tech     | They are loading / decorative state only.                                                                                 |

## Active UI Rules

- Do not infer what is in a child photo.
- Do not reuse generated story text as photo alt.
- Do not expose image URLs, storage keys, location, or private metadata in alt.
- Use decorative alt when adjacent visible text already names the same link/card.
- Use generic alt when the photo is the main content on the screen.

## Future Decisions

Per-photo user-authored alt text may be useful later, but it needs:

- product copy explaining who hears it and where it appears,
- privacy review for real child data,
- API/schema design,
- moderation / export behavior,
- accessibility review with screen reader QA.
