import { Talk } from './messages'
import { Language } from '@/features/constants/settings'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceCartesiaApi(
  talk: Talk,
  apiKey: string,
  voiceId: string,
  language: Language
) {
  if (!apiKey.trim()) {
    throw new Error('CartesiaのAPIキーが設定されていません')
  }
  if (!voiceId.trim()) {
    throw new Error('CartesiaのVoice IDが設定されていません')
  }
  if (!talk.message.trim()) {
    throw new Error('合成するメッセージが空です')
  }

  return synthesizeVoiceApi(
    '/api/cartesia',
    { message: talk.message, voiceId, apiKey, language },
    'Cartesia',
    {
      buildErrorMessage: async (res) => {
        const errorText = await res
          .text()
          .catch(() => 'エラー詳細を取得できませんでした')
        return `Cartesia APIからの応答が異常です。ステータスコード: ${res.status}, エラー詳細: ${errorText}`
      },
    }
  )
}
