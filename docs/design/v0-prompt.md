# Hana — V0 AI 用 デザインプロンプト

> v0.dev に貼り付けて使う、Hana のプロダクトデザイン生成用プロンプト集。
> 「課金に値する温度感」「SNS的ではない、私的なアルバムの感覚」を生成させるための完全プロンプト。

---

## 0. 使い方

- **基本プロンプト（章 1〜4）** を v0 の初回入力にそのまま貼る
- 画面ごとに **画面別プロンプト（章 5）** を追加で投げて反復する
- 反復時は「もっと余白を」「ピンクを抜いて生成り色だけに」など、章 6 の **ボキャブラリー** を使うと意図が通る

---

## 1. メインプロンプト（v0 に最初に貼るやつ）

```
You are designing a premium, emotionally-driven product called "Hana" — an AI-powered
parenting memory app for Japanese mothers of children aged 0–3.

Build a polished, production-grade Next.js 16 (App Router) interface using:
- TypeScript (strict)
- Tailwind CSS v4 with CSS variables
- shadcn/ui as the component foundation (Card, Button, Dialog, Sheet, Avatar, Badge, Tabs, Drawer)
- lucide-react for iconography (thin, rounded variants only)
- Framer Motion for micro-interactions
- next/image with blurDataURL placeholders
- next/font with "Noto Serif JP" for narrative text and "Inter" for UI labels

The product's one-line promise:
  「子どもとの今日が、10年後の宝物になる。」
  ("Today with your child becomes tomorrow's treasure.")

Core flow the design must serve:
  Photo (1 tap) → AI-generated short story (5–8s) → approve/edit → saved as a memory
  Total: under 30 seconds. One-handed, post-bedtime, dim-room usage.

This is NOT a social network. There are no likes, no public feeds, no streak shaming.
It is a private digital album that whispers, not shouts.

──────────────────────────────────────────────
DESIGN SOUL (do not violate these)
──────────────────────────────────────────────
1. "Album, not feed." Think of opening a leather-bound family album in late evening lamplight.
2. "Whisper, not shout." Type scale is tender. Motion is slow. Nothing pulses or demands attention.
3. "Forgive the user." Never show streaks broken, days missed, or empty-state guilt. If they return after 3 weeks, the app says「おかえり」("Welcome back"), never「3週間ぶりです」.
4. "AI is invisible." Never label generated text as "AI". The AI is a ghostwriter the parent forgets about.
5. "Premium without flexing." No gradients-as-decoration, no glassmorphism for show, no rainbow accents. Restraint is the luxury signal.
6. "Mobile-first, one-handed." Primary actions live in the bottom 35% of the viewport. Thumb-reachable.

──────────────────────────────────────────────
VISUAL SYSTEM
──────────────────────────────────────────────
Palette (warm, washi-paper inspired — NOT pastel-cute, NOT SNS-bright):
  --bg-canvas:       #FBF7F2   /* ivory washi base */
  --bg-elevated:     #FFFFFF   /* card surface */
  --bg-warm:         #F5EDE3   /* subtle warm wash for sections */
  --ink-primary:     #2A2522   /* near-black, warm-shifted */
  --ink-secondary:   #6B5F57   /* muted brown-grey for body */
  --ink-tertiary:    #A89C92   /* timestamps, helpers */
  --accent-sakura:   #E8B4B8   /* the ONE accent — sparingly, on key CTAs only */
  --accent-deep:     #8C5A5E   /* hover state for sakura */
  --hairline:        #EDE4D8   /* dividers, never pure grey */
  --success-leaf:    #7A8B6F   /* soft sage */
  --warning-amber:   #C89766   /* warm amber, never red */

Forbidden colors: pure black (#000), pure white text on color, neon, gradients
spanning >2 stops, rainbow, anything saturated above ~60%.

Typography:
  - Headings: Noto Serif JP, weight 500, tight tracking (-0.01em), generous line-height 1.45
  - Body / narrative: Noto Serif JP, weight 400, line-height 1.85 (read like a book)
  - UI labels, buttons, metadata: Inter, weight 500, slightly wide tracking (+0.02em)
  - NEVER use Inter for the AI-generated story body. The serif IS the soul.
  - Numbers (day count, age in months): tabular-nums, Inter, light weight

Scale (mobile-first, base 16px):
  display: 28px / 600 serif
  h1:      24px / 500 serif
  h2:      20px / 500 serif
  body:    16px / 400 serif (1.85 leading)
  ui:      14px / 500 sans
  meta:    12px / 500 sans, uppercase, tracking +0.08em (for "RECORDED ON" style labels)

Spacing: 4/8/12/16/20/24/32/48/64 — generous whitespace, especially around photos.
Photos breathe. Never pack them edge-to-edge.

Corners:
  - Cards / surfaces: 20px (soft, hand-cut feel)
  - Photos: 16px
  - Buttons: full rounded (pill) for primary, 12px for secondary
  - Avatars: full circle

Shadows (subtle, warm-tinted — never grey):
  --shadow-soft:  0 1px 2px rgba(58, 38, 30, 0.04), 0 4px 16px rgba(58, 38, 30, 0.04)
  --shadow-lift:  0 2px 4px rgba(58, 38, 30, 0.05), 0 12px 32px rgba(58, 38, 30, 0.06)
  No hard drop shadows. No neon glows.

Motion:
  - Default ease: cubic-bezier(0.22, 0.61, 0.36, 1) — slow-out, organic
  - Default duration: 280–420ms (slower than typical SaaS)
  - Page transitions: fade + 8px lift, never slide-and-bounce
  - Photo reveals: blur-up 400ms, then 1.02 → 1.0 settle
  - AI generation loader: a quietly breathing dot trio + soft progress wash, NOT a spinner
  - Tap feedback: scale to 0.97 with 120ms snap-back

Iconography:
  - lucide-react thin (1.5px stroke), rounded line-caps
  - Replace generic icons with editorial alternatives where it fits:
    + the camera icon is a soft aperture, not a DSLR
    + the heart icon is hand-drawn-style (use a custom inline SVG)
    + use Japanese-style ornaments sparingly (a small 〜 divider, a faint ❀ for empty states)
```

---

## 2. ナビゲーション & グローバルレイアウト指示

```
GLOBAL LAYOUT
- Mobile-first. Design max-width 430px (iPhone 15 Pro Max).
- Tablet/desktop: center the column at 480px max, leave large warm-canvas margins.
  Do NOT stretch UI to fill desktop. Hana feels like an intimate object you hold.
- Persistent bottom tab bar with 3 destinations only:
    1. ホーム (Home) — icon: small house with rounded eaves
    2. アルバム (Album / Timeline) — icon: stacked rectangles
    3. せってい (Settings) — icon: minimal sliders
  No "discover", no "social", no notification bell with red dot.
- A floating central + button OVERLAPS the tab bar — pill-shaped, sakura accent,
  with serif "きろくする" label inside on first 3 sessions, then icon-only.
- Status bar area: warm bg-canvas, no white sliver.
- Safe-area insets respected (pb-[env(safe-area-inset-bottom)]).
```

---

## 3. コピーライティング規約（v0 にコピーを生成させるとき）

```
COPY RULES
- All copy in Japanese. Hiragana-heavy for warmth.
  Use kanji for nouns, hiragana for verbs and emotional connective tissue.
- Sentences end softly: 〜ました / 〜でしょうか / 〜ですね.
  Never imperative (〜してください, 〜しなさい).
- Forbidden phrases (these BREAK the brand):
    × 「○日間記録していません」
    × 「ストリークが切れました」
    × 「今すぐ記録しないと忘れてしまいます」
    × 「完璧な育児日記を」
    × 「みんなが投稿しています」
    × any emoji 🌸✨💖 — they cheapen it. Use SVG ornaments instead.
- Approved phrases (use these in mockups):
    ✓ 「今日も、おかえりなさい」
    ✓ 「○○ちゃんの今日が、ここに残りました」
    ✓ 「いつでも、戻ってきてください」
    ✓ 「1年前の今日の○○ちゃん」
    ✓ 「生後 4ヶ月と 7日」  (NEVER "127日" — too clinical)
- Names in copy: always use 「○○ちゃん」 placeholder, never English "your child".
```

---

## 4. アクセシビリティ & 実装品質バー

