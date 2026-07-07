import { useTranslation } from 'react-i18next'

import { AIVoice } from '@/features/constants/settings'
import settingsStore from '@/features/stores/settings'

interface VoiceEngineSelectorProps {
  selectVoice: AIVoice
}

export const VoiceEngineSelector = ({
  selectVoice,
}: VoiceEngineSelectorProps) => {
  const { t } = useTranslation()

  return (
    <>
      <div className="mb-4 text-xl font-bold">
        {t('SyntheticVoiceEngineChoice')}
      </div>
      <div className="my-2 text-sm whitespace-pre-wrap">
        {t('VoiceEngineInstruction')}
      </div>
      <div className="my-2">
        <select
          value={selectVoice}
          onChange={(e) =>
            settingsStore.setState({ selectVoice: e.target.value as AIVoice })
          }
          className="px-4 py-2 bg-white hover:bg-white-hover rounded-lg"
        >
          <option value="voicevox">{t('UsingVoiceVox')}</option>
          <option value="koeiromap">{t('UsingKoeiromap')}</option>
          <option value="google">{t('UsingGoogleTTS')}</option>
          <option value="stylebertvits2">{t('UsingStyleBertVITS2')}</option>
          <option value="aivis_speech">{t('UsingAivisSpeech')}</option>
          <option value="aivis_cloud_api">{t('UsingAivisCloudAPI')}</option>
          <option value="gsvitts">{t('UsingGSVITTS')}</option>
          <option value="elevenlabs">{t('UsingElevenLabs')}</option>
          <option value="cartesia">{t('UsingCartesia')}</option>
          <option value="openai">{t('UsingOpenAITTS')}</option>
          <option value="azure">{t('UsingAzureTTS')}</option>
        </select>
      </div>
    </>
  )
}
