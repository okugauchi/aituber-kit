import { Talk } from './messages'
import { Language, VoiceLanguage } from '@/features/constants/settings'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceGoogleApi(
  talk: Talk,
  googleTtsType: string,
  selectLanguage: Language
) {
  const googleTtsTypeByLang = getGoogleTtsType(googleTtsType, selectLanguage)
  const languageCode = getVoiceLanguageCode(selectLanguage)

  return synthesizeVoiceApi(
    '/api/tts-google',
    { message: talk.message, ttsType: googleTtsTypeByLang, languageCode },
    'Google Text-to-Speech',
    {
      parseResponse: async (res) => {
        const data = await res.json()

        // Base64文字列をデコードしてArrayBufferに変換
        const binaryStr = atob(data.audio)
        const uint8Array = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          uint8Array[i] = binaryStr.charCodeAt(i)
        }
        return uint8Array.buffer as ArrayBuffer
      },
    }
  )
}

function getGoogleTtsType(
  googleTtsType: string,
  selectLanguage: Language
): string {
  if (googleTtsType && googleTtsType.trim()) return googleTtsType

  switch (selectLanguage) {
    case 'ja':
      return 'ja-JP-Standard-B'
    case 'en':
      return 'en-US-Neural2-F'
    case 'ko':
      return 'ko-KR-Neural2-A'
    case 'zh-CN':
      return 'cmn-CN-Standard-A'
    case 'zh-TW':
      return 'cmn-TW-Standard-A'
    case 'vi':
      return 'vi-VN-Standard-A'
    case 'fr':
      return 'fr-FR-Standard-A'
    case 'es':
      return 'es-ES-Standard-A'
    case 'pt':
      return 'pt-PT-Standard-A'
    case 'de':
      return 'de-DE-Standard-A'
    case 'ru':
      return 'ru-RU-Standard-A'
    case 'it':
      return 'it-IT-Standard-A'
    case 'ar':
      return 'ar-XA-Standard-A'
    case 'hi':
      return 'hi-IN-Standard-A'
    case 'pl':
      return 'pl-PL-Standard-A'
    case 'th':
      return 'th-TH-Standard-A'
    default:
      return 'en-US-Neural2-F'
  }
}

function getVoiceLanguageCode(selectLanguage: Language): VoiceLanguage {
  switch (selectLanguage) {
    case 'ja':
      return 'ja-JP'
    case 'en':
      return 'en-US'
    case 'ko':
      return 'ko-KR'
    case 'zh-CN':
      return 'zh-CN'
    case 'zh-TW':
      return 'zh-TW'
    case 'vi':
      return 'vi-VN'
    case 'fr':
      return 'fr-FR'
    case 'es':
      return 'es-ES'
    case 'pt':
      return 'pt-PT'
    case 'de':
      return 'de-DE'
    case 'ru':
      return 'ru-RU'
    case 'it':
      return 'it-IT'
    case 'ar':
      return 'ar-SA'
    case 'hi':
      return 'hi-IN'
    case 'pl':
      return 'pl-PL'
    case 'th':
      return 'th-TH'
    default:
      return 'en-US'
  }
}
