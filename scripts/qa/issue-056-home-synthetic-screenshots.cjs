const { existsSync, mkdirSync } = require('node:fs')
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

const outDir = join(process.cwd(), 'docs/design/artifacts/issue-056-home')
const now = '2026-07-23'

const scenarios = [
  {
    id: 'home-empty-390x844',
    viewport: { width: 390, height: 844 },
    childName: 'はな',
    ageLabel: '1歳2か月',
    togetherDays: '426',
    memories: [],
  },
  {
    id: 'home-one-memory-430x932',
    viewport: { width: 430, height: 932 },
    childName: 'あお',
    ageLabel: '9か月',
    togetherDays: '274',
    memories: [{ title: 'ページ 001', hasCover: true }],
  },
  {
    id: 'home-five-memories-390x844',
    viewport: { width: 390, height: 844 },
    childName: 'はな',
    ageLabel: '1歳2か月',
    togetherDays: '426',
    memories: [
      { title: 'ページ 001', hasCover: true },
      { title: 'ページ 002', hasCover: true },
      { title: 'ページ 003', hasCover: false },
      { title: 'ページ 004', hasCover: true },
      { title: 'ページ 005', hasCover: true },
    ],
  },
  {
    id: 'home-five-memories-430x932',
    viewport: { width: 430, height: 932 },
    childName: 'はな',
    ageLabel: '1歳2か月',
    togetherDays: '426',
    memories: [
      { title: 'ページ 001', hasCover: true },
      { title: 'ページ 002', hasCover: true },
      { title: 'ページ 003', hasCover: false },
      { title: 'ページ 004', hasCover: true },
      { title: 'ページ 005', hasCover: true },
    ],
  },
  {
    id: 'home-five-memories-768x1024',
    viewport: { width: 768, height: 1024 },
    childName: 'はな',
    ageLabel: '1歳2か月',
    togetherDays: '426',
    memories: [
      { title: 'ページ 001', hasCover: true },
      { title: 'ページ 002', hasCover: true },
      { title: 'ページ 003', hasCover: false },
      { title: 'ページ 004', hasCover: true },
      { title: 'ページ 005', hasCover: true },
    ],
  },
  {
    id: 'home-long-name-390x844',
    viewport: { width: 390, height: 844 },
    childName: 'あおいはる',
    ageLabel: '2歳1か月',
    togetherDays: '761',
    memories: [
      { title: 'ページ 001', hasCover: true },
      { title: 'ページ 002', hasCover: false },
    ],
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

function renderMemory(memory, index) {
  const cover = memory.hasCover
    ? `<div class="cover cover-${index + 1}" aria-hidden="true"></div>`
    : `<div class="cover missing" aria-hidden="true"></div>`
  return `
    <li class="slip">
      <a href="#memory-${index + 1}" aria-label="${escapeHtml(memory.title)}">
        <div class="photo-mat">${cover}</div>
        <p>${escapeHtml(memory.title)}</p>
      </a>
    </li>
  `
}

function renderHome(scenario) {
  const hasMemories = scenario.memories.length > 0
  const memoryCards = scenario.memories.map(renderMemory).join('')
  const albumButton = hasMemories
    ? `<a class="button secondary" href="#album">アルバムをひらく</a>`
    : ''
  const albumSection = hasMemories
    ? `
      <section class="album" aria-labelledby="keepsake-pages">
        <div class="section-head">
          <div>
            <p class="meta">アルバム</p>
            <h2 id="keepsake-pages">しまってある ページ</h2>
          </div>
          <a class="quiet-link" href="#album">アルバムへ</a>
        </div>
        <ul>
          ${memoryCards}
          <li class="slip more"><a href="#album">まえのページも<br><span>ひらく</span></a></li>
        </ul>
      </section>
      <section class="stats" aria-labelledby="gentle-stats">
        <h2 id="gentle-stats" class="meta">この場所の あゆみ</h2>
        <dl>
          <div><dt>しまったページ</dt><dd>${scenario.memories.length}</dd></div>
          <div><dt>いまの月齢</dt><dd>${escapeHtml(scenario.ageLabel)}</dd></div>
          <div><dt>一緒に過ごした日数</dt><dd>${escapeHtml(scenario.togetherDays)}<span>日</span></dd></div>
        </dl>
      </section>
    `
    : `
      <section class="empty">
        <p class="meta">はじめのページ</p>
        <h2>最初のページを、<br>ここにしまえます</h2>
        <p>${escapeHtml(scenario.childName)} ちゃんとの 1まいめを、ありのままの写真から。</p>
        <a class="button primary" href="#record">はじめてのページをつくる</a>
      </section>
    `

  return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>ISSUE-056 synthetic home ${escapeHtml(scenario.id)}</title>
        <style>
          :root {
            --bg-canvas: #fbf7f2;
            --bg-paper-slip: #fffdf9;
            --bg-photo-mat: #f8f1e8;
            --bg-warm: #f5ede3;
            --ink: #2a2522;
            --ink-secondary: #6b5f57;
            --ink-tertiary: #74675c;
            --sakura: #c57a83;
            --sakura-deep: #8c5a5e;
            --hairline: #ede4d8;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: var(--bg-canvas);
            color: var(--ink);
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
          }
          .screen {
            min-height: 100vh;
            padding: 32px 24px 112px;
          }
          .wrap {
            width: min(100%, 448px);
            margin: 0 auto;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 32px;
          }
          .greeting { color: var(--ink-secondary); font-size: 14px; line-height: 1.7; }
          .avatar {
            min-width: 44px;
            min-height: 44px;
            border-radius: 999px;
            background: var(--bg-warm);
            border: 2px solid var(--hairline);
            display: grid;
            place-items: center;
            color: var(--sakura-deep);
            font-family: serif;
          }
          .paper {
            background: var(--bg-paper-slip);
            border: 1px solid var(--hairline);
            border-radius: 20px;
            box-shadow: 0 1px 2px rgba(58, 38, 30, 0.035), 0 8px 28px rgba(58, 38, 30, 0.045);
          }
          .hero { padding: 20px; }
          .hero-top { display: flex; justify-content: space-between; gap: 16px; }
          .meta {
            margin: 0;
            color: var(--ink-tertiary);
            font-size: 12px;
            font-weight: 600;
          }
          h1, h2 {
            margin: 0;
            font-family: "Hiragino Mincho ProN", "Noto Serif JP", serif;
            letter-spacing: 0;
          }
          h1 { margin-top: 12px; font-size: 26px; line-height: 1.35; }
          h2 { margin-top: 4px; font-size: 20px; line-height: 1.45; }
          .hero p.body { color: var(--ink-secondary); font-size: 14px; line-height: 1.9; margin: 14px 0 0; }
          .hero-icon {
            width: 56px;
            height: 56px;
            flex: 0 0 auto;
            border-radius: 16px;
            background: var(--bg-photo-mat);
            border: 1px solid var(--hairline);
            display: grid;
            place-items: center;
            color: var(--sakura-deep);
          }
          .hero-icon::before,
          .missing::before {
            content: "";
            width: 22px;
            height: 26px;
            border: 2px solid currentColor;
            border-left-width: 4px;
            border-radius: 4px 8px 8px 4px;
            opacity: 0.78;
          }
          .actions { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
          a {
            color: inherit;
            text-decoration: none;
          }
          a:focus-visible {
            outline: 2px solid var(--sakura);
            outline-offset: 4px;
          }
          .button {
            min-height: 48px;
            min-width: 44px;
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 650;
            font-size: 15px;
          }
          .primary { background: var(--sakura); color: var(--ink); }
          .secondary { background: var(--bg-paper-slip); border: 1px solid var(--hairline); }
          .hint { color: var(--ink-tertiary); font-size: 12px; text-align: center; line-height: 1.8; margin: 16px 0 0; }
          .empty {
            margin-top: 40px;
            border-radius: 20px;
            background: var(--bg-photo-mat);
            border: 1px solid var(--hairline);
            padding: 32px 20px;
            text-align: center;
          }
          .empty p:not(.meta) { color: var(--ink-secondary); font-size: 14px; line-height: 1.9; }
          .album, .stats { margin-top: 40px; }
          .section-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
          }
          .quiet-link {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            border-radius: 12px;
            padding: 0 12px;
            color: var(--ink-secondary);
            font-size: 13px;
          }
          ul {
            display: flex;
            gap: 12px;
            overflow-x: auto;
            list-style: none;
            padding: 8px 24px;
            margin: 0 -24px;
            scroll-padding-inline: 24px;
          }
          .slip {
            flex: 0 0 148px;
          }
          .slip a {
            display: block;
            min-height: 44px;
            border-radius: 18px;
            background: var(--bg-paper-slip);
            border: 1px solid var(--hairline);
            padding: 8px;
            box-shadow: 0 1px 2px rgba(58, 38, 30, 0.035), 0 8px 28px rgba(58, 38, 30, 0.045);
          }
          .photo-mat {
            aspect-ratio: 4 / 5;
            border-radius: 14px;
            padding: 4px;
            background: var(--bg-photo-mat);
            border: 1px solid var(--hairline);
          }
          .cover {
            width: 100%;
            height: 100%;
            border-radius: 10px;
            background: linear-gradient(145deg, #ead7cd, #d7dfce);
          }
          .cover-2 { background: linear-gradient(145deg, #e6c8cf, #efe5d5); }
          .cover-3 { background: linear-gradient(145deg, #d6dfcf, #f0dfd2); }
          .cover-4 { background: linear-gradient(145deg, #efe4cd, #d8c7bf); }
          .cover-5 { background: linear-gradient(145deg, #ddcbd1, #dce4d6); }
          .missing {
            display: grid;
            place-items: center;
            color: var(--sakura-deep);
            font-family: serif;
            background: var(--bg-photo-mat);
          }
          .slip p {
            min-height: 40px;
            margin: 12px 0 0;
            font-family: "Hiragino Mincho ProN", "Noto Serif JP", serif;
            font-size: 14px;
            line-height: 1.45;
          }
          .more a {
            min-height: 205px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            background: var(--bg-photo-mat);
            font-family: "Hiragino Mincho ProN", "Noto Serif JP", serif;
            color: var(--ink-secondary);
          }
          .more span { color: var(--sakura-deep); }
          dl {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 0;
          }
          dt {
            color: var(--ink-tertiary);
            font-size: 11px;
            line-height: 1.6;
            overflow-wrap: anywhere;
          }
          dd {
            margin: 8px 0 0;
            font-size: 24px;
            font-weight: 300;
          }
          dd span { color: var(--ink-tertiary); font-size: 12px; margin-left: 4px; }
          .nowrap { white-space: nowrap; }
          dl > div {
            min-height: 112px;
            border-radius: 16px;
            background: var(--bg-paper-slip);
            border: 1px solid var(--hairline);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 16px 8px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main class="screen">
          <div class="wrap">
            <header>
              <div class="greeting">おかえりなさい<br>${escapeHtml(now)}</div>
              <a class="avatar" href="#settings" aria-label="${escapeHtml(scenario.childName)} の せってい">${escapeHtml(Array.from(scenario.childName)[0] || '?')}</a>
            </header>
            <section class="hero paper" aria-labelledby="primary-action">
              <div class="hero-top">
                <div>
                  <p class="meta">ただいま</p>
                  <h1 id="primary-action">また、ここに<br>しまいましょう</h1>
                  <p class="body">写真1まいから、AIの下書きまで<span class="nowrap">30秒</span>。あとで、ことばをなおせます。</p>
                </div>
                <div class="hero-icon" aria-hidden="true"></div>
              </div>
              <div class="actions">
                <a class="button primary" href="#record">写真からページをつくる</a>
                ${albumButton}
              </div>
              <p class="hint">ひとことだけでも、静かに残せます。</p>
            </section>
            ${albumSection}
          </div>
        </main>
      </body>
    </html>
  `
}

async function assertScenario(page) {
  const text = await page.locator('body').innerText()
  const forbiddenCopy = /今日まだ|記録していません|途切れ|ストリーク|streak|いいね|ランキング|投稿/i
  if (forbiddenCopy.test(text)) {
    throw new Error(`forbidden pressure or feed copy found: ${forbiddenCopy.exec(text)[0]}`)
  }
  if (!text.includes('写真1まいから、AIの下書きまで30秒')) {
    throw new Error('missing 30-second low-friction value copy')
  }

  const smallTargets = await page.$$eval('a, button', (targets) =>
    targets
      .map((target) => {
        const rect = target.getBoundingClientRect()
        return {
          label: target.textContent?.trim() || target.getAttribute('aria-label') || 'target',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter((target) => target.width < 44 || target.height < 44),
  )
  if (smallTargets.length > 0) {
    throw new Error(`small tap target: ${JSON.stringify(smallTargets)}`)
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const artifacts = []

  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage({ viewport: scenario.viewport, reducedMotion: 'reduce' })
      const html = renderHome(scenario)
      const forbiddenEvidence = /https?:\/\/|uploads\/|storage_key\s*[:=]|presigned_url\s*[:=]/i
      if (forbiddenEvidence.test(html)) {
        throw new Error(`forbidden evidence token in synthetic HTML for ${scenario.id}`)
      }
      await page.setContent(html, { waitUntil: 'load' })
      await assertScenario(page)
      const file = join(outDir, `${scenario.id}.png`)
      await page.screenshot({ path: file, fullPage: true })
      if (!existsSync(file)) throw new Error(`screenshot missing: ${file}`)
      artifacts.push(relative(process.cwd(), file))
      await page.close()
    }
  } finally {
    await browser.close()
  }

  console.log(
    JSON.stringify(
      {
        issue: 'ISSUE-056',
        evidence: 'synthetic-only',
        result: 'pass',
        scenarios: scenarios.map((scenario) => scenario.id),
        artifacts,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
