#!/usr/bin/env node
// 直近の Storage アップロード状況を確認する dev 用スクリプト (ISSUE-031 検証用)。
// 使い方: pnpm dlx dotenv-cli -e .env.local -- node scripts/list-recent-storage.mjs
//        または env を読んだ状態で  node scripts/list-recent-storage.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function listRecursive(prefix, depth = 0) {
  const { data, error } = await supabase.storage.from('images').list(prefix, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) {
    console.error(`[${prefix}] error:`, error.message)
    return
  }
  for (const item of data ?? []) {
    const isFolder = !item.id // folder entries have null id
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (isFolder) {
      if (depth < 3) await listRecursive(full, depth + 1)
    } else {
      const size = item.metadata?.size ?? '?'
      const mime = item.metadata?.mimetype ?? '?'
      console.log(`${full} | ${size} bytes | ${mime} | ${item.updated_at}`)
    }
  }
}

console.log('Supabase Storage: images bucket')
console.log('---')
await listRecursive('uploads')
