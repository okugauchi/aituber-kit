import { Talk } from './messages'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceAzureOpenAIApi(
  talk: Talk,
  apiKey: string,
  azureTTSEndpoint: string,
  voice: string,
  speed: number
): Promise<ArrayBuffer> {
  return synthesizeVoiceApi(
    '/api/azureOpenAITTS',
    { message: talk.message, voice, speed, apiKey, azureTTSEndpoint },
    'Azure OpenAI TTS'
  )
}