```
QUALITY BAR (this is a paid product — these are non-negotiable)
- All interactive elements: min 44×44pt hit area
- Contrast: body text >= 7:1 (we read in dim light)
- Focus rings: 2px sakura outline, 4px offset — visible but not jarring
- Every image: meaningful alt text in Japanese
- Reduced-motion: respect prefers-reduced-motion (kill blur-ups, keep fades)
- Dark mode: design tokens defined, but ship light first. Dark mode is "warm midnight"
  (bg #1C1816, ink #F3EBE0, accent unchanged) — NEVER true black + neon.
- Skeleton states for every async surface, in warm tone (not the typical grey)
- Empty states are emotional, not utility:
    timeline empty → "○○ちゃんとの最初のページ、ひらきましょう"
    (not "No memories yet")
- Error states: never red. Use warning-amber + soft serif copy.
    "うまく いきませんでした。もういちど、ためしてみますか？"
```

---

## 5. 画面別プロンプト（1つずつ v0 に送る）

### 5.1 オンボーディング（4 ステップ）

```
Design the onboarding flow for Hana. 4 full-screen steps, swipeable, with a
slim progress strip at the top (4 hairline segments, sakura-fills as you advance).

STEP 1 — Welcome
  Centered serif headline split into 2 lines:
    "子どもとの今日が、"
    "10年後の宝物になる。"
  Beneath: 14px sans subline "AIが、あなたの育児日記をそっと書きます。"
  Bottom: full-width pill button "はじめる" in sakura.
  Background: bg-canvas. A single, almost-imperceptible photographic still life
  in the upper third (a baby's hand on a parent's finger, sepia-washed, 60% opacity).
  No logo flex. The product name "Hana" appears once, small, top-left, serif.

STEP 2 — Child name + birthdate
  Header: "お子さんのこと、おしえてください"
  Two large input fields, serif placeholder text:
    1. なまえ (e.g., placeholder "はると")
    2. うまれたひ (native date picker, styled warm)
  No avatar upload required here (optional, after).
  Helper text under birthdate: tiny, italic-serif,
    "あとから かえられます"
  Bottom button: "つぎへ"

STEP 3 — The first photo
  Header: "○○ちゃんの 1まいめ を えらびましょう"
  (where ○○ is interpolated from step 2)
  Large dotted-border drop zone (rounded 20px), centered serif copy inside:
    "タップして、しゃしんを ひらく"
  Below: small reassuring line: "あとから いつでも かえられます"
  Skip link bottom-right: "あとで えらぶ"

STEP 4 — The first generation (the magic moment)
  Show a real-looking generated memory card preview WITH the user's child name
  filled in. The card includes:
    - The selected photo (full-bleed, rounded 16, 4:5 aspect)
    - Title in serif: "はじめての ページ"
    - Body (serif, 1.85 leading, 3 lines): a warm sample story
    - Meta strip: "2026.05.20 ・ 生後 4ヶ月と 7日 ・ はれ"
  Below the card, a single CTA: "このページを ひらく"
  Tapping it transitions (slow fade + slight lift) into Home with the memory saved.
  This screen MUST feel like opening a gift.
```

### 5.2 ホーム画面

```
Design the Home screen for Hana.

LAYOUT (top to bottom):
1. Top bar (no logo, no shadow): warm canvas bg, left side small serif greeting
   that changes by time of day:
     06–11: "おはようございます"
     11–17: "こんにちは"
     17–22: "こんばんは"
     22–06: "おかえりなさい"
   Right side: child avatar (40px circle, soft 2px ivory ring), tappable to switch
   children (no badge, no count).

2. Hero card — "today's invitation":
   Soft elevated card (bg-elevated, shadow-soft, 20px radius, p-24).
   Headline serif 20px: "今日の ○○ちゃんを、のこしませんか"
   Small body sans 14px ink-secondary: "しゃしん 1まいから、30びょうで かんりょうします"
   Right-aligned subtle arrow → in sakura.
   The entire card is tappable, with a 0.97 press scale.
   IMPORTANT: do not show "you haven't recorded today" or any guilt language.

3. "1年前の今日" card (only renders if data exists):
   Same card size as hero but with bg-warm.
   Top label, meta 12px uppercase tracking: "1ねんまえの きょう"
   Then the photo (square, rounded 14, 60% width left-aligned), with the title +
   first line of the body to the right in serif.
   Tappable to open that memory detail.
   If no data: don't render. Don't show a "your first memory will appear here" placeholder.

4. "最近の ページ" section:
   Section label meta 12px: "さいきんの ページ"
   Horizontal scroll of up to 5 memory thumbnails (4:5 ratio, 140px wide,
   rounded 14, with the title in serif 14px BELOW the photo — no overlay).
   Last item is "もっとみる →" tile in bg-warm, leading to the album.

5. "今月の あゆみ" stat strip:
   Single horizontal row of 3 micro-stats, each centered, hairline separator.
     - "5ページ"  (label below: ことしの 5月)
     - "生後 4ヶ月と 12日"  (label: ○○ちゃん)
     - "62日"  (label: いっしょに すごした)
   Numbers in Inter light tabular-nums; labels in sans 12px ink-tertiary.

6. Bottom tab bar + floating + button (as defined globally).

Empty state (no memories yet):
  Replace sections 3 and 4 with a single centered illustration (a faint
  hand-drawn open book in hairline color, 120px) and copy:
    "○○ちゃんとの 1まいめを、ひらきましょう"
  + sakura pill button "はじめての ページを つくる"
```

### 5.3 写真選択 → AI 生成 → 確認フロー（3画面、シームレスに繋がる）

```
This is the heart of the product. Design these 3 screens as ONE continuous experience.

──── SCREEN A: PHOTO PICKER ────
- Full-screen sheet rising from the bottom (Drawer pattern).
- Header: small drag-handle, centered serif 18px "しゃしんを えらぶ", right "とじる" text button.
- Native-feel photo grid (3 columns, 2px gap, rounded 4px each).
- Selected photos: 2px sakura ring + soft tick badge bottom-right (custom, not generic).
- Up to 5 photos, selection order shown as small serif numerals (①②③) overlaid top-left.
- Sticky bottom bar: "○まいで すすむ" pill button (sakura), disabled state in hairline.
- Tapping advances to Screen B.

──── SCREEN B: AI GENERATION (the magic) ────
- Full screen, bg-canvas.
- Top: selected photos shown as a soft horizontal stack (slight rotation -2°/+1°/-1°,
  overlapping like printed photos on a table). Hero photo dominant, centered, 280px wide.
- Below the stack, centered serif 18px:
    "○○ちゃんの ページを、つくっています"
- Beneath that, a "breathing dots" loader: 3 sakura dots, each scaling 0.6 → 1.0
  on a staggered 1.2s loop. NO percentage, NO progress bar number.
- Optional small reassuring rotating line beneath (4s cycle):
    "しゃしんを よんでいます…"
    "ことばを えらんでいます…"
    "ページを ととのえています…"
- Background: a very subtle radial warm wash slowly pulses (8s breathing cycle,
  amplitude 4% — barely perceptible).
- No cancel button visible (would break the spell). If user taps back, native gesture works.
- After 5–8s, transition (slow cross-fade 500ms) to Screen C.

──── SCREEN C: CONFIRM & EDIT ────
- The generated memory card, hero-treatment, on bg-canvas.
- Top: a single back chevron + small serif "ページを ととのえる".
- Card (bg-elevated, shadow-lift, 20px radius):
    1. Photo (or photo stack with dots indicator if >1), 4:5 ratio, rounded 16, full card width.
    2. Title (serif 22px, tappable to inline-edit, with a tiny pencil glyph appearing
       only on hover/focus — not always visible).
    3. Body (serif 16px, 1.85 leading, tap to enter a soft textarea editor
       that grows naturally; no modal).
    4. Meta strip (sans 12px): "2026.05.20 ・ 生後 4ヶ月と 7日 ・ はれ ❀"
       Each meta chip is tappable to edit (date picker, weather picker as bottom sheet).
- Below the card, two actions side by side:
    Left (ghost button, ink-secondary): "もういちど つくる"  (regenerate, max 3 times)
    Right (full pill, sakura): "このまま のこす"
- Below those, a tiny meta line: "いつでも あとから かえられます"
- Do NOT label anything as "AI generated". The text is the parent's text now.
- Save tap → soft confetti is FORBIDDEN. Instead: card lifts up and away
  (translateY -100%, fade 400ms), revealing a quiet success screen for 1.5s:
    centered serif "○○ちゃんの きょうが、のこりました" + tiny "ホームに もどる" sub-link.
```

### 5.4 タイムライン (アルバム) 画面

