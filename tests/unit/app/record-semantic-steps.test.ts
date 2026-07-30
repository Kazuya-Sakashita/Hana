import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/record/page.tsx', 'utf8')

describe('record semantic steps', () => {
  it('uses an ordered list and exposes the current step', () => {
    expect(source).toContain('<ol')
    expect(source).toContain('記録の進み具合')
    expect(source).toContain('aria-label="記録の進行"')
    expect(source).toContain("aria-current={state === 'current' ? 'step' : undefined}")
  })

  it('announces current and completed states without color alone', () => {
    expect(source).toContain('現在のステップ: {currentStepLabel}')
    expect(source).toContain(
      "state === 'done' ? '完了' : state === 'current' ? 'いまここ' : '未完了'",
    )
    expect(source).toContain('label="写真を選ぶ"')
    expect(source).toContain('label="下書きを整える"')
    expect(source).toContain('label="保存する"')
  })

  it('does not style progress items as pill buttons', () => {
    expect(source).toContain('function RecordStep')
    expect(source).not.toContain('function StepPill')
    expect(source).toContain('className={`border-t-2 pt-2')
  })

  it('keeps manual writing visually actionable and on the draft step until save-ready', () => {
    expect(source).toContain(
      "const draftComplete = aiStatus === 'done' || (aiStatus === 'idle' && canSubmit)",
    )
    expect(source).toContain('variant="outline"')
    expect(source).toContain('border-ink bg-warm text-ink w-full border-2 shadow-lift')
    expect(source).toContain('<PenLine aria-hidden="true" />')
    expect(source).toContain('AI を つかわないで、自分で書く')
    expect(source).toContain(
      "variant={footerState.secondaryAction === 'manual' ? 'outline' : 'ghost'}",
    )
    expect(source).toContain("size={footerState.secondaryAction === 'manual' ? 'lg' : 'sm'}")
    expect(source).toContain('border-ink bg-warm text-ink mt-2 w-full border-2 shadow-lift')
  })

  it('shows the destructive draft action before hover', () => {
    expect(source).toContain('variant="destructive"')
    expect(source).toContain('border-amber bg-amber w-full border-2 text-white shadow-lift')
    expect(source).toContain('下書きを 破棄して閉じる')
  })
})
