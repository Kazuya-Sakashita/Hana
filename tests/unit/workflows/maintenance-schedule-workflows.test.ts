import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  name?: string
  env?: Record<string, string>
  run?: string
}

type WorkflowJob = {
  if?: string
  steps: WorkflowStep[]
}

type MaintenanceWorkflow = {
  on: {
    workflow_dispatch: {
      inputs: {
        operation: {
          required: boolean
          type: string
          default: string
          options: string[]
        }
      }
    }
  }
  jobs: Record<string, WorkflowJob>
}

const workflowDefinitions = [
  {
    file: '../../../.github/workflows/confirmed-unlinked-image-cleanup.yml',
    invokeJob: 'cleanup',
    endpoint: '/internal/confirmed-unlinked-image-cleanups',
  },
  {
    file: '../../../.github/workflows/image-variant-repair.yml',
    invokeJob: 'repair',
    endpoint: '/internal/image-variant-repairs',
  },
  {
    file: '../../../.github/workflows/unconfirmed-upload-cleanup.yml',
    invokeJob: 'cleanup',
    endpoint: '/internal/unconfirmed-upload-cleanups',
  },
] as const

const holdCondition = normalize(`
  (github.event_name == 'schedule' && vars.HANA_MAINTENANCE_SCHEDULES_ENABLED != 'true') ||
  (github.event_name == 'workflow_dispatch' && inputs.operation != 'invoke')
`)
const invokeCondition = normalize(`
  (github.event_name == 'schedule' && vars.HANA_MAINTENANCE_SCHEDULES_ENABLED == 'true') ||
  (github.event_name == 'workflow_dispatch' && inputs.operation == 'invoke')
`)

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function loadWorkflow(file: string) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  return parse(source) as MaintenanceWorkflow
}

function requireJob(workflow: MaintenanceWorkflow, name: string) {
  const job = workflow.jobs[name]
  if (!job) throw new Error(`Missing workflow job: ${name}`)
  return job
}

describe('maintenance schedule activation contracts', () => {
  for (const definition of workflowDefinitions) {
    describe(definition.endpoint, () => {
      const workflow = loadWorkflow(definition.file)

      it('holds scheduled execution unless the shared activation flag is true', () => {
        expect(normalize(requireJob(workflow, 'hold').if ?? '')).toBe(holdCondition)
        expect(normalize(requireJob(workflow, definition.invokeJob).if ?? '')).toBe(invokeCondition)
      })

      it('requires an explicit manual invoke selection', () => {
        const operation = workflow.on.workflow_dispatch.inputs.operation
        expect(operation).toEqual({
          description: 'Select invoke to call the protected endpoint once',
          required: true,
          type: 'choice',
          default: 'hold',
          options: ['hold', 'invoke'],
        })
      })

      it('reports HOLD without reading endpoint configuration', () => {
        const holdJob = requireJob(workflow, 'hold')
        const holdRun = holdJob.steps.map((step) => step.run ?? '').join('\n')
        expect(holdRun).toContain('GITHUB_STEP_SUMMARY')
        expect(holdRun).not.toContain('HANA_APP_URL')
        expect(holdRun).not.toContain('CRON_SECRET')
        expect(holdRun).not.toContain(definition.endpoint)
      })

      it('fails closed on missing configuration before invoking the endpoint', () => {
        const invokeJob = requireJob(workflow, definition.invokeJob)
        const invokeStep = invokeJob.steps.find((step) => step.name?.startsWith('Invoke protected'))
        expect(invokeStep?.env).toEqual({
          HANA_APP_URL: '${{ secrets.HANA_APP_URL }}',
          CRON_SECRET: '${{ secrets.CRON_SECRET }}',
        })

        const run = invokeStep?.run ?? ''
        const urlCheck = run.indexOf('test -n "$HANA_APP_URL"')
        const secretCheck = run.indexOf('test -n "$CRON_SECRET"')
        const request = run.indexOf('curl --fail')
        expect(urlCheck).toBeGreaterThanOrEqual(0)
        expect(secretCheck).toBeGreaterThan(urlCheck)
        expect(request).toBeGreaterThan(secretCheck)
        expect(run).toContain(definition.endpoint)
        expect(run).not.toMatch(/\becho\b/)
        expect(run).not.toContain('set -x')
      })
    })
  }
})