```
Design the Album / Timeline screen.

- Top bar: serif 20px "○○ちゃんの アルバム", right: small filter glyph
  (tap → bottom sheet with "ぜんぶ / おきにいり" toggle only — no complex filters in MVP).
- Below top bar: a single warm summary line, sans 13px ink-tertiary:
    "ぜんぶで 47ページ ・ いちばん ふるい ページは 2025.08.02"

- Content: month sections in reverse chronological order.
  Each section header:
    Sticky as you scroll. bg-canvas with bottom hairline.
    Layout: serif 18px "2026年 5月" left, sans 12px ink-tertiary "8ページ" right.

- Memory list inside each month: a 2-column masonry grid with 12px gaps.
  Each card:
    - Photo (rounded 14, varying aspect: 4:5 or 1:1 to create rhythm)
    - Beneath the photo (NOT overlay): serif 15px title (1 line, ellipsis ok),
      sans 11px meta "05.20 ・ 生後 4ヶ月と 7日"
    - Tap → memory detail (slow zoom-in transition where the tapped photo
      becomes the hero of the next screen, shared-element style).
  Favorites get a tiny hand-drawn heart glyph in the top-right of the photo.

- Scroll behavior: when user crosses into a new month, the sticky header
  cross-fades. No bouncy haptic.

- Empty month gaps: do NOT show them. Skip silently to the next month with data.
  The brand promise is "we don't shame the gaps".

- Pull-to-refresh: warm spinner (a small ❀ that gently rotates, not the iOS default).
```

### 5.5 記録詳細画面（"the cry-worthy moment"）

```
Design the Memory Detail screen — the "see it years later and tear up" screen.

- Layout is a vertical scroll, full-bleed photo at the top, story beneath.
- Top overlay: only a small back chevron in a translucent warm-ivory pill, top-left.
  No other chrome over the photo.
- Hero photo: full viewport width, 4:5 aspect, rounded only at the bottom corners (24px).
  If multiple photos: horizontal swipe with thin sakura dot indicators centered below.
- Just below the photo:
    Meta strip in sans 12px uppercase ink-tertiary tracking +0.08em:
      "2026.05.20 ・ 生後 4ヶ月と 7日 ・ はれ"
- Title: serif 26px weight 500, generous spacing.
- Body: serif 17px, line-height 1.95 (yes, 1.95 — bookish), max-width that gives
  comfortable measure (~36 chars per line in Japanese).
- Below the body, a single tender line: "○○ちゃん、生後 4ヶ月と 7日"
  centered, serif italic 14px ink-secondary, with a hairline above and below it.
- At the very bottom, a row of 3 quiet glyph buttons:
    ❀ おきにいり (heart toggle — fills sakura)
    ✎ ことばを なおす (edit)
    ⋯ そのほか (delete moves to trash with 7-day recovery — never instant)
  These buttons are sans 12px labels under thin-stroke glyphs, evenly spaced, with
  generous padding above. They are gentle. Not a sticky action bar.

- "次の ページ / 前の ページ" navigation: not arrows. Use a soft drag-up gesture
  affordance: a small "↓ つぎの ページ" hint appears after 3s of dwell.

- ABSOLUTELY DO NOT include: like counts, view counts, share-to-Instagram buttons,
  comment counts, "AI generated" badges.
```

### 5.6 月別ふりかえり画面

```
Design the Monthly Recap screen — opens automatically on the 1st of each month
(with permission) or from a "今月の あゆみ" tap in Home.

- Treat this like a beautifully designed magazine spread.
- Top: large serif 32px "2026年 4月", beneath it sans 12px ink-tertiary:
    "○○ちゃんの 1ヶ月"
- Hero collage: a non-grid, slightly-rotated photo arrangement of the month's
  3–5 favorites. Hand-laid feel, like sticking polaroids in a scrapbook.
- Below the collage, an AI-generated 2-paragraph summary (serif 16px, 1.85 leading):
    Paragraph 1: notable moments
    Paragraph 2: a tender forward-looking line
  No "AI summary" label.
- A stats strip below (Inter light tabular numerals):
    "8ページ" / "16まいの しゃしん" / "おきにいり 3"
- Then a grid of every memory from the month (3 columns, square thumbs).
- Bottom CTA: a quiet outlined button in serif:
    "この 1ヶ月を、ほんに する"
  (links to photobook flow — premium upsell, but framed as an offer, never a paywall).

- Make this screen the most beautiful in the app. It's the one users will screenshot
  and (privately) share. Viral organically, never socially.
```

### 5.7 ペイウォール / プレミアム紹介

```
Design the Premium screen — Hana Plus.

This screen MUST NOT feel like a paywall. It feels like an invitation to a deeper
relationship with the app.

- Top: a single, large serif headline:
    "Hana を、ずっと そばに。"
  Sub: sans 14px ink-secondary, max 2 lines:
    "ページの かずも、AIの ちからも、おもいでの ふかさも、
    かぎりなく。"

- Below: 3 feature rows (NOT a comparison table — too cold):
  Each row: a thin-line illustration on the left (60px), serif heading + small body on the right.
    1. "ページを かぎりなく のこす"
       いま 30ページまで → むげんに のこせます
    2. "AIに いつでも たよれる"
       げつ 20かい → なんかいでも
    3. "1年まえの きょう"
       かこと いまを、いつでも つなげます

- Pricing card (bg-warm, rounded 20, p-20):
  Two options side-by-side (toggleable):
    [ つきごと ¥480 ]   [ 1ねん ¥3,800  おとく ]
  The yearly option has a small ❀ "おとく" ribbon in sakura.
  Beneath: tiny sans 11px:
    "いつでも やめられます"
- Single full-width pill CTA: "Hana Plus を はじめる"
- Below CTA: ghost links sans 13px ink-tertiary:
    "りようきやく" ・ "プライバシー" ・ "ふっかつ"

- ABSOLUTELY DO NOT:
  × Show a strikethrough on free features
  × Use "今だけ!" / "残り○名" urgency
  × Show competitor comparison
  × Auto-trigger this when user has 28/30 memories (no "you're almost full!" anxiety)
  × Place this in the main tab bar
```

### 5.8 ランディングページ (LP) — Web、課金につなげる

```
Design the marketing landing page for Hana at hana.app.

This is a desktop-first Next.js page. Same design language as the app, but with
editorial breathing room. Think Studio Ghibli meets Apple product page, in Japanese.

HERO (above the fold):
- Left 55%: serif 64px (mobile 36px) headline, 2 lines:
    "子どもとの きょうが、"
    "10ねんごの たからものに なる。"
  Beneath: serif 20px, 2 lines max:
    "しゃしんを 1まい えらぶだけ。
    AIが、あなたの ことばで きろくを のこします。"
  CTAs (row): primary sakura pill "ダウンロード" + ghost "デモを みる"
  Below CTAs: tiny sans 12px row of trust signals:
    "App Store・Google Play" / "プライバシー ファースト" / "なまえや 写真は AIの 学習に つかいません"

- Right 45%: a single iPhone mockup (frameless, soft shadow), showing the Memory
  Detail screen. Slowly floating animation (translateY ±8px, 6s cycle).
  Behind it, a very faint warm radial wash.

SECTION 2 — The transformation (Before / After):
  Centered serif 36px "しゃしんを、きおくに かえる。"
  Side-by-side comparison card:
    LEFT: "しゃしん だけ" — just the photo, with the EXIF date in cold sans
    RIGHT: "Hana で のこすと" — same photo + serif title + body story + warm meta
  A subtle arrow "→" between them in sakura.

SECTION 3 — How it works (3 steps with thin-line illustrations):
  1. しゃしんを えらぶ (10びょう)
  2. AIが ぶんしょうを つくる (5〜8びょう)
  3. たしかめて、のこす (15びょう)
  Beneath: serif 18px "ぜんぶ あわせて、30びょう。"

SECTION 4 — Why it's different (a quiet manifesto):
  Single column, max-width 640px, serif 18px, 1.95 leading.
  Title: "Hana が、しないこと。"
  Bulleted (with hairline ・ dividers, no checkmarks):
    ・ ストリークで せかしません
    ・ SNSのように みんなに みせません
    ・ なまえや しゃしんを AIの 学習に つかいません
    ・ こうこくを ひょうじしません

SECTION 5 — Testimonials (post-launch, 3 cards):
  Each card: a quote in serif italic, beneath: small avatar + name "さくら さん・はると(0)"
  No 5-star ratings. Just words.

SECTION 6 — Pricing:
  Same as in-app premium screen, simplified.

FINAL CTA:
  Full-width warm strip (bg-warm). Centered serif 32px:
    "きょうの ○○ちゃんを、はじめの 1ページに。"
  Single sakura pill CTA.

FOOTER:
  Minimal. Warm hairline above. Three columns: ABOUT / LEGAL / SUPPORT.
  Tiny serif "Hana" wordmark left, small ❀ glyph beside it.
```

### 5.9 スプラッシュ / 起動時画面

