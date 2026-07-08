import { Talk } from './messages'
import { Language } from '@/features/constants/settings'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceElevenlabsApi(
  talk: Talk,
  apiKey: string,
  voiceId: string,
  language: Language
) {
  return synthesizeVoiceApi(
    '/api/elevenLabs',
    { message: talk.message, voiceId, apiKey, language },
    'ElevenLabs'
  )
}
