export interface SynthesizeVoiceApiOptions<T> {
  buildErrorMessage?: (res: Response) => Promise<string> | string
  parseResponse?: (res: Response) => Promise<T>
}

/**
 * 11エンジン共通のTTS APIフェッチパターン（fetch → res.ok確認 → レスポンス変換 → サービス名付きエラーラップ）を集約したヘルパー。
 * エンジン固有のバリデーション（APIキー欠落チェック等）は各synthesizeVoice*.tsに残す。
 */
export async function synthesizeVoiceApi<T = ArrayBuffer>(
  endpoint: string,
  body: Record<string, unknown>,
  serviceName: string,
  options: SynthesizeVoiceApiOptions<T> = {}
): Promise<T> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const message = options.buildErrorMessage
        ? await options.buildErrorMessage(res)
        : `${serviceName}からの応答が異常です。ステータスコード: ${res.status}`
      throw new Error(message)
    }

    return options.parseResponse
      ? await options.parseResponse(res)
      : ((await res.arrayBuffer()) as unknown as T)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${serviceName}でエラーが発生しました: ${error.message}`)
    } else {
      throw new Error(`${serviceName}で不明なエラーが発生しました`)
    }
  }
}
