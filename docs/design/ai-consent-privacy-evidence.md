---
title: AI consent privacy evidence
last_verified: 2026-07-23
owner: kazuya
source_type: official_public_docs
requires_human_review:
  - privacy
  - legal
  - ai
---

# AI consent privacy evidence

Hana sends a child photo to Anthropic Claude only after explicit opt-in.
This evidence note records what active UI may safely claim before a public MVP release.

## Current Evidence

| topic                            | current evidence                                                                                                                                                                                                                              | product copy rule                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard Anthropic API retention | Anthropic's commercial data handling page says API inputs and outputs are automatically deleted within 30 days, with exceptions for longer-retention services, zero data retention agreements, Usage Policy enforcement, or legal compliance. | Do not claim 0-day retention unless Hana has a confirmed ZDR agreement and account setting.                                                                          |
| Zero data retention              | Anthropic's ZDR page says eligible API customers may have ZDR only under approved arrangements. It also notes safety classifier results can still be retained for policy enforcement.                                                         | Do not use `zero data retention` in active UI until the org setting and contract are confirmed.                                                                      |
| Model training                   | Claude support says Anthropic does not train models by default on data from commercial products such as Claude API. It separately describes an optional Development Partner Program for selected Claude Code data, not ordinary API calls.    | Active UI may say Hana sends only necessary data and requires opt-in. Public policy can mention commercial API default non-training only after legal/privacy review. |
| Consumer terms                   | Anthropic's 2025 consumer terms update says consumer model-training choices do not apply to API use.                                                                                                                                          | Do not mix consumer Claude app terms with Hana's API vendor explanation.                                                                                             |

## Sources Checked

- Anthropic Privacy Center, "How long do you store my organization's data?", checked 2026-07-23: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Anthropic Privacy Center, "I have a zero data retention agreement with Anthropic. What products does it apply to?", checked 2026-07-23: https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to
- Claude Help Center, "About the Development Partner Program", checked 2026-07-23: https://support.claude.com/en/articles/11174108-about-the-development-partner-program
- Anthropic, "Updates to Consumer Terms and Privacy Policy", checked 2026-07-23: https://www.anthropic.com/news/updates-to-our-consumer-terms

## Active UI Rules

- Say that AI is optional and only runs after consent.
- Name the data sent: photo, child given name, computed age, date, weather, and parent note.
- Name the data not sent: birthdate, email, address, raw location, image URL, presigned URL, and storage_key.
- Say vendor handling follows Anthropic's commercial API terms and Hana's privacy review.
- Do not claim 0-day retention.
- Do not claim contract-specific ZDR.
- Do not say child photos or names are never used for training unless the exact commercial API setting and terms are reviewed for launch.

## Release Gate

Before public MVP, a human reviewer must confirm:

- Anthropic organization settings, including whether ZDR is enabled.
- Whether Hana is enrolled in any optional data sharing or development partner program.
- Privacy policy / terms copy for AI image sending.
- App Store privacy labels.
- PR / support evidence contains no real child data, image URLs, storage_key, prompt text, or AI generated memory text.
