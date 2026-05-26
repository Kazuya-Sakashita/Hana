# ADR-0012: 画像 signed URL のキャッシュポリシー

- Status: Accepted
- Date: 2026-05-26
- Authors: Hana 開発チーム
- Supersedes: CLAUDE.md §7 「画像 / `Cache-Control: private, no-store`」 の記述

## 文脈 (Context)

Hana は Supabase Storage の private bucket に保管した画像を、 サーバが presigned URL (TTL 30 分) を発行して `<img src>` で表示する。
ISSUE-016 のパフォーマンス計測で、 主要 3 ページの **LCP が 10〜21 秒** と致命的に悪く、 原因は **画像の転送量と URL 取得回数** に集中していると判明した。

旧 CLAUDE.md §7 は「`Cache-Control: private, no-store`」 と記載していたが、 これだとブラウザ HTTP cache が完全に無効化され、 同一画像 URL を毎回再発行することになる。 一方、 presigned URL には **30 分 TTL** があるので、 短時間の cache はセキュリティリスクを増やさない。

## 決定 (Decision)

### 1. `GET /v1/uploads/{imageId}/url` のレスポンスヘッダ

```
Cache-Control: private, max-age=300
```

- `private`: 共有 cache (CDN / proxy) に乗らない
- `max-age=300`: 5 分。 presigned URL TTL (30 分) より十分短く、 ブラウザは同 URL レスポンスを 5 分再利用する

### 2. `size` クエリパラメータの導入

| size        | 用途                              | Supabase transformation |
| ----------- | --------------------------------- | ----------------------- |
| `thumbnail` | 一覧 (`/album`, `/`) のサムネ表示 | width=320, quality=70   |
| `preview`   | 詳細 (`/memory/[id]`) の本画像    | width=1024, quality=80  |
| `original`  | (default) 変換なし                | (なし)                  |

クライアントは表示サイズに応じて適切な `size` を指定し、 **「80×80 表示なのに 2MB 原寸を取得」 という浪費** を排除する。

### 3. クライアント側 in-memory + sessionStorage cache

`src/lib/cache/image-url-cache.ts`:

- `imageId × size` を key に URL + `expiresAt` を保持
- 取得時、 残り有効時間が 30 秒以上あれば cache を返す
- sessionStorage に永続化 (タブ生存中なら復元、 タブ閉じで自動失効)
- **サインアウト時に `clearAll()` を呼ぶ**

このキャッシュは presigned URL endpoint のリクエスト数をさらに削減する (HTTP cache + アプリ層 cache の二段構え)。

## 代替案

### A. `Cache-Control: private, no-store` のまま

- 利点: 完全に短期キャッシュなし、 セキュリティ最高
- 欠点: presigned URL の TTL を活かせず、 ネットワーク往復が無駄
- **却下**: TTL 30 分という設計時点でブラウザ cache の必要性はある

### B. `max-age` を 30 分 (TTL 一致)

- 利点: cache hit 率が最大
- 欠点: TTL ぎりぎりまで使うと、 表示中に URL が失効する可能性
- **却下**: 5 分の安全マージンで実用上の cache hit 率は十分

### C. transformation を画像ごとに細分化 (e.g., width=80, 160, 320)

- 利点: より厳密な最小化
- 欠点: cache key が増え管理コスト上昇、 SUpabase transformation 回数増
- **却下**: thumbnail / preview の 2 段で UI 上は十分

### D. blurhash / LQIP placeholder

- 別 ISSUE (将来) で検討、 本 ADR の範囲外

## 影響 (Consequences)

### Positive

- 主要画面の LCP が **桁オーダーで改善** 見込み (10s → 1s 台)
- Supabase の signed URL 生成回数削減 → Free tier 制限への余裕
- ブラウザ帯域の節約 → モバイルユーザーのデータ通信量削減
- 「責めない」 原則: cache 失効時は ❀ placeholder の既存パスで吸収

### Negative

- transformation が Supabase Storage の Image Optimization 機能に依存。 Free plan で月間 utilization 上限あり (要モニタ)
- cache が古い URL を返したまま TTL 切れ → `<img onerror>` で fallback を入れることが望ましい (本 ADR では将来 Issue)
- sessionStorage を介すため、 同一ブラウザを家族で共有する場合、 タブが開いている間は URL がメモリ上に残る
  - 緩和: `private` で 共有 cache 禁止、 サインアウトで `clearAll`、 タブ閉じで自動失効

### Risks

- Supabase image transformation が Free tier で枯渇したら fallback (原寸を返す) が必要 → 監視 + 将来 Issue
- 5 分 cache でも、 アプリ内で削除した画像の URL が残る可能性 → 削除 mutation 完了時に該当 key を `clear()` するのが望ましい (本 ADR は cache 機構のみ、 削除連動は将来 Issue)

## 関連

- ISSUE-016 (パフォーマンス計測ベースライン)
- ISSUE-019 (本 ADR の実装)
- ISSUE-018 (memories list を BFF 化、 cover URL を含める)
- ISSUE-028 (next/image 全面移行、 さらに format optimization)
- ADR-0009 (画像 storage 設計、 EXIF 削除 / storage_key 命名)
- CLAUDE.md §7 (本 ADR で更新)
