import { EmotionType, Talk } from './messages'
import { KoeiroParam } from '@/features/constants/koeiroParam'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceKoeiromapApi(
  talk: Talk,
  apiKey: string,
  koeiroParam: KoeiroParam
) {
  const reducedStyle = emotionToTalkStyle(talk.emotion)

  return synthesizeVoiceApi(
    '/api/tts-koeiromap',
    {
      message: talk.message,
      speakerX: koeiroParam.speakerX,
      speakerY: koeiroParam.speakerY,
      style: reducedStyle,
      apiKey: apiKey,
    },
    'Koeiromap',
    {
      parseResponse: async (res) => {
        const data = await res.json()
        const url = data.audio

        if (url == null) {
          throw new Error('Koeiromap APIから音声URLが返されませんでした')
        }

        const resAudio = await fetch(url)
        if (!resAudio.ok) {
          throw new Error(
            `Koeiromap音声ファイルの取得に失敗しました。ステータスコード: ${resAudio.status}`
          )
        }

        return resAudio.arrayBuffer()
      },
    }
  )
}

const emotionToTalkStyle = (emotion: EmotionType): string => {
  switch (emotion) {
    case 'angry':
      return 'angry'
    case 'happy':
      return 'happy'
    case 'sad':
      return 'sad'
    default:
      return 'talk'
  }
}
