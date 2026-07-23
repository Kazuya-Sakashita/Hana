export const quietStateCopy = {
  common: {
    loading: 'ページを ひらいています…',
    openFailedTitle: 'うまく ひらけませんでした',
    openFailedDescription: 'ネットワークの ちょうしを たしかめて、もういちど ためしてください。',
    retryOpen: 'もういちど ひらく',
  },
  signIn: {
    pending: 'Google に つないでいます…',
    failed: 'サインインを はじめられませんでした。少しおいて、もういちど ためしてください。',
  },
  onboarding: {
    pending: 'ページを 用意しています…',
    validationFailed: 'まだ 直せるところがあります。入力はそのままなので、たしかめてください。',
    saveFailed:
      'うまく ほぞんできませんでした。入力はそのままなので、もういちど ためしてください。',
    networkFailed:
      'うまく つうしんできませんでした。入力はそのままなので、もういちど ためしてください。',
  },
  record: {
    uploadPreparing: 'しゃしんを ひらいています…',
    uploadUploading: 'しゃしんを たいせつに あずかっています…',
    uploadConfirming: 'ページに のせる 準備をしています…',
    uploadDone: 'しゃしんを 受けとりました',
    uploadFailed: 'しゃしんを 受けとれませんでした。写真を かえて、もういちど ためしてください。',
    aiReady: 'AI が、ことばの下書きを手伝えます。',
    aiWaitingHint: 'できあがったら、自由に なおせます。',
    aiDone: 'タイトルと ほんぶんに、ていあんを いれました。じゆうに なおせます。',
    aiFailed: 'ことばの ていあんを つくれませんでした。AI を使わずに、このまま残せます。',
    aiQuotaExceeded: '今月の AI 提案は ここまでです。AI を使わずに、このまま残せます。',
    consentSaveFailed: '同意を ほぞんできませんでした。もういちど ためしてください。',
    validationFailed:
      'まだ 直せるところがあります。入力を たしかめて、もういちど ためしてください。',
    saveFailedTitle: 'ページを しまえませんでした',
    saveFailedDescription: '入力はそのままです。もういちど ためしてください。',
    saveDoneTitle: 'ページを しまいました',
    saveDoneDescription: 'アルバムに ならべました。',
    submitting: 'ページを しまっています…',
  },
  album: {
    loadMoreFailed:
      'つづきのページを ひらけませんでした。少しおいて、もういちど ためしてください。',
    loadMorePending: 'つづきを ひらいています…',
    loadMoreButton: 'まえのページも みる',
    loadMoreDone: 'すべて表示しました。',
    emptyTitle: 'まだ ページが ありません',
    emptyDescription: 'きょうの 1 まいから、はじめましょう。',
    favoriteFailedTitle: 'しるしを かえられませんでした',
    favoriteFailedDescription: 'ページはそのままです。もういちど ためしてください。',
  },
  memoryDetail: {
    favoriteFailedTitle: 'しるしを かえられませんでした',
    favoriteFailedDescription: 'ページはそのままです。もういちど ためしてください。',
    deleteFailedTitle: 'ページを しまい直しました',
    deleteFailedDescription: 'アルバムに もどしました。もういちど ためしてください。',
    deleteConfirmTitle: 'このページを、けしますか',
    deleteConfirmDescription: 'このページは、アルバムに 表示されなくなります。',
    deletePending: 'アルバムから はずしています…',
    deleteConfirmAction: 'けす',
  },
} as const

export function recordAiGeneratingCopy(childName: string): string {
  const subject = childName.trim() ? `${childName.trim()} ちゃんの ページ` : 'このページ'
  return `${subject}に そえる ことばを 探しています…`
}

export function deleteMemoryDescription(childName: string): string {
  const subject = childName.trim() ? `${childName.trim()} ちゃんの このページ` : 'このページ'
  return `${subject}は、アルバムに 表示されなくなります。`
}

export function albumLoadMoreStatus(addedCount: number, hasMore: boolean): string {
  if (addedCount <= 0) return quietStateCopy.album.loadMoreDone
  const addedMessage = `さらに ${addedCount} 件 ひらきました。`
  return hasMore ? addedMessage : `${addedMessage}${quietStateCopy.album.loadMoreDone}`
}
