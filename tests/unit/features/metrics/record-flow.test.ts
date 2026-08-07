import { describe, expect, it, vi } from 'vitest'
import { resolveRecordFlowTransition } from '@/features/metrics/client/record-flow'

const CURRENT_FLOW = '00000000-0000-4000-8000-000000000001'
const RESTORED_FLOW = '00000000-0000-4000-8000-000000000002'
const NEXT_FLOW = '00000000-0000-4000-8000-000000000003'

describe('record telemetry flow lifecycle', () => {
  it('restores the draft idempotency key as the flow id', () => {
    expect(
      resolveRecordFlowTransition({
        transition: 'draft_restored',
        currentFlowId: CURRENT_FLOW,
        restoredFlowId: RESTORED_FLOW,
      }),
    ).toEqual({ flowId: RESTORED_FLOW, lifecycle: 'continued', reason: 'draft_restored' })
  })

  it.each(['upload_retried', 'save_retried'] as const)(
    'keeps the same flow for %s',
    (transition) => {
      const createFlowId = vi.fn(() => NEXT_FLOW)
      expect(
        resolveRecordFlowTransition({ transition, currentFlowId: CURRENT_FLOW, createFlowId }),
      ).toEqual({ flowId: CURRENT_FLOW, lifecycle: 'continued', reason: transition })
      expect(createFlowId).not.toHaveBeenCalled()
    },
  )

  it.each(['photo_changed', 'idempotency_conflict'] as const)(
    'rotates the flow for %s',
    (transition) => {
      expect(
        resolveRecordFlowTransition({
          transition,
          currentFlowId: CURRENT_FLOW,
          createFlowId: () => NEXT_FLOW,
        }),
      ).toEqual({ flowId: NEXT_FLOW, lifecycle: 'rotated', reason: transition })
    },
  )

  it('rejects a rotation that reuses the old id', () => {
    expect(() =>
      resolveRecordFlowTransition({
        transition: 'photo_changed',
        currentFlowId: CURRENT_FLOW,
        createFlowId: () => CURRENT_FLOW,
      }),
    ).toThrow('invalid_next_flow_id')
  })
})
