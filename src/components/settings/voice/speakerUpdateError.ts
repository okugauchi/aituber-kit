export const getSpeakerUpdateErrorMessage = async (
  response: Response
): Promise<string> => {
  try {
    const data = (await response.json()) as { errorCode?: unknown }
    if (data.errorCode === 'ServerSecretAccessDenied') {
      return '話者リストの更新にはサーバー側リソース利用の許可が必要です。ローカル環境では .env.local に AITUBERKIT_SERVER_SECRET_ACCESS_MODE="unprotected" を設定してください。'
    }
  } catch {
    // Fall through to the generic message when the error response is not JSON.
  }

  return '話者リストの更新に失敗しました'
}
