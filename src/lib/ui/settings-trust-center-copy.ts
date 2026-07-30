export const settingsTrustCenterCopy = {
  page: {
    eyebrow: 'Hana',
    title: 'せってい',
    description: 'できることと、まだ約束しないことを分けて確認できます。',
  },
  current: {
    eyebrow: '概要',
    childRegisteredTitle: (childName: string) => `${childName} ちゃんの記録を残せます`,
    emptyTitle: '記録をはじめられます',
    description: 'いま触れる機能だけをまとめています。AI、削除、将来項目は下で分けて確認できます。',
    childLabel: 'お子さん',
    missingChild: 'まだ登録されていません。',
    ageLabel: 'いまの月齢',
    accountLabel: 'サインイン',
    accountValue: (email: string | null | undefined) =>
      `${email ?? 'メール未設定'} の Google アカウントで利用しています。`,
  },
  ai: {
    eyebrow: 'AI と写真',
    enabledTitle: 'AI の下書きを使えます',
    disabledTitle: 'AI は同意後だけ使います',
    description: 'AI を使わない選択を残したまま、送るものと送らないものを分けて表示します。',
    sentLabel: 'おくるもの',
    sentValue: 'しゃしん / 登録した呼び名 / 月齢 / ひにち / てんき / ひとこと',
    notSentLabel: 'おくらないもの',
    notSentValue:
      'たんじょうび / メール / じゅうしょ / 位置情報 / 画像URL / presigned URL / 保存先のキー',
    handlingLabel: 'データの扱い',
    handlingValue:
      'Anthropic の商用 API 条件と Hana のプライバシーレビューに沿って扱います。確認した範囲だけを表示します。',
    choiceLabel: 'AI を使わない選択',
    choiceValue: '記録画面で、AI を使わずに写真とことばだけで保存できます。',
    revokeButton: 'AI 利用の同意を取り消す',
    revokeDialogTitle: 'AI 利用の同意を 取り消しますか？',
    revokeDialogDescription:
      '取り消した後、新しくAIの下書きを作るには、もう一度同意が必要です。AIを使わずに記録を残すことは続けられます。この操作は、保存済みの記録や、過去にAIへ送信したデータの個別削除を行う手続きではありません。撤回前に開始したAI生成は完了する場合があります。',
    revokeCancel: '同意を そのままにする',
    revokeConfirm: '同意を 取り消す',
    revokePending: '同意を 取り消しています…',
    revokeDone: 'AI利用の同意を取り消しました。AIを使わずに、写真とことばの記録を続けられます。',
    revokeFailed:
      'AI利用の同意状態を確認できませんでした。通信が戻ったら再読み込みして確認するか、もう一度取り消してください。',
  },
  data: {
    eyebrow: 'データと削除',
    title: '削除と証跡は、約束できる範囲だけ',
    description:
      '記録を削除すると、アルバムには表示されなくなります。復元機能は今は提供していません。',
    memoryDeleteLabel: '記録の削除',
    memoryDeleteValue:
      '削除前に確認画面を出します。完全削除や復元可能期間は、この画面では約束しません。',
    evidenceLabel: '証跡',
    evidenceValue:
      'サポートやレビュー用の証跡に、実写真・実名・メール・生年月日・画像URL・presigned URL・保存先のキー・prompt・AI生成本文は残しません。',
  },
  future: {
    eyebrow: '準備中',
    title: 'まだこの画面では操作できません',
    description: 'export、退会、家族共有、Hana Plus は、操作できる状態になってから表示します。',
    unavailable: '今は操作できません。',
    items: ['export / 退会', '家族共有 / Hana Plus'] as const,
  },
} as const
