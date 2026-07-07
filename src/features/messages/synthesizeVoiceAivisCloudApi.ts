import { Talk } from './messages'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceAivisCloudApi(
  talk: Talk,
  apiKey: string,
  modelUuid: string,
  styleId: number,
  styleName: string,
  useStyleName: boolean,
  speed: number,
  pitch: number,
  emotionalIntensity: number,
  tempoDynamics: number,
  prePhonemeLength: number,
  postPhonemeLength: number
): Promise<ArrayBuffer> {
  return synthesizeVoiceApi(
    '/api/tts-aivis-cloud-api',
    {
      text: talk.message,
      apiKey,
      modelUuid,
      styleId,
      styleName,
      useStyleName,
      speed,
      pitch,
      emotionalIntensity,
      tempoDynamics,
      prePhonemeLength,
      postPhonemeLength,
      outputFormat: 'mp3',
    },
    'Aivis Cloud API',
    {
      buildErrorMessage: async (res) => {
        const errorData = await res.json().catch(() => ({}))
        const errorMessage = errorData.error || `HTTP ${res.status}`
        return `Aivis Cloud APIからの応答が異常です: ${errorMessage}`
      },
    }
  )
}
