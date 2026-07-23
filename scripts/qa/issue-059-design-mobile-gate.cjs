const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')

function requirePlaywright() {
  try {
    return require('playwright')
  } catch (error) {
    const runtimeNodeModules = process.env.CODEX_RUNTIME_NODE_MODULES
    if (!runtimeNodeModules) throw error
    return require(join(runtimeNodeModules, 'playwright'))
  }
}

const { chromium } = requirePlaywright()

const outDir = join(process.cwd(), 'docs/design/artifacts/issue-059-mobile-gate')
const manifestPath = join(outDir, 'design-mobile-gate-manifest.json')

const flowContracts = [
  {
    name: 'core AI path',
    start: '既存同意済みユーザーが写真 1 枚を選択した時点',
    finish: '保存完了 feedback または album 遷移',
    target: '30 秒以内',
  },
  {
    name: 'AI skip / manual save path',
    start: '写真 1 枚を選択した時点',
    finish: '保存完了 feedback または album 遷移',
    target: '30 秒以内',
  },
  {
    name: 'first consent path',
    start: 'AI 同意 dialog が表示された時点',
    finish: '同意または skip 後に保存可能な状態',
    target: '60 秒以内',
  },
]

const scenarios = [
  {
    id: 'record-core-ai-390x844',
    viewport: { width: 390, height: 844 },
    surface: 'record',
    html: () => renderRecord({ mode: 'core-ai' }),
  },
  {
    id: 'record-ai-skip-ready-390x844',
    viewport: { width: 390, height: 844 },
    surface: 'record',
    html: () => renderRecord({ mode: 'manual' }),
  },
  {
    id: 'record-first-consent-430x932',
    viewport: { width: 430, height: 932 },
    surface: 'record',
    html: () => renderRecord({ mode: 'consent' }),
  },
  {
    id: 'home-empty-390x844',
    viewport: { width: 390, height: 844 },
    surface: 'home',
    html: () => renderHome({ memories: [] }),
  },
  {
    id: 'album-shelf-390x844',
    viewport: { width: 390, height: 844 },
    surface: 'album',
    html: () => renderAlbum(),
  },
  {
    id: 'memory-detail-430x932',
    viewport: { width: 430, height: 932 },
    surface: 'memory-detail',
    html: () => renderMemoryDetail(),
  },
  {
    id: 'tablet-release-768x1024',
    viewport: { width: 768, height: 1024 },
    surface: 'release-tablet',
    html: () => renderReleaseBoard({ layout: 'tablet' }),
  },
  {
    id: 'desktop-release-1280x900',
    viewport: { width: 1280, height: 900 },
    surface: 'release-desktop',
    html: () => renderReleaseBoard({ layout: 'desktop' }),
  },
]

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function photo(seed) {
  const classes = ['soft-sakura', 'soft-sage', 'soft-paper', 'soft-umber']
  return `<div class="photo ${classes[seed % classes.length]}" aria-hidden="true"></div>`
}

