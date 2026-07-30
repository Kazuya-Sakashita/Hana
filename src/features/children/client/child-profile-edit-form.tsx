'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isApiProblemError } from '@/lib/api/error'
import { focusFirstFormError } from '@/lib/ui/form-error-focus'
import { todayDateOnly } from '@/lib/date-only'
import { markHomeProfileRefresh } from './home-profile-refresh'
import { type Child, useUpdateChildMutation } from './use-children'

type FieldErrors = Partial<Record<'name' | 'birthdate', string>>

const copy = {
  nameRequired: '呼び名を 入れてください。',
  birthdateRequired: 'うまれたひを 入れてください。',
  birthdateFuture: 'うまれたひは、きょうまでの日を 選んでください。',
  invalid: '入力内容を たしかめてください。',
  failed: '変更を保存できませんでした。入力はそのままです。もう一度お試しください。',
  saved: '呼び名と うまれたひを変更しました。',
} as const

export function ChildProfileEditForm({ child }: { child: Child }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(child.name)
  const [birthdate, setBirthdate] = useState(child.birthdate)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const birthdateRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const submittingRef = useRef(false)
  const updateChild = useUpdateChildMutation()
  const todayIso = todayDateOnly()

  function reset() {
    setName(child.name)
    setBirthdate(child.birthdate)
    setFieldErrors({})
    setMessage(null)
    setEditing(false)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return

    const trimmedName = name.trim()
    const errors: FieldErrors = {}
    if (!trimmedName) errors.name = copy.nameRequired
    if (!birthdate) errors.birthdate = copy.birthdateRequired
    else if (birthdate > todayIso) errors.birthdate = copy.birthdateFuture

    setFieldErrors(errors)
    setMessage(null)
    setSavedMessage(null)
    if (Object.keys(errors).length > 0) {
      focusFirstFormError({
        errors,
        fieldOrder: ['name', 'birthdate'],
        fieldTargets: { name: nameRef.current, birthdate: birthdateRef.current },
        fallbackTarget: errorRef.current,
      })
      return
    }

    submittingRef.current = true
    try {
      const updated = await updateChild.mutateAsync({
        childId: child.id,
        body: { name: trimmedName, birthdate },
      })
      setName(updated.name)
      setBirthdate(updated.birthdate)
      setEditing(false)
      setSavedMessage(copy.saved)
      markHomeProfileRefresh()
      router.refresh()
    } catch (error) {
      if (isApiProblemError(error) && error.reason === 'validation_error') {
        const nextErrors: FieldErrors = {}
        for (const fieldError of error.problem.errors ?? []) {
          if (fieldError.path === 'body.name') nextErrors.name = copy.nameRequired
          if (fieldError.path === 'body.birthdate') {
            nextErrors.birthdate =
              fieldError.reason === 'future_date' ? copy.birthdateFuture : copy.birthdateRequired
          }
        }
        setFieldErrors(nextErrors)
        setMessage(Object.keys(nextErrors).length === 0 ? copy.invalid : null)
        queueMicrotask(() =>
          focusFirstFormError({
            errors: nextErrors,
            fieldOrder: ['name', 'birthdate'],
            fieldTargets: { name: nameRef.current, birthdate: birthdateRef.current },
            fallbackTarget: errorRef.current,
          }),
        )
      } else {
        setMessage(copy.failed)
        queueMicrotask(() => errorRef.current?.focus())
      }
    } finally {
      submittingRef.current = false
    }
  }

  if (!editing) {
    return (
      <div className="border-hairline mt-1 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setSavedMessage(null)
            setName(child.name)
            setBirthdate(child.birthdate)
            setFieldErrors({})
            setMessage(null)
            setEditing(true)
          }}
        >
          呼び名と うまれたひを なおす
        </Button>
        {savedMessage ? (
          <p role="status" className="text-leaf mt-3 text-sm leading-narrative">
            {savedMessage}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form className="border-hairline mt-1 space-y-4 border-t pt-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="settings-child-name">呼び名（必須）</Label>
        <Input
          ref={nameRef}
          id="settings-child-name"
          name="name"
          value={name}
          maxLength={50}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'settings-child-name-error' : undefined}
          onChange={(event) => {
            setName(event.target.value)
            setFieldErrors((current) => ({ ...current, name: undefined }))
          }}
        />
        {fieldErrors.name ? (
          <p id="settings-child-name-error" className="text-amber text-sm">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-child-birthdate">うまれたひ（必須）</Label>
        <Input
          ref={birthdateRef}
          id="settings-child-birthdate"
          name="birthdate"
          type="date"
          value={birthdate}
          max={todayIso}
          aria-invalid={fieldErrors.birthdate ? true : undefined}
          aria-describedby={fieldErrors.birthdate ? 'settings-child-birthdate-error' : undefined}
          onChange={(event) => {
            setBirthdate(event.target.value)
            setFieldErrors((current) => ({ ...current, birthdate: undefined }))
          }}
        />
        {fieldErrors.birthdate ? (
          <p id="settings-child-birthdate-error" className="text-amber text-sm">
            {fieldErrors.birthdate}
          </p>
        ) : null}
      </div>
      {message ? (
        <p ref={errorRef} role="alert" tabIndex={-1} className="text-amber text-sm outline-none">
          {message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={reset} disabled={updateChild.isPending}>
          変更せず もどる
        </Button>
        <Button type="submit" disabled={updateChild.isPending}>
          {updateChild.isPending ? '保存しています…' : 'この内容で 保存する'}
        </Button>
      </div>
    </form>
  )
}
