# LP 公開前 QA / Trust Gate

作成日: 2026-07-25

対象 Issue: `ISSUE-075`

## 目的

公開前検証 LP (`/lp`) とプライバシーポリシー草案 (`/privacy`) を、実ブラウザ QA と trust copy の人間レビューに通せる状態へ近づける。
この文書は公開可否の最終承認ではなく、機械確認の evidence と人間が判断すべき copy の切り分けを残す。

## Evidence Safety

- screenshot、accessibility snapshot、trace、HAR は保存しない。
- 実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールアドレスを evidence に含めない。
- 待機リスト送信は Playwright route mock で 202 を返し、送信 payload の値を出力しない。
- 画像 payload は host を出さず、path と size summary だけを扱う。

## Automated QA

CI では contract mode だけを実行し、artifact を書き込まない。

```bash
pnpm qa:issue075:lp-public -- --mode=contract
```

実ブラウザ確認は local app server に対して app mode を実行する。

```bash
CODEX_RUNTIME_NODE_MODULES=<node_modules-with-playwright> \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
node scripts/qa/issue-075-lp-public-qa.cjs --mode=app
```

### 2026-07-25 Local Result

| Surface     | Viewports                               | Result | Notes                                                                          |
| ----------- | --------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `/lp`       | 390x844 / 430x932 / 768x1024 / 1280x900 | pass   | route load、heading、tap target、overlap、focus、overflow、reduced motion pass |
| `/privacy`  | 390x844 / 430x932 / 768x1024 / 1280x900 | pass   | route load、heading、tap target、overlap、focus、overflow、reduced motion pass |
| no-JS `/lp` | 390x844                                 | pass   | JavaScript 無効時は form を非表示にし、fallback notice を表示                  |

App mode output は redacted summary のみ:

- target surfaces: `/lp`, `/privacy`
- viewport widths: 390 / 430 / 768 / 1280
- waitlist submit: mocked 202, response text only
- image payload: path + transfer / encoded size only。LP synthetic SVG は static asset 4,388 bytes、transfer 1,883 bytes、encoded body 1,583 bytes
- LCP: timing and size only。`/lp` は 390px 80ms、430px 44ms、768px 60ms、1280px 52ms

### Build Route Evidence

`pnpm build:ci` で `/lp` と `/privacy` は static route として生成された。

## Trust Copy Review Draft

次の copy は安全側ドラフトとして公開候補に残してよいか、人間レビューで確認する。

| Area             | Current Copy / Meaning                                                               | Risk   | Review Ask                           |
| ---------------- | ------------------------------------------------------------------------------------ | ------ | ------------------------------------ |
| AI consent       | AI は同意後だけ。使わずに保存でき、保存前にことばを直せる                            | Low    | 表現として過不足がないか確認する     |
| Waitlist purpose | 待機リスト、β版案内、任意のインタビュー、正式リリースのお知らせに限定する            | Low    | 目的限定として公開してよいか確認する |
| Data collected   | 待機リストフォームではメールアドレスのみ。子どもの名前、写真、生年月日等は取得しない | Low    | LP form の範囲として正しいか確認する |
| Management       | 認証とアクセス制御が可能な管理環境で扱う                                             | Medium | 実運用サービス決定後に具体化する     |
| Third-party use  | 広告配信や無関係な案内のために第三者へ提供しない                                     | Medium | 法務観点で表現の強さを確認する       |
| Stop / deletion  | 案内停止や登録情報削除の導線を公開前の運用開始までに明記する                         | Medium | 連絡先と処理手順を決める             |

## Do Not Publish Without Human Review

以下は、現時点では LP / privacy copy に断定として追加しない。

- vendor retention の具体日数
- zero data retention の適用断定
- AI model training に関する vendor claim の断定
- 退会・削除の完全保証
- メール配信基盤、配信停止、削除依頼の運用手順が未決定のままの確定表現

## Human Review Questions

1. 現在の `/lp` と `/privacy` の trust copy を、公開前検証の候補文言としてレビュー対象に進めてよいですか。
2. 待機リストの案内停止・削除依頼の連絡手段は、公開時点で何を表示しますか。
3. β版案内や正式リリース通知に使うメール配信基盤は、公開前に明記できる状態ですか。

## Launch Gate

機械 QA は pass。公開 traffic に載せる前に、上記 human review questions を解消し、必要な copy 修正後に再度 app mode QA と `pnpm pr:gate` を実行する。