function renderShell(title, body) {
  return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <style>
          :root {
            --bg-canvas: #fbf7f2;
            --bg-paper: #fffdf9;
            --bg-mat: #f6eee4;
            --ink: #2a2522;
            --ink-secondary: #6b5f57;
            --ink-tertiary: #74675c;
            --sakura: #c57a83;
            --sakura-soft: #f1c9cd;
            --sakura-deep: #8c5a5e;
            --sage: #d9e0d0;
            --umber: #a9795c;
            --hairline: #eadfD2;
          }
          * { box-sizing: border-box; }
          html, body { margin: 0; min-height: 100%; }
          body {
            background: var(--bg-canvas);
            color: var(--ink);
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
            overflow-x: hidden;
          }
          a { color: inherit; text-decoration: none; }
          button, input, textarea {
            color: inherit;
            font: inherit;
          }
          a:focus-visible,
          button:focus-visible,
          input:focus-visible,
          textarea:focus-visible {
            outline: 2px solid var(--sakura-deep);
            outline-offset: 3px;
          }
          h1, h2, h3, p { overflow-wrap: anywhere; }
          h1, h2, h3 {
            margin: 0;
            font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
            letter-spacing: 0;
          }
          h1 { font-size: clamp(25px, 3.8vw, 34px); line-height: 1.35; }
          h2 { font-size: 21px; line-height: 1.45; }
          h3 { font-size: 17px; line-height: 1.45; }
          p { line-height: 1.9; }
          .screen {
            min-height: 100vh;
            padding: 28px 22px calc(32px + env(safe-area-inset-bottom));
          }
          .wrap { width: min(100%, 486px); margin: 0 auto; }
          .desktop-wrap { width: min(100%, 1180px); margin: 0 auto; }
          .wrap,
          .desktop-wrap,
          section,
          article,
          .paper,
          .row,
          .grid {
            min-width: 0;
          }
          .paper {
            background: var(--bg-paper);
            border: 1px solid var(--hairline);
            border-radius: 20px;
            box-shadow: 0 1px 2px rgba(58, 38, 30, 0.035), 0 10px 30px rgba(58, 38, 30, 0.045);
          }
          .photo-mat {
            background: var(--bg-mat);
            border: 1px solid var(--hairline);
            border-radius: 18px;
            padding: 6px;
          }
          .photo {
            width: 100%;
            height: 100%;
            min-height: 118px;
            border-radius: 13px;
          }
          .soft-sakura { background: linear-gradient(145deg, #edd5d8, #d8dfce 62%, #f9efe5); }
          .soft-sage { background: linear-gradient(145deg, #d9e0d0, #f5dfd3 68%, #eee7d5); }
          .soft-paper { background: linear-gradient(145deg, #efe4cd, #ddcbd1 62%, #dce4d6); }
          .soft-umber { background: linear-gradient(145deg, #dfc9bd, #f2e4d2 58%, #d8dfcf); }
          .meta {
            margin: 0;
            color: var(--ink-tertiary);
            font-size: 12px;
            font-weight: 650;
            line-height: 1.6;
          }
          .body {
            margin: 12px 0 0;
            color: var(--ink-secondary);
            font-size: 14px;
          }
          .button,
          .icon-button,
          .quiet-link,
          .tab {
            min-width: 44px;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
          }
          .button {
            width: 100%;
            border: 0;
            padding: 0 18px;
            font-weight: 700;
          }
          .primary {
            background: var(--sakura);
            color: var(--ink);
          }
          .secondary {
            background: var(--bg-paper);
            border: 1px solid var(--hairline);
            color: var(--ink);
          }
          .quiet-link {
            padding: 0 12px;
            color: var(--ink-secondary);
            font-size: 13px;
          }
          .icon-button {
            border: 1px solid var(--hairline);
            background: var(--bg-paper);
          }
          .stack { display: grid; gap: 16px; }
          .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
          .grid { display: grid; gap: 16px; }
          .two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .flow-card { padding: 18px; }
          .flow-card strong {
            display: block;
            font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
            font-size: 24px;
            font-weight: 500;
          }
          .flow-card span { display: block; color: var(--ink-secondary); font-size: 13px; line-height: 1.7; margin-top: 6px; }
          .scroller {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            margin-inline: 0;
            padding: 6px 0 12px;
            scroll-padding-inline: 0;
          }
          .slip {
            flex: 0 0 148px;
            padding: 8px;
          }
          .slip .photo-mat { aspect-ratio: 4 / 5; }
          .slip h3 { margin-top: 12px; font-size: 14px; min-height: 40px; }
          .bottom-sheet {
            position: sticky;
            bottom: 0;
            margin: 24px -10px 0;
            padding: 16px;
            background: rgba(255, 253, 249, 0.98);
            border: 1px solid var(--hairline);
            border-radius: 24px 24px 18px 18px;
            box-shadow: 0 -8px 32px rgba(58, 38, 30, 0.08);
          }
          .sheet-actions { display: grid; gap: 10px; margin-top: 14px; }
          .field {
            min-height: 48px;
            width: 100%;
            border: 1px solid var(--hairline);
            border-radius: 14px;
            background: var(--bg-paper);
            padding: 12px 14px;
          }
          .consent-dialog {
            margin-top: 18px;
            padding: 16px;
            border-radius: 18px;
            background: #fff7f5;
            border: 1px solid #ead3d2;
          }
          .consent-dialog ul {
            margin: 10px 0 0;
            padding-left: 1.2em;
            color: var(--ink-secondary);
            font-size: 13px;
            line-height: 1.8;
          }
          .detail-photo .photo-mat { aspect-ratio: 5 / 4; }
          .story {
            margin-top: 18px;
            padding: 20px;
          }
          .story p { margin: 14px 0 0; color: var(--ink-secondary); }
          .action-band {
            margin-top: 18px;
            padding: 12px;
            display: flex;
            gap: 10px;
          }
          .release-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
            align-items: stretch;
          }
          .release-grid .paper { padding: 18px; }
          .release-grid .photo-mat { aspect-ratio: 4 / 3; }
          @media (max-width: 820px) {
            .release-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          }
          @media (max-width: 520px) {
            .two-col { grid-template-columns: 1fr; }
          }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
              transition-duration: 0.01ms !important;
            }
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `
}

function renderRecord({ mode }) {
  const isConsent = mode === 'consent'
  const isManual = mode === 'manual'
  return renderShell(
    `ISSUE-059 ${mode}`,
    `
      <main class="screen">
        <div class="wrap stack">
          <header class="row">
            <a class="icon-button" href="#back" aria-label="戻る">‹</a>
            <p class="meta">写真からページをつくる</p>
            <a class="quiet-link" href="#album">しまう</a>
          </header>
          <section class="paper flow-card" aria-labelledby="record-title">
            <p class="meta">1 まいから</p>
            <h1 id="record-title">ことばにする前の<br>写真を置く</h1>
            <p class="body">あとでなおせます。AI を使わずに残すこともできます。</p>
            <div class="photo-mat" style="margin-top:16px; aspect-ratio:4/3;">${photo(0)}</div>
          </section>
          <section class="bottom-sheet" aria-labelledby="record-action">
            <p class="meta">30 秒記録</p>
            <h2 id="record-action">${
              isConsent
                ? '送るものを確認してから'
                : isManual
                  ? 'ひとことで保存できる'
                  : '下書きか、ひとことか'
            }</h2>
            <p class="body">${
              isConsent
                ? '写真、呼び名、計算済みの月齢など必要なものだけを確認します。使わない選択も残します。'
                : isManual
                  ? 'AI を使わない時も、タイトルだけで保存へ進めます。'
                  : '写真を選んだら、下書きか手入力のどちらでも保存へ進めます。'
            }</p>
            ${
              isConsent
                ? `
                  <div class="consent-dialog" role="dialog" aria-labelledby="consent-title">
                    <h3 id="consent-title">AI の下書きに使うもの</h3>
                    <ul>
                      <li>写真と、記録に必要な短い文脈だけ</li>
                      <li>名字、フルネーム、メール、住所、生年月日は送らない</li>
                    </ul>
                    <div class="sheet-actions">
                      <button class="button secondary" type="button">AI を つかわない</button>
                      <button class="button primary" data-primary="true" type="button">どういして、つくる</button>
                    </div>
                  </div>
                `
                : isManual
                  ? `
                  <input class="field" aria-label="タイトル" value="synthetic-title">
                  <div class="sheet-actions">
                    <button class="button primary" data-primary="true" type="button">このまま 残す</button>
                    <button class="button secondary" type="button">AI で 下書きする</button>
                  </div>
                `
                  : `
                  <input class="field" aria-label="タイトル" value="ページ 001">
                  <div class="sheet-actions">
                    <button class="button primary" data-primary="true" type="button">AI で 下書きする</button>
                    <button class="button secondary" type="button">AI を使わずに 書く</button>
                  </div>
                `
            }
          </section>
        </div>
      </main>
    `,
  )
}

function renderHome({ memories }) {
  const hasMemories = memories.length > 0
  return renderShell(
    'ISSUE-059 home',
    `
      <main class="screen">
        <div class="wrap stack">
          <header class="row">
            <p class="body" style="margin:0;">おかえりなさい<br><span class="meta">2026-07-23</span></p>
            <a class="icon-button" href="#settings" aria-label="はな の せってい">は</a>
          </header>
          <section class="paper flow-card" aria-labelledby="home-title">
            <p class="meta">ただいま</p>
            <h1 id="home-title">また、ここに<br>しまいましょう</h1>
            <p class="body">写真1まいから、AIの下書きまで30秒。ひとことだけでも残せます。</p>
            <div class="sheet-actions">
              <a class="button primary" data-primary="true" href="#record">写真からページをつくる</a>
              ${hasMemories ? '<a class="button secondary" href="#album">アルバムをひらく</a>' : ''}
            </div>
          </section>
          <section class="paper flow-card" aria-labelledby="empty-title">
            <p class="meta">はじめのページ</p>
            <h2 id="empty-title">最初のページを、ここにしまえます</h2>
            <p class="body">はな ちゃんとの 1 まいめを、ありのままの写真から。</p>
          </section>
        </div>
      </main>
    `,
  )
}

function renderAlbum() {
  const slips = ['ページ 001', 'ページ 002', 'ページ 003', 'ページ 004']
    .map(
      (title, index) => `
        <article class="paper slip">
          <a href="#memory-${index + 1}" aria-label="${escapeHtml(title)}">
            <div class="photo-mat">${photo(index + 1)}</div>
            <h3>${escapeHtml(title)}</h3>
          </a>
        </article>
      `,
    )
    .join('')

  return renderShell(
    'ISSUE-059 album',
    `
      <main class="screen">
        <div class="wrap stack">
          <header class="row">
            <div>
              <p class="meta">アルバム</p>
              <h1>しまってあるページ</h1>
            </div>
            <a class="icon-button" href="#record" aria-label="写真から のこす">＋</a>
          </header>
          <section aria-labelledby="album-title">
            <div class="row">
              <h2 id="album-title">小さな保存棚</h2>
              <a class="quiet-link" href="#more">まえのページ</a>
            </div>
            <div class="scroller" data-scroll-x="true">${slips}</div>
          </section>
          <section class="paper flow-card">
            <p class="meta">しるし</p>
            <p class="body">しるしは自分のための目印です。比較や順位にはしません。</p>
          </section>
        </div>
      </main>
    `,
  )
}

function renderMemoryDetail() {
  return renderShell(
    'ISSUE-059 memory detail',
    `
      <main class="screen">
        <div class="wrap stack">
          <header class="row">
            <a class="icon-button" href="#album" aria-label="アルバムへ戻る">‹</a>
            <p class="meta">しまってあるページ</p>
            <span aria-hidden="true" style="width:44px;"></span>
          </header>
          <section class="detail-photo">
            <div class="photo-mat">${photo(2)}</div>
          </section>
          <article class="paper story" aria-labelledby="memory-title">
            <p class="meta">2026-07-23</p>
            <h1 id="memory-title">ページ 001</h1>
            <p>写真のそばに、親があとで読み返せる短いことばを置きます。長い題名や本文でも、画面の外へ押し出しません。</p>
          </article>
          <nav class="paper action-band" aria-label="ページのしるしと操作">
            <button class="button secondary" type="button" aria-pressed="false">しるし</button>
            <button class="button secondary" type="button">けす</button>
          </nav>
        </div>
      </main>
    `,
  )
}

function renderReleaseBoard({ layout }) {
  const cards = [
    ['記録', '写真 1 まいから、下部シートで保存へ進む。', 0],
    ['ホーム', '戻ってこられる場所として、初回 CTA を静かに置く。', 1],
    ['アルバム', '外へ見せる場ではなく、しまってあるページとして並べる。', 2],
    ['詳細', '写真と物語本文を主役にして、操作は控えめにする。', 3],
  ]
    .map(
      ([title, copy, seed]) => `
        <article class="paper">
          <div class="photo-mat">${photo(Number(seed))}</div>
          <h2 style="margin-top:14px;">${escapeHtml(title)}</h2>
          <p class="body">${escapeHtml(copy)}</p>
          <a class="quiet-link" href="#${escapeHtml(title)}">確認する</a>
        </article>
      `,
    )
    .join('')

  return renderShell(
    `ISSUE-059 ${layout}`,
    `
      <main class="screen">
        <div class="desktop-wrap stack">
          <header class="row">
            <div>
              <p class="meta">Design release gate</p>
              <h1>Quiet Heirloom 横断確認</h1>
            </div>
            <a class="button secondary" style="width:auto;" href="#report">レビュー結果</a>
          </header>
          <section class="release-grid" aria-label="対象画面">${cards}</section>
          <section id="report" class="paper flow-card">
            <p class="meta">判定</p>
            <strong>Go</strong>
            <span>synthetic evidence の範囲では No-Go blocker なし。実データ証跡は保存しません。</span>
          </section>
        </div>
      </main>
    `,
  )
}

function relativeLuminance(hex) {
  const values = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((part) => parseInt(part, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)))
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
}

function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function assertContrastSamples() {
  const samples = [
    ['ink on canvas', '#2a2522', '#fbf7f2', 7],
    ['secondary on canvas', '#6b5f57', '#fbf7f2', 4.5],
    ['primary button', '#2a2522', '#c57a83', 4.5],
    ['deep sakura on paper', '#8c5a5e', '#fffdf9', 4.5],
  ]

  const failures = samples
    .map(([name, foreground, background, minimum]) => ({
      name,
      ratio: contrastRatio(foreground, background),
      minimum,
    }))
    .filter((sample) => sample.ratio < sample.minimum)

  if (failures.length > 0) {
    throw new Error(`contrast sample failed: ${JSON.stringify(failures)}`)
  }
}

async function assertEvidenceSafety(html, scenario) {
  const forbiddenEvidencePatterns = [
    /https?:\/\//i,
    /uploads\/[A-Za-z0-9_-]+\/\d{6}\/[0-9a-f-]+\.(jpg|jpeg|png|webp|heic)/i,
    /storage_key\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /presigned_url\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /previewUrl\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /prompt\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\bbirthdate\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /(?:生年月日|誕生日)\s*[:：]\s*(?:19|20)\d{2}[-/年]/,
    /生年月日\s*[:：]\s*\d{4}/,
    /\b(?:full_name|fullName|surname|last_name|lastName)\s*[:=]\s*['"`][^'"`]+['"`]/,
    /(?:山田|佐藤|鈴木|田中|高橋|伊藤|渡辺|中村|小林|加藤)\s*(?:太郎|花子|一郎|美咲)/,
    /やわらかい光|今日も元気|ちいさな手|公園に行きました/,
  ]

  for (const pattern of forbiddenEvidencePatterns) {
    if (pattern.test(html)) {
      throw new Error(`forbidden evidence token in ${scenario.id}: ${pattern}`)
    }
  }
}

async function assertNoPressureOrFeedCopy(page, scenario) {
  const text = await page.locator('body').innerText()
  const forbiddenCopy =
    /今日まだ|記録していません|途切れ|ストリーク|streak|いいね|ランキング|投稿|フォロワー|映え/i
  const match = forbiddenCopy.exec(text)
  if (match) {
    throw new Error(`forbidden pressure or feed copy in ${scenario.id}: ${match[0]}`)
  }
}

async function assertTapTargets(page, scenario) {
  const smallTargets = await page.$$eval('a, button, input, textarea', (targets) =>
    targets
      .map((target) => {
        const rect = target.getBoundingClientRect()
        const label =
          target.getAttribute('aria-label') ||
          target.textContent?.trim() ||
          target.getAttribute('name') ||
          target.tagName
        return {
          label,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter((target) => target.width < 44 || target.height < 44),
  )

  if (smallTargets.length > 0) {
    throw new Error(`small tap targets in ${scenario.id}: ${JSON.stringify(smallTargets)}`)
  }
}

async function assertTextDoesNotOverflow(page, scenario) {
  const overflow = await page.evaluate(() => {
    const documentOverflow =
      document.documentElement.scrollWidth > window.innerWidth + 1
        ? [
            {
              label: 'document',
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: window.innerWidth,
            },
          ]
        : []

    const elementOverflow = Array.from(document.querySelectorAll('body *'))
      .filter((element) => !element.closest('[data-scroll-x="true"]'))
      .filter((element) =>
        Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
        ),
      )
      .map((element) => ({
        label:
          element.getAttribute('aria-label') ||
          element.textContent.trim().slice(0, 40) ||
          element.tagName,
        scrollWidth: Math.round(element.scrollWidth),
        clientWidth: Math.round(element.clientWidth),
      }))
      .filter((item) => item.scrollWidth > item.clientWidth + 1)

    return [...documentOverflow, ...elementOverflow]
  })

  if (overflow.length > 0) {
    throw new Error(`text overflow in ${scenario.id}: ${JSON.stringify(overflow)}`)
  }
}

async function assertRecordThumbZone(page, scenario) {
  if (scenario.surface !== 'record') return

  const primaryTargets = await page.$$eval('[data-primary="true"]', (targets) =>
    targets.map((target) => {
      const rect = target.getBoundingClientRect()
      return {
        label: target.textContent?.trim() || target.getAttribute('aria-label') || 'primary',
        centerY: rect.top + rect.height / 2,
      }
    }),
  )

  const upperPrimary = primaryTargets.filter(
    (target) => target.centerY < scenario.viewport.height * 0.65,
  )
  if (upperPrimary.length > 0) {
    throw new Error(`record primary CTA outside thumb zone in ${scenario.id}`)
  }
}

async function assertScenario(page, scenario) {
  await assertNoPressureOrFeedCopy(page, scenario)
  await assertTapTargets(page, scenario)
  await assertTextDoesNotOverflow(page, scenario)
  await assertRecordThumbZone(page, scenario)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  assertContrastSamples()

  const browser = await chromium.launch({ headless: true })
  const artifacts = []

  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage({
        viewport: scenario.viewport,
        reducedMotion: 'reduce',
      })
      const html = scenario.html()
      await assertEvidenceSafety(html, scenario)
      await page.setContent(html, { waitUntil: 'load' })
      await assertScenario(page, scenario)
      const file = join(outDir, `${scenario.id}.png`)
      await page.screenshot({ path: file, fullPage: true })
      if (!existsSync(file) || statSync(file).size <= 1000) {
        throw new Error(`screenshot missing or too small: ${file}`)
      }
      artifacts.push(relative(process.cwd(), file))
      await page.close()
    }
  } finally {
    await browser.close()
  }

  console.log(
    JSON.stringify(
      {
        issue: 'ISSUE-059',
        evidence: 'synthetic-only',
        result: 'pass',
        flow_contracts: flowContracts,
        scenarios: scenarios.map((scenario) => scenario.id),
        artifacts,
      },
      null,
      2,
    ),
  )

  const manifest = {
    issue: 'ISSUE-059',
    evidence: 'synthetic-only',
    generated_for: '2026-07-23',
    generator: relative(process.cwd(), __filename),
    generator_sha256: sha256(__filename),
    scenarios: scenarios.map((scenario) => scenario.id),
    artifacts: artifacts.map((artifact) => ({
      path: artifact,
      sha256: sha256(join(process.cwd(), artifact)),
    })),
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
