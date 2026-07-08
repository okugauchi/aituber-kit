import { useTranslation } from 'react-i18next'

import settingsStore from '@/features/stores/settings'

interface GsviTtsSettingsProps {
  gsviTtsServerUrl: string
  gsviTtsModelId: string
  gsviTtsBatchSize: number
  gsviTtsSpeechRate: number
}

export const GsviTtsSettings = ({
  gsviTtsServerUrl,
  gsviTtsModelId,
  gsviTtsBatchSize,
  gsviTtsSpeechRate,
}: GsviTtsSettingsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <div className="my-2 text-sm whitespace-pre-wrap">{t('GSVITTSInfo')}</div>
      <div className="mt-4 font-bold">{t('GSVITTSServerUrl')}</div>
      <div className="mt-2">
        <input
          className="text-ellipsis px-4 py-2 w-full bg-white hover:bg-white-hover rounded-lg"
          type="text"
          placeholder="..."
          value={gsviTtsServerUrl}
          onChange={(e) =>
            settingsStore.setState({
              gsviTtsServerUrl: e.target.value,
            })
          }
        />
      </div>
      <div className="mt-4 font-bold">{t('GSVITTSModelID')}</div>
      <div className="mt-2">
        <input
          className="text-ellipsis px-4 py-2 w-full bg-white hover:bg-white-hover rounded-lg"
          type="text"
          placeholder="..."
          value={gsviTtsModelId}
          onChange={(e) =>
            settingsStore.setState({ gsviTtsModelId: e.target.value })
          }
        />
      </div>
      <div className="mt-4 font-bold">{t('GSVITTSBatchSize')}</div>
      <div className="mt-2">
        <input
          className="text-ellipsis px-4 py-2 w-full bg-white hover:bg-white-hover rounded-lg"
          type="number"
          step="1"
          placeholder="..."
          value={gsviTtsBatchSize}
          onChange={(e) =>
            settingsStore.setState({
              gsviTtsBatchSize: parseFloat(e.target.value),
            })
          }
        />
      </div>
      <div className="mt-4 font-bold">{t('GSVITTSSpeechRate')}</div>
      <div className="mt-2">
        <input
          className="text-ellipsis px-4 py-2 w-full bg-white hover:bg-white-hover rounded-lg"
          type="number"
          step="0.1"
          placeholder="..."
          value={gsviTtsSpeechRate}
          onChange={(e) =>
            settingsStore.setState({
              gsviTtsSpeechRate: parseFloat(e.target.value),
            })
          }
        />
      </div>
    </>
  )
}
