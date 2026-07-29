interface FocusTarget {
  focus(): void
}

export function focusFirstFormError<FieldName extends string>({
  errors,
  fieldOrder,
  fieldTargets,
  fallbackTarget,
}: {
  errors: Partial<Record<FieldName, unknown>>
  fieldOrder: readonly FieldName[]
  fieldTargets: Partial<Record<FieldName, FocusTarget | null>>
  fallbackTarget?: FocusTarget | null
}): FieldName | null {
  const firstInvalidField = fieldOrder.find((field) => Boolean(errors[field])) ?? null
  const target = firstInvalidField ? fieldTargets[firstInvalidField] : null

  if (target) {
    target.focus()
    return firstInvalidField
  }

  fallbackTarget?.focus()
  return null
}
