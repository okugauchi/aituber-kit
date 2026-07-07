import { Talk } from './messages'
import { Language } from '@/features/constants/settings'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeStyleBertVITS2Api(
  talk: Talk,
  stylebertvits2ServerUrl: string,
  stylebertvits2ApiKey: string,
  stylebertvits2ModelId: string,
  stylebertvits2Style: string,
  stylebertvits2SdpRatio: number,
  stylebertvits2Length: number,
  selectLanguage: Language
) {
  return synthesizeVoiceApi(
    '/api/stylebertvits2',
    {
      message: talk.message,
      stylebertvits2ServerUrl: stylebertvits2ServerUrl,
      stylebertvits2ApiKey: stylebertvits2ApiKey,
      stylebertvits2ModelId: stylebertvits2ModelId,
      stylebertvits2Style: stylebertvits2Style,
      stylebertvits2SdpRatio: stylebertvits2SdpRatio,
      stylebertvits2Length: stylebertvits2Length,
      selectLanguage: selectLanguage,
      type: 'stylebertvits2',
    },
    'StyleBertVITS2'
  )
}
