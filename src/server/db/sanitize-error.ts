// 接続失敗時のエラーメッセージから DB password を除去する。
// password が log や ProblemDetails.detail に漏れることを防ぐ。

const URL_WITH_CREDENTIALS = /(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/g

export function sanitizeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(URL_WITH_CREDENTIALS, '$1***$2')
}