```
Design the Splash / cold-start screen.

- Full screen bg-canvas. No spinner.
- Centered: serif 36px wordmark "Hana", with a small hand-drawn ❀ glyph (12px)
  resting just above the H, like a flower placed on a journal.
- Beneath, a barely-visible serif 13px ink-tertiary tagline:
    "きょうを、たからものに。"
- A faint warm radial wash slowly breathes (8s cycle, 4% amplitude).
- The whole screen fades out (500ms) once the app is ready.
- If session restore fails, transition to Auth Hub (5.10). If session valid, transition to Home.
- No version number, no "Powered by", no loading percentage.
```

### 5.10 認証ハブ（ログイン入口）

```
Design the Authentication Hub — the first screen unauthenticated users see.

- Top 40% of screen: a single editorial image — the back of a parent holding a
  small child, late-afternoon light, slightly grainy, sepia-warm tones.
  Soft fade to bg-canvas at the bottom edge (linear-gradient overlay).
- Below image: serif 28px (2 lines):
    "きょうの ○○ちゃんを、"
    "10ねんごの たからものに。"
- Below headline: sans 14px ink-secondary, 2 lines:
    "Hana は、しゃしんを ものがたりに かえる
    あなただけの きおくちょうです。"
- Auth buttons (stacked, full-width, 16px gap, in this exact order):
    1. "Apple で つづける"  — bg ink-primary, white serif label, Apple logo SVG left
    2. "Google で つづける" — bg-elevated, ink-primary serif label, Google G left, hairline border
    3. "メールアドレスで つづける" — ghost button, ink-secondary serif label
- Tiny footer (sans 11px ink-tertiary, centered):
    "つづけることで「りようきやく」と「プライバシーポリシー」に
    どういしたものと みなされます"
  with the two terms as underlined tap targets opening 5.22.
- ABSOLUTELY DO NOT:
  × Show a sign-up vs sign-in toggle. Hana auto-creates accounts on first login.
  × Show "or" dividers between providers. The order is the hierarchy.
  × Use Material's filled blue Google button. Use restrained outlined version.
```

### 5.11 メール登録 / サインイン（統合フロー）

```
Design the email auth flow. ONE screen for both new and returning users —
no signup/login mode toggle. The backend decides which path based on the email.

- Top: small back chevron + serif 18px "メールで つづける".
- Below: serif 24px headline:
    "メールアドレスを おしえてください"
- Single email field (large, 56px tall, rounded 12, hairline border that
  thickens to sakura on focus). Placeholder: "you@example.com" in sans.
- Helper line beneath in sans 12px ink-tertiary:
    "とどいた メールの リンクで、ログインします"
- Full-width pill CTA "メールを おくる" (sakura, disabled until valid email).
- After tap: button morphs into a sent-confirmation state (slow 400ms):
    A serif 18px message replaces the input area:
      "○○ に、リンクを おくりました"
      "メールを ひらいて、おしえてください"
    + a "メールアプリを ひらく" outlined button (deep-link to mail.app)
    + a small text link "べつの アドレスで やりなおす" (resets state).
- Magic-link approach only — no password field, no captcha visible.
- ABSOLUTELY DO NOT:
  × Show "sign up" or "sign in" tabs
  × Show a password field
  × Show "remember me" checkbox
```

### 5.12 メール確認（マジックリンク着地ページ）

```
Design the magic-link landing screen — opens when the user taps the link in their email.

- Full screen bg-canvas, centered content.
- A quietly breathing ❀ glyph (32px, sakura, 2s gentle scale 0.95↔1.0).
- Serif 22px: "ログインを かくにん しています"
- Tiny sans 12px ink-tertiary beneath: "もうすこしです"
- On success (1–3s): cross-fade to an empathic welcome screen:
    Serif 28px: "おかえりなさい" (returning user) OR "はじめまして、Hana です" (new user)
    Sub: "○○ちゃんとの ページに ごあんない します"
    Then auto-advance to Home (returning) or Onboarding step 2 (new) after 1.5s.
- On failure (expired link / wrong device):
    Serif 22px: "リンクの ゆうこうきげんが きれています"
    Sub serif 14px: "もういちど、メールを おくりなおしましょう"
    CTA: "メールを おくりなおす" (returns to 5.11)
- Never show raw error codes. Never show "401 Unauthorized".
```

### 5.13 権限リクエスト画面（写真 / 通知 / AI同意）

```
Design 3 permission request screens that share the same template — gentle,
opt-in, never coerce.

SHARED TEMPLATE:
- Top 30% bg-warm wash.
- Centered hand-drawn thin-line illustration (60px) at the top of the wash.
- Below the wash: serif 24px headline (2 lines max).
- Body: serif 16px, 1.85 leading, max 3 lines of warm explanation in ink-secondary.
- Two stacked buttons:
    Primary (sakura pill): "ゆるす" — triggers native permission prompt
    Ghost (ink-tertiary): "あとで" — proceeds without
- A tiny final line in sans 12px ink-tertiary:
    "せっていから いつでも かえられます"

A. WRITE PHOTO LIBRARY ACCESS (read-only, no add-to-album):
   Illustration: a faint photo frame
   Headline: "しゃしんを えらべるように、します"
   Body: "Hana は えらばれた しゃしんしか みません。アルバム ぜんたいを
         よみません。"

B. NOTIFICATION ACCESS:
   Illustration: a soft bell
   Headline: "1ねんまえの きょうを、おしらせします"
   Body: "せかしません。げつに 2〜3かいだけ、しずかに とどけます。"

C. AI USAGE CONSENT (CRITICAL — first time before AI generation):
   Illustration: a small open book
   Headline: "あなたの しゃしんを、ことばに します"
   Body: "Hana は、しゃしんを そとの AI に いちじてきに おくり、
         ぶんしょうを つくります。なまえや たんじょうびは おくりません。
         がくしゅうにも つかいません。"
   Below body: a small expandable "くわしく しる" link to a sheet showing:
     - 送信先: Anthropic (Claude API)
     - 保持期間: 0日 (zero data retention)
     - 学習利用: なし
   Primary CTA label changes here: "どういして、つくる"
   Ghost: "AI を つかわない" (the parent can still write manually)
```

### 5.14 設定画面（インデックス）

```
Design the Settings index — the せってい tab destination.

- Top bar: serif 22px "せってい", no back button (it's a root tab).
- Below: a soft "you" card (bg-elevated, rounded 20, p-20):
    Left: parent avatar (56px circle, ivory ring).
    Right: serif 18px parent name (e.g., "さくらさん"), beneath sans 12px ink-tertiary:
      "Hana Plus に かにゅうちゅう"  /  "むりょうプラン"
    Right-aligned chevron → opens 5.15 (Account).
- Section groups (each group is a card-like cluster on bg-elevated, rounded 20,
  with rows separated by 1px hairlines). Group header is meta 12px uppercase
  tracking +0.08em, ink-tertiary, 12px above the card. No icons in rows — text only,
  with a small chevron → on the right.

  GROUP 1: お子さんのこと
    - "プロフィール"            → 5.16 (Child profile)
    - "きょうだいを ふやす"     → premium upsell or 5.16 if Plus
    - "かぞくと わかちあう"     → 5.18 (Family share)

  GROUP 2: アプリのこと
    - "おしらせ"                → 5.19 (Notifications)
    - "プライバシーと データ"  → 5.20 (Privacy & Data)
    - "Hana Plus"              → 5.7 (Premium) — shows current plan if subscribed

  GROUP 3: そのほか
    - "ヘルプと もんあい"      → 5.22 (Help)
    - "りようきやく"            → 5.23 (Legal viewer)
    - "プライバシーポリシー"    → 5.23
    - "このアプリについて"      → version, build, credits

- At the very bottom (24px above the tab bar), a small ghost text button:
    "ログアウト"  (serif 14px ink-secondary)
  Tap → confirmation Dialog: "ログアウトしますか？データは けされません。"
  Buttons: "キャンセル" / "ログアウト".

- ABSOLUTELY DO NOT:
  × Show "Pro / Upgrade" red badges
  × Show emoji icons next to rows (✨🔔🔒)
  × Show a giant "DELETE ACCOUNT" red button at the top
```

### 5.15 アカウント（親のプロフィール）

