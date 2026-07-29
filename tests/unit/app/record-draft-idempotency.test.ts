import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const memoriesClientSource = readFileSync(
  new URL('../../../src/features/memories/client/use-memories.ts', import.meta.url),
  'utf8',
)
const draftStoreSource = readFileSync(
  new URL('../../../src/features/memories/client/record-draft-store.ts', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const openApiSource = readFileSync(
  new URL('../../../docs/openapi/openapi.yaml', import.meta.url),
  'utf8',
)
const prismaSource = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8')
const migrationSource = readFileSync(
  new URL(
    '../../../prisma/migrations/20260728230000_add_memory_idempotency_key/migration.sql',
    import.meta.url,
  ),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-116-record-draft-idempotency.md', import.meta.url),
  'utf8',
)

describe('ISSUE-116 record draft and create idempotency', () => {
  it('defines the user-scoped idempotency contract before implementation', () => {
    expect(openApiSource).toContain('- name: Idempotency-Key')
    expect(openApiSource).toContain('memory_idempotency_conflict')
    expect(openApiSource).toContain("'200':")
    expect(memoriesClientSource).toContain(
      "params: { header: { 'Idempotency-Key': idempotencyKey } }",
    )
  })

  it('persists only the allowed tab draft and restores a confirmed image id', () => {
    expect(recordSource).toContain('recordDraftStore.load(currentUserId)')
    expect(recordSource).toContain('recordDraftStore.save(')
    expect(recordSource).toContain('setUploadedImage(draft.imageId ? { id: draft.imageId } : null)')
    expect(recordSource).toContain("title={uploadedImage ? 'アップロード済みの写真があります'")
    expect(recordSource).toContain('再読み込み後はプレビューできません。')
    expect(draftStoreSource).not.toMatch(
      /fields\.(?:blob|file|imageUrl|presignedUrl|storageKey|prompt)/,
    )
  })

  it('keeps edited text when replacing a photo and rotates the key after a content conflict', () => {
    const fileSelectionSource = recordSource.slice(
      recordSource.indexOf('async function onFileSelected'),
      recordSource.indexOf('async function retryUpload'),
    )
    expect(fileSelectionSource).not.toContain("setTitle('')")
    expect(fileSelectionSource).not.toContain("setBody('')")
    expect(fileSelectionSource).not.toContain("setParentNote('')")
    expect(recordSource).toContain("case 'memory_idempotency_conflict'")
    expect(recordSource).toContain('setIdempotencyKey(nextIdempotencyKey)')
    expect(recordSource).toContain('saveConflictDescription')
    expect(recordSource).toContain('ref={primaryActionButtonRef}')
    expect(recordSource).toContain(
      'window.setTimeout(() => primaryActionButtonRef.current?.focus(), 0)',
    )
    const conflictSource = recordSource.slice(
      recordSource.indexOf("case 'memory_idempotency_conflict'"),
      recordSource.indexOf('default:', recordSource.indexOf("case 'memory_idempotency_conflict'")),
    )
    expect(conflictSource).not.toContain('showToast({')
  })

  it('clears the draft after save, explicit discard, sign-out and expiry', () => {
    expect(recordSource).toMatch(
      /createMemoryMutation\.mutateAsync[\s\S]+recordDraftStore\.clear\(\)/,
    )
    expect(recordSource).toMatch(
      /onClose=\{\(\) => \{[\s\S]+recordDraftStore\.clear\(\)[\s\S]+router\.push\('\/'\)/,
    )
    expect(settingsSource).toContain('recordDraftStore.clear()')
    expect(draftStoreSource).toContain('parsed.expiresAt <= now')
    expect(recordSource).toContain('この下書きを 破棄しますか？')
    expect(recordSource).toContain('下書きを 破棄して閉じる')
  })

  it('adds a nullable migration key with a per-user unique boundary', () => {
    expect(prismaSource).toContain('idempotencyKey String?')
    expect(prismaSource).toContain('@@unique([userId, idempotencyKey]')
    expect(migrationSource).toContain('ADD COLUMN "idempotency_key" UUID')
    expect(migrationSource).toContain('ADD COLUMN "memory_position" INTEGER')
    expect(migrationSource).toContain('ON "memories"("user_id", "idempotency_key")')
  })

  it('records privacy, authorization and evidence safety boundaries', () => {
    expect(issueSource).toContain('github_issue: 251')
    expect(issueSource).toContain('本文ハッシュ等の派生PIIはDBへ追加せず')
    expect(issueSource).toContain('APIレスポンスやログへ出力しない')
    expect(issueSource).toContain('Privacy / Security / Reliability専門レビュー')
  })
})
