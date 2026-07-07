import { Talk } from './messages'
import { Language } from '@/features/constants/settings'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceOpenAIApi(
  talk: Talk,
  apiKey: string,
  voice: string,
  model: string,
  speed: number
) {
  return synthesizeVoiceApi(
    '/api/openAITTS',
    {
      message: talk.message,
      voice: voice,
      model: model,
      speed: speed,
      apiKey: apiKey,
    },
    'OpenAI TTS',
    {
      buildErrorMessage: (res) =>
        `OpenAI APIからの応答が異常です。ステータスコード: ${res.status}`,
    }
  )
}
