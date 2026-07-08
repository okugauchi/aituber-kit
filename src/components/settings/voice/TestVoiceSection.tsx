import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AIVoice } from '@/features/constants/settings'
import { testVoice } from '@/features/messages/speakCharacter'
import { TextButton } from '../../textButton'

interface TestVoiceSectionProps {
  selectVoice: AIVoice
}

export const TestVoiceSection = ({ selectVoice }: TestVoiceSectionProps) => {
  const { t } = useTranslation()
  const [customVoiceText, setCustomVoiceText] = useState<string>('')

  return (
    <div className="mt-10 p-4 bg-gray-50 rounded-lg">
      <div className="mb-4 text-xl font-bold">{t('TestVoiceSettings')}</div>
      <div className="flex items-center">
        <input
          className="flex-1 px-4 py-2 bg-white hover:bg-white-hover rounded-lg"
          type="text"
          placeholder={t('CustomVoiceTextPlaceholder')}
          value={customVoiceText}
          onChange={(e) => setCustomVoiceText(e.target.value)}
        />
      </div>
      <div className="flex items-center mt-4">
        <TextButton
          onClick={() => testVoice(selectVoice, customVoiceText)}
          disabled={!customVoiceText}
        >
          {t('TestSelectedVoice')}
        </TextButton>
      </div>
    </div>
  )
}
