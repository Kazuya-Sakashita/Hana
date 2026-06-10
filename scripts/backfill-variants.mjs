#!/usr/bin/env node
// 既存画像 (ISSUE-031 以前) の thumbnail/preview variant を一括生成する dev/ops スクリプト。
//
// 使い方:
//   set -a && source .env.local && set +a
//   node scripts/backfill-variants.mjs            # dry-run (生成対象を列挙)
//   node scripts/backfill-variants.mjs --apply    # 実際に生成 + upload
//
// 冪等性: 既に _thumb.webp / _preview.webp が存在する uuid は skip。
// 失敗時: ログに残してその画像は skip、 全体は継続。

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const APPLY = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const BUCKET = 'images'

const THUMB = { width: 320, quality: 70 }
const PREVIEW = { width: 1024, quality: 80 }

function deriveVariantKey(originalKey, variant) {
  const lastDot = originalKey.lastIndexOf('.')
  const base = lastDot >= 0 ? originalKey.substring(0, lastDot) : originalKey
  return `${base}_${variant}.webp`
}

function isVariantKey(key) {
  return key.endsWith('_thumb.webp') || key.endsWith('_preview.webp')
}

async function listAll(prefix) {
  const out = []
  async function walk(p) {
    const { data, error } = await supabase.storage.from(BUCKET).list(p, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      console.error(`list error ${p}:`, error.message)
      return
    }
    for (const item of data ?? []) {
      const isFolder = !item.id
      const full = p ? `${p}/${item.name}` : item.name
      if (isFolder) await walk(full)
      else out.push({ path: full, size: item.metadata?.size ?? 0 })
    }
  }
  await walk(prefix)
  return out
}

async function backfillOne(originalKey) {
  const dl = await supabase.storage.from(BUCKET).download(originalKey)
  if (dl.error || !dl.data) {
    console.error(`  download failed: ${dl.error?.message ?? 'no_data'}`)
    return false
  }
  const buf = Buffer.from(await dl.data.arrayBuffer())

  const [thumb, preview] = await Promise.all([
    sharp(buf)
      .rotate()
      .resize(THUMB.width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB.quality })
      .toBuffer(),
    sharp(buf)
      .rotate()
      .resize(PREVIEW.width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PREVIEW.quality })
      .toBuffer(),
  ])

  const thumbKey = deriveVariantKey(originalKey, 'thumb')
  const previewKey = deriveVariantKey(originalKey, 'preview')

  const [t, p] = await Promise.all([
    supabase.storage
      .from(BUCKET)
      .upload(thumbKey, thumb, { contentType: 'image/webp', upsert: true }),
    supabase.storage
      .from(BUCKET)
      .upload(previewKey, preview, { contentType: 'image/webp', upsert: true }),
  ])

  if (t.error) {
    console.error(`  thumb upload failed: ${t.error.message}`)
    return false
  }
  if (p.error) {
    console.error(`  preview upload failed: ${p.error.message}`)
    return false
  }
  console.log(`  ✓ thumb=${thumb.length}B / preview=${preview.length}B`)
  return true
}

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log('Listing all files under uploads/ ...')
const files = await listAll('uploads')
console.log(`Total files: ${files.length}`)

const pathSet = new Set(files.map((f) => f.path))
const originals = files.filter((f) => !isVariantKey(f.path))
console.log(`Original images (non-variant): ${originals.length}`)

const targets = []
for (const o of originals) {
  const thumbKey = deriveVariantKey(o.path, 'thumb')
  const previewKey = deriveVariantKey(o.path, 'preview')
  const hasThumb = pathSet.has(thumbKey)
  const hasPreview = pathSet.has(previewKey)
  if (!hasThumb || !hasPreview) {
    targets.push({ key: o.path, size: o.size, hasThumb, hasPreview })
  }
}

console.log(`Targets needing variant generation: ${targets.length}`)
console.log('---')
for (const t of targets) {
  const missing = []
  if (!t.hasThumb) missing.push('thumb')
  if (!t.hasPreview) missing.push('preview')
  console.log(`${t.key} | ${t.size} bytes | missing: ${missing.join(', ')}`)
}

if (!APPLY) {
  console.log('---')
  console.log('Dry-run only. Add --apply to actually generate variants.')
  process.exit(0)
}

console.log('---')
console.log(`Generating ${targets.length} variants ...`)
let ok = 0
let ng = 0
for (const t of targets) {
  console.log(`Processing ${t.key} ...`)
  try {
    const success = await backfillOne(t.key)
    if (success) ok++
    else ng++
  } catch (e) {
    console.error(`  exception: ${e instanceof Error ? e.message : 'unknown'}`)
    ng++
  }
}
console.log('---')
console.log(`Done. success=${ok} / failure=${ng}`)