```
Design the Account screen (parent's own profile).

- Top: back chevron + serif 20px "アカウント".
- Hero block centered:
    Avatar (96px circle, ivory 3px ring) with a tiny ✎ pencil glyph in a small
    pill bottom-right (tap to change photo).
    Below: serif 22px name (tap to inline-edit).
    Below name: sans 13px ink-tertiary "kz0508@gmail.com" (tap to change — opens
    5.11 with current email pre-filled).
- A single hairline divider, then a clean text list (no cards, no icons):
    "ログインほうほう"          → "Apple"  (read-only chip)
    "ことば"                    → "にほんご"  → opens language picker (en/ja for v1+)
    "じこく"                    → "Asia/Tokyo"
- Beneath the list, a generous 48px spacer, then a single quiet text link:
    "アカウントを けす"  (serif 14px in warning-amber, centered, underlined)
    → opens 5.24 (Account deletion flow).
- No save button — changes commit on blur or selection.
```

### 5.16 お子さんプロフィール管理

```
Design the Child Profile screen (manage one or more children).

- Top: back chevron + serif 20px "お子さんのこと".
- For each child, a "child card" (bg-elevated, rounded 20, p-20, vertical stack):
    Avatar (72px) centered top.
    Serif 22px name centered.
    Sans 13px ink-tertiary: "生後 4ヶ月と 7日 ・ うまれた 2026.01.13"
    A row of 2 ghost text buttons centered: "なまえを なおす" / "しゃしんを かえる"
  Multiple children: cards stack vertically with 16px gaps.

- Below the cards, an outlined CTA (full width, 12px radius, serif label):
    "きょうだいを ふやす"
  - If user is on free plan: tapping shows a soft inline message (NOT a paywall popup):
      "きょうだいの ページは、Hana Plus で ひらけます"
      + a small "Hana Plus を みる" inline link → 5.7.
  - If Plus: opens a sheet to create a new child (name + birthdate + optional photo).

- At the bottom, a tiny destructive option appears only after expanding a "詳細"
  toggle (so it's never accidentally tapped):
    "○○ちゃんの ページを ぜんぶ けす"
  → opens a careful confirmation flow with typed-name confirmation.
```

### 5.17 おしらせ設定（通知）

```
Design the Notifications settings screen.

- Top: back chevron + serif 20px "おしらせ".
- Intro paragraph (serif 14px ink-secondary, 2 lines, p-16):
    "せかすことは しません。Hana が おしらせするのは、
    しずかに もどってきたい とき だけです。"

- A list of toggles (Switch component, sakura when on). Each row:
  Left: serif 16px label + sans 12px ink-tertiary helper line beneath.
  Right: Switch.

  ・ "1ねんまえの きょう"
    "かこと いまを、つなぐ おしらせ。げつに 2〜3かい。"
  ・ "つきまつの ふりかえり"
    "1ヶげつぶんを まとめて おとどけ。げつに 1かい。"
  ・ "なつかしい ページ"
    "ふと、よみかえしたく なるもの。"

- A second section below a hairline:
    "おしらせの じかんたい"
    A horizontal time picker pill (2 chips side by side):
      [ 09:00 ] - [ 21:00 ]
    Helper beneath: "この じかんがいには、おしらせしません"

- If OS permission is denied: show a soft banner at the top:
    bg-warm, p-16, serif 14px:
      "ただいま、おしらせを ゆるしていません。"
    + ghost button "せっていを ひらく" (deeplink to iOS Settings).
```

### 5.18 かぞくと わかちあう（招待・送信側）

```
Design the Family Sharing screen — for sending invites.

- Top: back chevron + serif 20px "かぞくと わかちあう".
- Hero block (bg-warm, rounded 20, p-24, centered):
    Thin-line illustration (a small open book passed between two hands, 80px).
    Serif 20px: "○○ちゃんの ページを、ともに ひらきましょう"
    Sans 13px ink-secondary, max 2 lines:
      "とうろくした かぞくは、ページを よむことが できます。
      しゃしんを じぶんで ほぞんすることは できません。"

- Invite section:
    Single email field (rounded 12, hairline, serif placeholder "you@example.com").
    Beneath, a "けんげん" segmented control (2 segments only):
      [ よむだけ ]   [ かきこめる ]
    Default: よむだけ. Help text beneath the control in sans 11px ink-tertiary
    explains each option in 1 line.
    Full-width pill CTA: "しょうたいを おくる" (sakura).

- Member list (rendered below if any):
    Section header meta 12px: "わかちあっている かぞく ・ 2 / 5"
    Each member row (no card, just a hairline-separated list):
      Avatar 40 + serif 15 name + sans 12 ink-tertiary role chip + ⋯ menu.
      Menu: "けんげんを かえる" / "わかちあいを やめる"
    If on free plan, the limit is "1 / 1" and beneath the list:
      Soft inline message + "Hana Plus で ふやす" inline link.

- Pending invites section:
    Each pending row in muted style with a small "おくりなおす" / "とりけす" pair.
```

### 5.19 かぞく招待 受け取り側

```
Design the Family Invite Acceptance screen — what an invited family member sees.

- This screen opens from a magic link in the email. Full-bleed, ceremonial.
- Top: small ❀ glyph centered.
- Serif 28px (centered, 2 lines):
    "さくらさんから、"
    "はるとくんの ページに しょうたい されました"
- Below: a soft preview card (bg-elevated, rounded 20, p-20):
    A blurred-but-warm sample memory thumb (so they get a taste).
    Beneath: serif 14px italic 1.95 leading — a single short generated body example.
  This preview WHISPERS the value. It should make the recipient feel honored.
- Body explanation (serif 14px ink-secondary, max 3 lines):
    "あなたは「よむだけ」けんげんで しょうたい されています。
    Hana を つかいはじめて、いっしょに ページを ひらきましょう。"
- Two stacked CTAs:
    Primary pill (sakura): "しょうたいを うけとる"
    Ghost: "あとで きめる"
- Tiny footer: "Hana を まだ つかっていない ばあいは、
  さきに アプリを ダウンロードします" + App Store / Google Play badges.
```

### 5.20 プライバシーと データ

```
Design the Privacy & Data settings screen — this is the screen that earns paid trust.

- Top: back chevron + serif 20px "プライバシーと データ".
- Section: "AI に おくる データ" (group card):
    Toggle row: "AI で ぶんしょうを つくる"
      Helper: "オフに すると、しゅどうで かきます"
    Read-only info rows (no toggles, no chevrons):
      "送信先" : "Anthropic (Claude)"
      "保持期間": "0にち (zero data retention)"
      "学習利用": "なし"
      "EXIF":   "そうしんまえに じどうで さくじょ"
    Tiny ghost link beneath: "もっと しる" → opens an in-app sheet with the full policy.

- Section: "わたしの データ":
    Row "データを ダウンロードする"
      Chevron → triggers a backend export job; shows a soft inline state
      "じゅんびちゅう (とどくのは 24じかんいない)" with progress dot trio.
    Row "ぜんぶの データを けす"
      Chevron → opens 5.24 (Account deletion flow). Label in warning-amber.

- Section: "ろぐと しゅうけい":
    Toggle: "けんめい アクセス ろぐを とる"  (default ON; turn off only if user wants)
    Helper: "あんぜんの ため、ログイン じこくと きしゅめい だけを のこします"
    Toggle: "アプリの ようすを Hana に おくる" (anonymized usage stats)
    Helper: "なまえや しゃしんは おくられません"

- ABSOLUTELY DO NOT:
  × Bury the AI consent toggle behind a tab
  × Use a green "secure" badge or padlock icon
  × Show "Your data is safe with us!" marketing copy
```

### 5.21 サブスクリプション管理

```
Design the Subscription Management screen (only reachable when user has Hana Plus).

- Top: back chevron + serif 20px "Hana Plus".
- Hero card (bg-warm, rounded 20, p-24):
    Tiny meta uppercase: "げんざいの プラン"
    Serif 24px: "Hana Plus ・ 1ねん"
    Sans 13px ink-tertiary: "つぎの ごこうしんは 2027.05.20"
    Beneath, a single horizontal hairline.
    Two read-only rows:
      "ねんかんりょう"    "¥3,800"
      "おしはらい"         "Apple ID"

- Section: "プランを かえる" (only show if plan changes are possible):
    Two outlined option cards:
      "つきごと ¥480 に かえる"
      "1ねん ¥3,800 を つづける"  ← marked as current (sakura ring + small ❀)

- Section: "そのほか":
    Row "Apple ID で かんり" → deep-link to iOS Settings > Subscriptions
    Row "りょうしゅうしょ"   → in-app receipt list
    Row "おとくな コードを つかう" → small input field expands inline

- At the bottom, a tender text link:
    "かいやくを かんがえる"
    serif 14px ink-tertiary, centered, underlined.
    Tap → 5.22 (Cancellation flow).

- ABSOLUTELY DO NOT:
  × Show "Are you sure?? You'll LOSE memories!!" panic copy
  × Show a comparison of what they'll "lose"
```

### 5.22 解約フロー

