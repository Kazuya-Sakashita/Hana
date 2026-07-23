export const settingsTrustCenterCopy = {
  page: {
    eyebrow: 'Hana',
    title: 'せってい',
    description: '写真、AI、データの扱いをここで確認できます。',
  },
  current: {
    eyebrow: '今できること',
    childRegisteredTitle: (childName: string) => `${childName} ちゃんの記録を残せます`,
    emptyTitle: '記録をはじめられます',
    description: '写真からページを作り、アルバムにしまうための場所です。',
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
    description: 'AI を使わずに、写真とことばだけでページを残すこともできます。',
    sentLabel: 'おくるもの',
    sentValue: 'しゃしん / 登録した呼び名 / 月齢 / ひにち / てんき / ひとこと',
    notSentLabel: 'おくらないもの',
    notSentValue:
      'たんじょうび / メール / じゅうしょ / 位置情報 / 画像URL / presigned URL / 保存先のキー',
    handlingLabel: 'データの扱い',
    handlingValue:
      'Anthropic Claude API の入出力は通常30日以内に削除されますが、安全確認など一部例外があります。',
    choiceLabel: 'AI を使わない選択',
    choiceValue: '記録画面で、AI を使わずに写真とことばだけで保存できます。',
  },
  data: {
    eyebrow: 'データと削除',
    title: '約束できる範囲だけを表示します',
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
    description:
      'プロフィール編集、export、退会、家族共有、Hana Plus は、操作できる状態になってから表示します。',
    unavailable: '今は操作できません。',
    items: ['プロフィール編集', 'export / 退会', '家族共有 / Hana Plus'] as const,
  },
} as const
