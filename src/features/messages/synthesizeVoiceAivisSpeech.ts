import { Talk } from './messages'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceAivisSpeechApi(
  talk: Talk,
  speaker: string,
  speed: number,
  pitch: number,
  intonationScale: number,
  serverUrl: string,
  tempoDynamics?: number,
  prePhonemeLength?: number,
  postPhonemeLength?: number
): Promise<ArrayBuffer> {
  return synthesizeVoiceApi(
    '/api/tts-aivisspeech',
    {
      text: talk.message,
      speaker,
      speed,
      pitch,
      intonationScale,
      serverUrl,
      tempoDynamics,
      prePhonemeLength,
      postPhonemeLength,
    },
    'AivisSpeech',
    {
      buildErrorMessage: (res) =>
        `AivisSpeechからの応答が異常です。ステータスコード: ${res.status}`,
    }
  )
}
