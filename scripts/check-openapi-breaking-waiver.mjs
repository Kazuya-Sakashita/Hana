#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

export function reportSha256(report) {
  return createHash('sha256').update(report).digest('hex')
}

export function validateBreakingWaiver({
  report,
  document,
  approvalLabelPresent = false,
  now = new Date(),
}) {
  const errors = []
  if (typeof report !== 'string' || report.trim().length === 0) {
    return { errors: ['oasdiff report is missing or empty'], waiver: null, reportHash: null }
  }
  if (
    document?.version !== 1 ||
    document?.approval_label !== 'openapi-breaking-approved' ||
    !Array.isArray(document?.waivers)
  ) {
    return {
      errors: [
        'waiver document must have version 1, the protected approval label, and a waivers list',
      ],
      waiver: null,
      reportHash: reportSha256(report),
    }
  }

  const reportHash = reportSha256(report)
  const candidates = document.waivers.filter(
    (waiver) => waiver?.status === 'approved' && waiver?.report_sha256 === reportHash,
  )
  if (candidates.length !== 1) {
    errors.push('exactly one approved waiver must match the oasdiff report hash')
    return { errors, waiver: null, reportHash }
  }

  const waiver = candidates[0]
  if (!approvalLabelPresent) {
    errors.push('GitHub PR must have the openapi-breaking-approved label')
  }
  if (typeof waiver.id !== 'string' || !/^[a-z0-9][a-z0-9-]+$/.test(waiver.id)) {
    errors.push('waiver.id must be a stable kebab-case identifier')
  }
  if (typeof waiver.issue !== 'string' || !/^ISSUE-\d+$/.test(waiver.issue)) {
    errors.push('waiver.issue must identify the approving Issue')
  }
  if (typeof waiver.reason !== 'string' || waiver.reason.trim().length < 20) {
    errors.push('waiver.reason must explain why the breaking change is accepted')
  }
  if (typeof waiver.approved_by !== 'string' || waiver.approved_by.trim().length === 0) {
    errors.push('waiver.approved_by is required')
  }

  const approvedAt = new Date(waiver.approved_at)
  if (Number.isNaN(approvedAt.valueOf()) || approvedAt > now) {
    errors.push('waiver.approved_at must be a valid past date-time')
  }
  const expiresAt = new Date(`${waiver.expires_on}T23:59:59.999Z`)
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt < now) {
    errors.push('waiver.expires_on must be a valid future date')
  }
  if (waiver.scope !== 'openapi-breaking-report') {
    errors.push('waiver.scope must be openapi-breaking-report')
  }

  return { errors, waiver: errors.length === 0 ? waiver : null, reportHash }
}

function parseArgs(args) {
  const options = {
    report: 'oasdiff-breaking.txt',
    waivers: 'docs/api-driven-development/openapi-breaking-waivers.yaml',
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--report' && next) {
      options.report = next
      index += 1
    } else if (arg === '--waivers' && next) {
      options.waivers = next
      index += 1
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`)
    }
  }
  return options
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const report = readFileSync(path.resolve(options.report), 'utf8')
    const document = parseYaml(readFileSync(path.resolve(options.waivers), 'utf8'))
    const result = validateBreakingWaiver({
      report,
      document,
      approvalLabelPresent: process.env.OPENAPI_BREAKING_APPROVAL_LABEL_PRESENT === 'true',
    })
    if (result.errors.length > 0) {
      console.error('OpenAPI breaking change requires an approved, unexpired exact-report waiver.')
      for (const error of result.errors) console.error(`- ${error}`)
      process.exit(1)
    }
    console.log(
      `OpenAPI breaking waiver OK: id=${result.waiver.id}, issue=${result.waiver.issue}, expires=${result.waiver.expires_on}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
