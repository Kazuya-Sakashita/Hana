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

export function resolveRecordFlowTransition(input: {
  transition: RecordFlowTransition
  currentFlowId: string
  restoredFlowId?: string
  createFlowId?: () => string
}): RecordFlowResolution {
  const currentFlowId = canonicalizeBareUuid(input.currentFlowId)
  if (!currentFlowId) throw new Error('invalid_current_flow_id')
  if (input.transition === 'draft_restored') {
    const restoredFlowId = input.restoredFlowId ? canonicalizeBareUuid(input.restoredFlowId) : null
    if (!restoredFlowId) {
      throw new Error('invalid_restored_flow_id')
    }
    return {
      flowId: restoredFlowId,
      lifecycle: 'continued',
      reason: input.transition,
    }
  }
  if (input.transition === 'upload_retried' || input.transition === 'save_retried') {
    return {
      flowId: currentFlowId,
      lifecycle: 'continued',
      reason: input.transition,
    }
  }
  const nextFlowId = canonicalizeBareUuid(input.createFlowId?.() ?? '')
  if (!nextFlowId || nextFlowId === currentFlowId) {
    throw new Error('invalid_next_flow_id')
  }
  return {
    flowId: nextFlowId,
    lifecycle: 'rotated',
    reason: input.transition,
  }
}
import { canonicalizeBareUuid } from '@/lib/uuid'