```
Design the Cancellation Flow — gentle, never guilt-trippy.

3 steps. Each is a full screen, swipe-back enabled at every step.

STEP 1 — Listen
  Serif 24px: "なにか、よくなかった ところは ありましたか"
  Sub: serif 14px: "おしえて くださると、たすかります"
  A list of soft-radio options (large, tappable, serif labels):
    ・ ねだんが あわなかった
    ・ つかわなかった
    ・ もとめていた きのうが なかった
    ・ アプリの ちょうしが よくなかった
    ・ そのほか
  Selecting one expands an optional small textarea.
  Bottom: ghost "スキップする" + pill primary "つぎへ".

STEP 2 — Offer (only if reason suggests price/usage):
  Serif 22px: "もし よければ、1ヶげつ むりょうで お つづけ できます"
  Body: tender serif 14px explaining the 1-month grace offer.
  Two stacked buttons:
    Primary: "1ヶげつ むりょうで つづける"
    Ghost: "かいやくを つづける"
  If reason was "needed feature missing": skip Step 2.

STEP 3 — Confirm
  Serif 22px: "○○ちゃんの ページは、ぜんぶ のこります"
  Body: "かいやく しても、いまの 47ページは ずっと よめます。"
  "30ページを こえる ぶんは、よむだけ できます。
  あたらしく のこすには、また Hana Plus に もどってきて ください。"
  Single quiet button: "かいやくを かくてい する" (outlined, warning-amber text).
  Below: a tiny "やっぱり やめる" ghost link.

- After confirm: a soft full-screen message for 2s:
    "いつでも、もどってきて ください ❀"
  Then route to Home.
```

### 5.23 リーガル ビューア（利用規約 / プライバシーポリシー）

```
Design the in-app Legal document viewer (Terms / Privacy / About).

- Top: back chevron + serif 18px doc title.
- Sub-header beneath: sans 11px ink-tertiary "さいしゅう こうしん 2026.05.01"
- Body: long-form serif 16px, line-height 1.85, max-width 100% with 24px side padding.
- Headings inside the doc:
    h2 serif 20px weight 500, 32px top margin.
    h3 serif 17px weight 500, 24px top margin.
  Lists use ・ bullet markers, never • or -.
- A small sticky table-of-contents button bottom-right (a thin-line ❀ glyph)
  opens a sheet with anchor links.
- Tappable inline definitions: terms like 「保持期間」 have a 1px dotted underline
  in sakura — tap shows a small popover with the plain-language meaning.
- About screen specifically:
    Top hero: serif 28px "Hana について" + sans 13px "v1.0.0 (build 1234)"
    Below: a serif paragraph on the team's intent (2–3 sentences).
    Row list: ライセンス / オープンソース / クレジット / お問い合わせ.

- ABSOLUTELY DO NOT:
  × Embed a web view that breaks back gestures
  × Use a different font family inside the document
  × Show ads or upsells inside legal copy
```

### 5.24 アカウント削除フロー

```
Design the Account Deletion Flow — slow, certain, kind.

3 steps, each a full screen. Cannot be triggered by a single tap from anywhere.

STEP 1 — Inform
  Serif 24px: "アカウントを けすと、こうなります"
  A clean text list (hairline-separated, no icons):
    ・ ぜんぶの ページが けされます
    ・ しゃしんも すべて けされます
    ・ かぞくに わかちあった ぶんも けされます
    ・ 30にちかんは、もとに もどせます
    ・ 30にちごに、ふっかつできなく なります
  At the bottom: a soft warm card (bg-warm, p-20):
    Serif 14px italic: "もし、しずかに はなれたい だけなら、ログアウトでも だいじょうぶです。"
    Inline link: "ログアウトを する"
  Bottom buttons: ghost "やめる" / outlined warning-amber "つづける".

STEP 2 — Export (always offered first)
  Serif 22px: "けすまえに、ページを てもとに のこしますか"
  Body: warm explanation of the export (ZIP including photos + memory JSON).
  Two stacked buttons:
    Primary outline: "ダウンロード してから けす"  (triggers export, then advances)
    Ghost: "そのまま けす"

STEP 3 — Confirm by typing
  Serif 22px: "「アカウントを けす」と、にゅうりょく して ください"
  Single text input (full width, hairline, serif placeholder).
  Below: a final "けす" pill button — warning-amber, NOT red. Disabled until exact match.
  Tiny line: "けすと、すぐに ログアウト します"

- After confirm: a quiet full-screen message (no celebration, no exclamation):
    Serif 22px: "おつかれさまでした。"
    Sub serif 14px ink-secondary: "30にちかんは、いつでも もどれます。"
  Auto-route to Auth Hub (5.10) after 3s.
```

### 5.25 ヘルプ & お問い合わせ

```
Design the Help & Contact screen.

- Top: back chevron + serif 20px "ヘルプ".
- Search field at the top: bg-elevated rounded 12, serif placeholder "なにを さがしますか".
- Below the search: a horizontal scroll of "よく あるしつもん" chips
  (bg-warm pills, serif 13px, ~6 chips):
    "AI ぶんしょうの こと"
    "しゃしんの こと"
    "Hana Plus"
    "かぞくと わかちあう"
    "アカウント"
    "うまく いかない とき"

- Article list (each tappable row, hairline separator):
    Serif 16px question + small sans 12px ink-tertiary helper line.
  Tap → reader screen (similar to 5.23 Legal viewer style).

- Bottom card (bg-warm, rounded 20, p-20):
    Serif 18px: "それでも こまったら"
    Sans 13px: "なまえも メールも、おしえなくて けっこうです。
    アプリの じょうたいを、わたしたちに ぱっと おしらせ できます。"
    Pill CTA: "ようすを おしらせ する"
    → opens 5.26 (Feedback).
```

### 5.26 フィードバック / お問い合わせ送信

```
Design the Feedback submission screen.

- Top: back chevron + serif 20px "ようすを おしらせ".
- Form layout (single column, 24px gaps):
  1. Soft segmented control "しゅるい":
       [ きづいた こと ]  [ うごかない ]  [ ようぼう ]
  2. Multi-line serif textarea (auto-grow, rounded 16, hairline border, p-16,
     serif placeholder "おもったままに、どうぞ"):
       Min height 160px. Max 1000 chars with subtle bottom-right counter.
  3. Toggle row: "アプリの じょうたいも おくる"
       Helper: "ばーじょん、きしゅめい、エラーログを いっしょに おくります.
       なまえや しゃしんは おくられません。"
- Sticky bottom: full-width pill "おくる" (sakura).
- After submit: a calm full-screen confirmation for 2s:
    Centered serif 22px: "とどきました。"
    Sub serif 14px: "ひとつ ひとつ、よみます。"
  Then auto-return to Help.
```

### 5.27 写真ライトボックス（フルスクリーン閲覧）

```
Design the Photo Lightbox — opens when user taps a photo in Memory Detail.

- Pitch-warm overlay: bg #1C1816 at 96% opacity (NOT pure black).
- Photo: centered, max 92% width / 88% height, rounded 12, with a hairline ivory ring.
- Top bar (auto-hides after 2s of stillness):
    Left: small "とじる" ghost button (ivory text on warm-dark).
    Right: small "ほぞん" ghost button (saves to camera roll — Hana Plus only,
    free shows soft inline notice).
- Bottom (auto-hides too):
    Centered sans 12px meta: "2026.05.20 ・ 1 / 3"
    (only shows if multi-photo memory)
- Pinch-to-zoom, double-tap-to-fit. Swipe down anywhere to dismiss (with photo
  following finger and a fade of the warm-dark backdrop).
- ABSOLUTELY DO NOT:
  × Add filters, edit tools, or stickers
  × Show share-to-social icons
  × Use pure #000 backdrop (it's harsh in dark rooms)
```

### 5.28 ページを なおす（記録の編集画面）

```
Design the Memory Edit screen — opened from "✎ ことばを なおす" in Detail.

- Top bar: "やめる" ghost left, serif 18px "ページを なおす" centered,
  "ほぞん" pill button right (sakura, disabled until a change is made).
- The editing surface mirrors the Memory Detail layout (so the user sees a
  near-WYSIWYG preview), but every text region is editable inline:
    - Title: tappable, becomes a serif 22px single-line input on focus.
    - Body: tappable, becomes a serif 17px auto-grow textarea, 1.95 leading preserved.
    - Meta chips (date, weather, age — age is derived, read-only):
        Date chip → opens a warm date picker bottom sheet.
        Weather chip → opens a 6-option weather picker (はれ / くもり / あめ /
        ゆき / かぜ / よる) as a horizontal sheet.
- A small footer bar above the keyboard (when focused on body):
    Left: "もういちど AI で つくる" ghost (only if regenerations < 3, with a
    tiny "のこり 2かい" sans 11px counter).
    Right: a serif character count "127 / 200" in ink-tertiary.

- Photo management subsection (below the text region, hairline above):
    Section header meta 12px "しゃしん"
    Horizontal scroll of current photos (square thumbs, rounded 12). Each thumb
    has a small ⋯ corner glyph → menu: "おもてに する" / "とりはずす".
    Last item: "しゃしんを たす" outlined tile (opens the picker, max 5 total).

- "やめる" with unsaved changes: shows a soft Dialog:
    "ほぞんせずに とじますか？"
    "なおした ぶんは うしなわれます"
    Buttons: "もうすこし なおす" / "とじる".
```

