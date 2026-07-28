import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-113-record-parent-note.md', import.meta.url),
  'utf8',
)

describe('ISSUE-113 independent parent note', () => {
  it('renders an optional, described, 200-character input before AI generation', () => {
    expect(recordSource).toContain('data-testid="record-parent-note"')
    expect(recordSource).toContain('htmlFor="memory-parent-note"')
    expect(recordSource).toContain('写真だけでは分からないこと (任意)')
    expect(recordSource).toContain('AIの下書きにだけ使います。記録には保存されません。')
    expect(recordSource).toContain(
      'aria-describedby="memory-parent-note-description memory-parent-note-count"',
    )
    expect(recordSource).toContain('maxLength={PARENT_NOTE_MAX_LENGTH}')
    expect(recordSource).toContain("disabled={aiStatus === 'generating'}")
  })

  it('sends only the independent note to AI and never stores it with a memory', () => {
    expect(recordSource).toContain("const [parentNote, setParentNote] = useState('')")
    expect(recordSource).toContain('parent_note: toAiParentNote(parentNote)')
    expect(recordSource).not.toContain("parent_note: body.trim() === '' ? null : body")

    const memoryRequestStart = recordSource.indexOf('const requestBody: MemoryCreateRequest = {')
    const memoryRequestEnd = recordSource.indexOf('\n    }', memoryRequestStart)
    expect(memoryRequestStart).toBeGreaterThan(-1)
    expect(recordSource.slice(memoryRequestStart, memoryRequestEnd)).not.toContain('parent_note')
  })

  it('does not send the note across the client API boundary before AI consent', () => {
    expect(recordSource).toContain(
      'async function callAiGenerate({ consentConfirmed }: { consentConfirmed: boolean })',
    )
    expect(recordSource).toMatch(
      /if \(!consentConfirmed\) \{[\s\S]+setAiStatus\('consent_pending'\)[\s\S]+return[\s\S]+\}[\s\S]+client\.POST\('\/ai\/generate'/,
    )
    expect(recordSource).toContain(
      'void callAiGenerate({ consentConfirmed: aiConsentAt !== null })',
    )
    expect(recordSource).toContain(
      'void callAiGenerate({ consentConfirmed: user.ai_consent_at !== null })',
    )
  })

  it('keeps the note through generation and clears it only with a replacement photo', () => {
    expect(recordSource).toContain("setParentNote('')")
    expect(recordSource).not.toMatch(/setTitle\(res\.data\.title\)[\s\S]{0,200}setParentNote/)
    expect(recordSource).not.toMatch(/setAiStatus\('failed'\)[\s\S]{0,200}setParentNote/)
  })

  it('records privacy and review boundaries in the local issue', () => {
    expect(issueSource).toContain('github_issue: 248')
    expect(issueSource).toContain('親のひとことをDB保存しない')
    expect(issueSource).toContain('ログ、分析イベント、テスト証跡へ入力内容を出力しない')
    expect(issueSource).toContain('Product / Privacy')
  })
})
