export type RecordFlowTransition =
  | 'draft_restored'
  | 'photo_changed'
  | 'upload_retried'
  | 'save_retried'
  | 'idempotency_conflict'

export type RecordFlowResolution = {
  flowId: string
  lifecycle: 'continued' | 'rotated'
  reason: RecordFlowTransition
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function resolveRecordFlowTransition(input: {
  transition: RecordFlowTransition
  currentFlowId: string
  restoredFlowId?: string
  createFlowId?: () => string
}): RecordFlowResolution {
  if (!UUID_PATTERN.test(input.currentFlowId)) throw new Error('invalid_current_flow_id')
  if (input.transition === 'draft_restored') {
    if (!input.restoredFlowId || !UUID_PATTERN.test(input.restoredFlowId)) {
      throw new Error('invalid_restored_flow_id')
    }
    return {
      flowId: input.restoredFlowId,
      lifecycle: 'continued',
      reason: input.transition,
    }
  }
  if (input.transition === 'upload_retried' || input.transition === 'save_retried') {
    return {
      flowId: input.currentFlowId,
      lifecycle: 'continued',
      reason: input.transition,
    }
  }
  const nextFlowId = input.createFlowId?.()
  if (!nextFlowId || !UUID_PATTERN.test(nextFlowId) || nextFlowId === input.currentFlowId) {
    throw new Error('invalid_next_flow_id')
  }
  return {
    flowId: nextFlowId,
    lifecycle: 'rotated',
    reason: input.transition,
  }
}
