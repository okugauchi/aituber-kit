import { Talk } from './messages'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceVoicevoxApi(
  talk: Talk,
  speaker: string,
  speed: number,
  pitch: number,
  intonation: number,
  serverUrl: string
): Promise<ArrayBuffer> {
  return synthesizeVoiceApi(
    '/api/tts-voicevox',
    { text: talk.message, speaker, speed, pitch, intonation, serverUrl },
    'VOICEVOX',
    {
      buildErrorMessage: (res) =>
        `VOICEVOXからの応答が異常です。ステータスコード: ${res.status}`,
    }
  )
}