### 5.29 ゴミ箱 / 最近けしたもの

```
Design the Trash screen ("最近 けした ページ" — 7-day soft-delete recovery).

- Reached from Settings > プライバシーと データ > "最近 けした ページ", OR from
  a confirmation toast immediately after deleting a memory.
- Top: back chevron + serif 20px "けした ページ".
- Intro paragraph (serif 14px, p-16, bg-warm rounded 16):
    "けした ページは、7にちかんは ここに のこっています。
    そのあと、しずかに きえます。"

- List of deleted memories — same masonry-ish card style as Timeline, but each
  card has a desaturated tint (60% saturation) and a small sans 11px ink-tertiary
  countdown overlay top-right: "あと 5にち".
- Tap a card → preview Sheet with two buttons:
    Primary outline serif: "もどす"
    Ghost (warning-amber): "いま けす"  → typed confirmation, no easy tap.

- Empty state:
    Centered serif 18px ink-tertiary: "けした ページは ありません"
    Tiny ❀ glyph above.

- ABSOLUTELY DO NOT:
  × Show "32 items, 47 MB" — Hana never talks in MB
  × Show a "Empty trash" red button at the top
```

### 5.30 さがす / タグ

```
Design the Search & Tag Filter screen (v2 — but design now for completeness).

- Reached from the filter glyph in Timeline (5.4).
- Top: back chevron + serif 20px "さがす".
- Search field (full width, rounded 14, bg-elevated, hairline, serif placeholder):
    "ことばを いれて、さがす"
- Below the field, a quiet horizontal row of tag chips (bg-warm pills, serif 13px).
  Tags are AI-derived auto tags from memories. Examples: "はじめて", "おそと",
  "なつ", "おひるね", "ごはん".
  Tapping a chip applies the filter (chip becomes sakura-filled).
- Below tags, a "とき" chip row (year/month chips): "ことし", "せんげつ", etc.
- Results area: same masonry card style as Timeline (5.4).
- Empty results state:
    Centered serif 16px: "「○○」 で みつかりませんでした"
    Below: small ghost link "ぜんぶを みる" → clears filters.

- Recent searches: small section above results when search field is empty.
- Search history: stored locally, can be cleared with a small ghost text link.

- ABSOLUTELY DO NOT:
  × Show "Top searches" or "Trending tags" (no social comparison)
```

### 5.31 お子さんスイッチャー（複数子ども切替）

```
Design the Child Switcher — invoked by tapping the child avatar in the Home top bar.

- Bottom sheet rising from the bottom, rounded 24 top corners.
- Drag handle, then serif 18px "お子さんを えらぶ".
- A vertical list (no cards, hairline-separated rows):
    Each row: avatar 48 + serif 17 name + sans 12 ink-tertiary "生後 4ヶ月と 7日".
    Active child has a small sakura ❀ at the far right.
    Tap → smoothly transitions Home content (cross-fade 400ms) and closes the sheet.
- Below the list: an outlined CTA "きょうだいを ふやす" → Premium gate or add flow.
- The sheet has a graceful drag-down dismissal with rubber-band physics.
```

### 5.32 フォトブック注文フロー

```
Design the Photobook Purchase Flow — premium monetization, opened from
"この 1ヶ月を、ほんに する" in Monthly Recap (5.6).

A 4-step flow, each full-screen with a slim 4-segment progress strip at top.

STEP 1 — Choose the period
  Serif 22px: "どの ときの ほんに しますか"
  Soft option cards (stacked, rounded 20, bg-elevated, p-20):
    "ことしの 5月"    "8ページ"
    "ことしの 1月〜4月" "31ページ"
    "○○ちゃんの 1ねん" "(おすすめ)"
    "じぶんで えらぶ" → opens a date range picker
  Each card tappable; selected gets a 2px sakura ring.
  Bottom pill: "つぎへ".

STEP 2 — Choose the layout
  Serif 22px: "ほんの かたちを えらびます"
  Two large preview tiles side-by-side (3D-tilted book mockups):
    A5 たて  / 20ページ  / ¥2,980
    A4 よこ  / 24ページ  / ¥4,980
  Each card shows a faint serif sample of the inner spread.
  Selected gets sakura ring. Bottom: "つぎへ".

STEP 3 — Preview & arrange
  Show a horizontally swipeable spread preview, photo-realistic. Each spread:
    Left page: a generated memory body (serif, beautifully typeset).
    Right page: the matching photo.
  Slim dots indicator at the bottom of the preview shows position.
  Beneath the preview, a sans 13px ink-tertiary line: "ぜんぶで 12 スプレッド"
  Below: an outlined "ちょうせいする" button (opens a small reorder tray).
  Bottom pill: "ちゅうもんへ".

STEP 4 — Shipping & payment
  Standard form (warm-styled), with these blocks:
    "とどけさき"   address form, prefilled if known
    "おしはらい"   Apple Pay / クレジットカード / コンビニ払い
    "ちゅうもん ないよう"  summary card with the photobook spec + price + 配送料
  Big serif total at the bottom: "ごうけい ¥3,278"
  Pill CTA: "ちゅうもんを かくてい する"

  Hana Plus discount banner (only shown if subscribed):
    A serif 14px line above the total: "Hana Plus かいいんで 20% オフ"
    The original price has a soft 1px hairline strike-through (NOT a bold red strike).

- Post-purchase screen:
    Serif 26px centered: "ほんが、つくられはじめます"
    Sub serif 14px: "10〜14にちで、おてもとに とどきます"
    A small "ちゅうもん れきしを みる" ghost link.
```

### 5.33 エラー / オフライン / メンテナンス状態

```
Design the Error State family — these are the screens shown when things go wrong.
All share a warm, never-red, never-panicky template.

SHARED TEMPLATE:
- bg-canvas, centered content vertically.
- A small hand-drawn thin-line illustration (60px) at the top — a slightly
  off-kilter ❀, or a closed book, or a pause symbol. Never an exclamation triangle.
- Serif 22px headline (1 line, calm).
- Sub serif 14px body (max 3 lines, ink-secondary).
- Single primary action (outlined serif button).
- Optional ghost secondary action below.

A. OFFLINE:
   Illustration: a faint cloud with a tilde line beneath
   Headline: "いま、つながっていません"
   Body: "つながったら、じどうで もどります"
   Primary: "もういちど ためす"
   Secondary: (none — auto-retries every 4s)
   When offline: cached memories remain readable. Show a tiny persistent banner
   at the top of Home: "オフライン ・ よむだけ できます" (bg-warm, serif 13px).

B. SERVER ERROR (5xx):
   Headline: "うまく いかない じかんが あるようです"
   Body: "わたしたちが、しらべています。
   すぐに もどります。"
   Primary: "もういちど ためす"
   Secondary: "ようすを おしらせ する" → 5.26

C. NOT FOUND (404 — deep-link to deleted memory):
   Headline: "この ページは、ありません"
   Body: "けされたか、まだ つくられていない ようです。"
   Primary: "ホームに もどる"

D. MAINTENANCE:
   Headline: "おやすみ じかん です"
   Body: "Hana は いま、せいびちゅう です。
   ○じごろに、もどります。"
   No buttons. A small "じかんを たしかめる" ghost link to a status page.

- ABSOLUTELY DO NOT:
  × Use red, broken images, sad-face emoji
  × Show "Oops!" or "Something went wrong!" generic copy
  × Show stack traces, error codes, or "Error 502: Bad Gateway"
```

### 5.34 プッシュ通知の見た目

