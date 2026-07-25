import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const grammarSource = readFileSync(
  new URL('../../../docs/design/lp-app-visual-grammar.md', import.meta.url),
  'utf8',
)
const canonSource = readFileSync(
  new URL('../../../docs/design/quiet-heirloom-design-canon.md', import.meta.url),
  'utf8',
)
const qaSource = readFileSync(
  new URL('../../../docs/design/product-design-qa-v2.md', import.meta.url),
  'utf8',
)
const designReadme = readFileSync(
  new URL('../../../docs/design/README.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-076-lp-app-visual-grammar.md', import.meta.url),
  'utf8',
)
const issueIndex = readFileSync(new URL('../../../docs/issues/README.md', import.meta.url), 'utf8')

describe('ISSUE-076 LP-App visual grammar', () => {
  it('creates a design bridge from LP mood evidence to app implementation contracts', () => {
    expect(grammarSource).toContain('LP-App Visual Grammar')
    expect(grammarSource).toContain('photo mat')
    expect(grammarSource).toContain('paper slip')
    expect(grammarSource).toContain('sage pill')
    expect(grammarSource).toContain('quiet icon')
    expect(grammarSource).toContain('palette ではなく')
    expect(grammarSource).toContain('生成画像や LP artifact は mood evidence')
    expect(designReadme).toContain('lp-app-visual-grammar.md')
    expect(canonSource).toContain('docs/design/lp-app-visual-grammar.md')
  })

  it('defines icon language without turning Hana into a decorative toolbar', () => {
    expect(grammarSource).toContain('lucide を標準')
    expect(grammarSource).toContain('stroke')
    expect(grammarSource).toContain('1.75')
    expect(grammarSource).toContain('1.9')
    expect(grammarSource).toContain('fill を許可する例外は favorite のみ')
    expect(grammarSource).toContain('Sparkles')
    expect(grammarSource).toContain('WandSparkles')
    expect(grammarSource).toContain('PenLine')
    expect(grammarSource).toContain('product app icon')
    expect(grammarSource).toContain('操作そのものに装飾花を使わない')
  })

  it('keeps visual semantics tied to Hana trust and accessibility boundaries', () => {
    expect(grammarSource).toContain('sakura')
    expect(grammarSource).toContain('favorite、focus、pressed flower、小さな brand accent')
    expect(grammarSource).toContain('本文、小さい helper text、大面積背景、primary CTA')
    expect(grammarSource).toContain('全 interactive target は 44px 以上')
    expect(grammarSource).toContain('primary CTA は 48px 以上')
    expect(grammarSource).toContain('body text は 7:1 目標')
    expect(grammarSource).toContain('helper / status text は 4.5:1 以上')
    expect(grammarSource).toContain('focus indicator と non-text UI は 3:1 以上')
    expect(grammarSource).toContain('vendor retention、ZDR、完全削除、復元可能')
    expect(grammarSource).toMatch(/vendor retention、ZDR、完全削除、復元可能.*断定しない/)
    expect(grammarSource).toContain('Privacy Trust / Content Safety / Accessibility / Task Success')
  })

  it('adds an LP-App visual parity gate and screenshot matrix to QA v2', () => {
    expect(qaSource).toContain('ISSUE-076 LP-App Visual Parity Gate')
    expect(qaSource).toContain('token parity')
    expect(qaSource).toContain('icon parity')
    expect(qaSource).toContain('surface parity')
    expect(qaSource).toContain('CTA parity')
    expect(qaSource).toContain('active state')
    expect(qaSource).toContain('tap target')
    expect(qaSource).toContain('contrast')
    expect(qaSource).toContain('body text は 7:1 目標')
    expect(qaSource).toContain('4.5:1 以上')
    expect(qaSource).toContain('3:1 以上')
    expect(qaSource).toContain('LP-App Screenshot Matrix')
    expect(qaSource).toContain('390x844')
    expect(qaSource).toContain('1280x900')
  })

  it('records follow-up issue split without mixing screen implementation into ISSUE-076', () => {
    for (const issueId of [
      'ISSUE-077',
      'ISSUE-078',
      'ISSUE-079',
      'ISSUE-080',
      'ISSUE-081',
      'ISSUE-082',
    ]) {
      expect(grammarSource).toContain(issueId)
      expect(issueIndex).toContain(issueId)
    }
    expect(issueSource).toContain('画面実装修正')
    expect(issueSource).toContain('API / DB / Auth / Storage / OpenAPI の変更')
    expect(issueSource).toContain('OpenAPI / DB / Auth / Storage には触れない')
    expect(grammarSource).toContain('候補 ID')
    expect(grammarSource).toContain('Codex-ready ではない')
    expect(issueIndex).toContain('candidate。Issue doc 未作成')
  })

  it('guards evidence safety for LP-App review artifacts', () => {
    for (const unsafeEvidence of [
      '実写真',
      '画像 URL',
      'signed URL',
      '`storage_key`',
      'prompt',
      'AI 生成本文',
      'メール',
    ]) {
      expect(grammarSource).toContain(unsafeEvidence)
      expect(issueSource).toContain(unsafeEvidence)
    }
    expect(grammarSource).toContain('画像内 copy / trust claim を本番 UI に採用しない')
    expect(issueSource).toContain('画像内 copy / trust claim を本番 UI に転記しない')
  })
})