```
Design the appearance of Hana's push notifications (iOS lock screen mockup).

- Standard iOS notification chrome — app icon (Hana wordmark on warm circle), name "Hana".
- Title (system bold sans): "1ねんまえの きょう"
- Body (system sans, 2 lines max — must read instantly on lock screen):
    "○○ちゃん、生後 4ヶ月の はじめての おさんぽ。
    きょうは どんな いちにち でしたか？"
- Optional small attachment thumbnail (rounded 8) on the right: the memory's photo.
- Tap → deep-links to that memory's Detail screen.

OTHER NOTIFICATION VARIANTS (design 3 lock-screen mockups):
  A. "1年前の今日" (above)
  B. Monthly recap ready (first of month):
       Title: "せんげつの ふりかえりが できました"
       Body: "○○ちゃんの 4月。8ページが まとまりました。"
  C. Gentle re-engagement (after 2+ weeks of silence, max once a month):
       Title: "○○ちゃんが、まっています"
       Body: "むりせず、おかえりなさい。"
       (NEVER mention day count, NEVER use 🔥 or any urgency emoji)

- ABSOLUTELY DO NOT design:
  × Streak break notifications
  × "You haven't recorded in 14 days!" notifications
  × Promo / sale notifications
```

### 5.35 やさしい レビュー & フィードバック ぷろんぷと

```
Design the in-app Review Prompt — appears only after a "moment of joy"
(e.g., user just opened a 1-year-ago memory, or completed their 10th memory).

NEVER shown after a transactional event (purchase, settings change).

- A soft bottom sheet (rounded 24 top, bg-elevated, drag handle).
- Thin-line illustration at the top: a tiny ❀ (40px).
- Serif 20px (centered, 2 lines):
    "Hana は、おやくに たてて いますか？"
- Body serif 13px ink-secondary:
    "ひとことの こたえで、たすかります。"
- Three large tap targets (vertically stacked, full-width, ghost outlined):
    "はい、たすかっています"        → triggers native App Store review prompt
    "もうすこし、まちます"          → dismisses, won't re-show for 60 days
    "なおしてほしい ところが あります" → deep-links to 5.26 Feedback
- Drag-down to dismiss with no penalty.

- The native iOS review prompt should only fire from "はい、たすかっています"
  — never preemptively.

- Max frequency: once per 90 days, regardless of outcome.

- ABSOLUTELY DO NOT:
  × Show this on app launch
  × Show this immediately after a paywall view
  × Force a 1–5 star tap before letting the user dismiss
```

### 5.36 追加 — オンボーディング STEP 0 / 規約同意（必要時のみ）

```
Design the optional Terms Consent screen — shown ONLY for first-time users from
jurisdictions requiring explicit acceptance (e.g., EU/JP under specific cases).

- Top: small serif 14px ink-tertiary "はじめる まえに"
- Headline serif 22px: "おねがいが、ふたつ あります"
- Body block (serif 15px, 1.95 leading, max 4 lines):
    "Hana を つかうには、「りようきやく」と「プライバシーポリシー」を
    たしかめて ください。
    どちらも、しずかに よめる かたちで かいて あります。"
- Two compact preview cards (bg-warm, rounded 16, p-16):
    Card 1: serif 16px "りようきやく" + sans 12px ink-tertiary "やく 3ぶん"
            tap → opens 5.23 viewer for Terms.
    Card 2: serif 16px "プライバシーポリシー" + sans 12px "やく 2ぶん"
            tap → opens 5.23 viewer for Privacy.
- Sticky bottom:
    A single inline checkbox row: small custom check (rounded 6, hairline → sakura
    when checked) + serif 14px label "ふたつとも、よみました"
    Below: pill CTA "はじめる" (sakura, disabled until checkbox).
- ABSOLUTELY DO NOT:
  × Pre-tick the checkbox
  × Hide the legal links behind expandable accordions
```

---

## 6. v0 反復用ボキャブラリー（指示語の語彙集）

これらの語彙を v0 への追加指示に使うと意図が通りやすい：

| 言いたいこと           | v0 への指示語（英語）                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| もっと余白を           | "Increase whitespace, especially around photos. Let it breathe."                                     |
| もっと温かく           | "Warmer tone — shift accents toward washi-paper ivory, reduce contrast."                             |
| もっと和風に           | "Add tasteful Japanese editorial touches — a thin 〜 divider, a small ❀ ornament."                   |
| 高級感を出して         | "More restraint — strip 30% of visual elements. Luxury is what's NOT there."                         |
| SNSっぽくしないで      | "Remove anything that resembles a social feed — no like counts, no public chrome."                   |
| もっと感情的に         | "Lean into the serif. Slow the motion. Use tender Japanese copy from the approved list."             |
| ボタンを目立たせて     | "Promote the primary CTA: full pill, sakura accent, position it within thumb-reach."                 |
| 親が泣ける感じに       | "This is the cry-worthy moment screen — maximize the photo, calm the chrome, make the type bookish." |
| ペイウォール感を消して | "Reframe as an invitation, not a gate. Remove urgency, comparisons, strikethroughs."                 |

---

## 7. NG 例（v0 に「これを避けて」と伝えるサンプル）

```
AVOID at all costs:
- Pastel cartoon baby illustrations (cliché parenting app)
- Bright gradient buttons (blue→purple, pink→orange)
- Emoji as decoration (🌸✨💖)
- "Streak: 7 days 🔥" gamification
- Like counts, comment counts, share buttons next to memories
- "AI-generated" labels or sparkle icons on AI content
- "Upgrade now!" red badges, "Limited time" countdowns
- Centered logo with tagline at the top of every screen
- Stock-photo perfect families. Use editorial, imperfect, slightly grainy imagery.
- iOS default blue (#007AFF) anywhere
- Material Design ripples
```

---

## 8. デリバリー指示（v0 への最終ピン）

```
DELIVERABLE
- Provide each screen as a self-contained Next.js page component.
- Use shadcn/ui primitives, extended with Tailwind for the warm tokens above.
- Define the color palette and typography in a single tokens.ts and globals.css
  using CSS variables, so the entire app is themable.
- All Japanese copy must come from the approved list — do not invent new
  guilt-inducing or SNS-style copy.
- Include sensible loading, empty, and error states for every screen.
- Mobile-first. Test layouts at 390px, 430px, 768px, 1280px.
- Ship realistic placeholder content: 1 child named はると (生後 4ヶ月と 7日),
  5 memories with serif story bodies that feel like real parent voices.

Make me a product I would pay 480円/month for the rest of my child's first decade.
```

---

## 9. 投げる順番（推奨）

v0 のセッションは長く回すと文脈がブレるので、以下の順序で **新規セッション** に分けるのがおすすめ：

### コア 3 セッション（最初に作る）

1. **セッション1（基盤）**: 章 1 + 2 + 3 + 4 + 5.2 (Home) + 5.4 (Timeline) + 5.5 (Detail)
   → デザインシステムと中核 3 画面を固める

2. **セッション2（神フロー）**: 章 1 + 5.3 (Photo→AI→Confirm) + 5.6 (Monthly Recap)
   → 30秒の魔法とリピート動機を作る

3. **セッション3（マネタイズ・LP）**: 章 1 + 5.7 (Premium) + 5.8 (LP)
   → 「課金に値する」を視覚的に成立させる

### 拡張 5 セッション（プロダクトを完成させる）

<!-- markdownlint-disable MD029 -->

4. **セッション4（認証・起動）**: 章 1 + 5.9 (Splash) + 5.10 (Auth Hub) + 5.11 (Email) + 5.12 (Magic Link Landing) + 5.36 (Terms Consent)
   → ファーストインプレッションと信頼形成

5. **セッション5（オンボーディング完走）**: 章 1 + 5.1 (Onboarding 4steps) + 5.13 (Permissions)
   → 初回体験を最後まで設計

6. **セッション6（設定・アカウント）**: 章 1 + 5.14 (Settings) + 5.15 (Account) + 5.16 (Child Profile) + 5.17 (Notifications) + 5.20 (Privacy & Data) + 5.21 (Subscription) + 5.22 (Cancellation) + 5.24 (Account Deletion)
   → 課金後の信頼維持に効く画面群

7. **セッション7（家族共有・追加機能）**: 章 1 + 5.18 (Family Share) + 5.19 (Invite Accept) + 5.27 (Lightbox) + 5.28 (Memory Edit) + 5.29 (Trash) + 5.30 (Search) + 5.31 (Child Switcher) + 5.32 (Photobook)
   → v1 機能 + ユーティリティ

8. **セッション8（細部の温度感）**: 章 1 + 5.23 (Legal Viewer) + 5.25 (Help) + 5.26 (Feedback) + 5.33 (Error States) + 5.34 (Push Notifications) + 5.35 (Review Prompt)
   → エッジケース・エラー・コミュニケーション

各セッション冒頭で **必ず章 1（メインプロンプト）を貼る**。
セッション間で UI トークンが微妙にブレた場合は、章 6 のボキャブラリーで補正。

<!-- markdownlint-enable MD029 -->
