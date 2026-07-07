import { logger } from '@/lib/logger'
import { useTranslation } from 'react-i18next'

import homeStore from '@/features/stores/home'
import settingsStore, { SettingsState } from '@/features/stores/settings'
import toastStore from '@/features/stores/toast'

interface CharacterPositionSectionProps {
  modelType: SettingsState['modelType']
  fixedCharacterPosition: boolean
}

export const CharacterPositionSection = ({
  modelType,
  fixedCharacterPosition,
}: CharacterPositionSectionProps) => {
  const { t } = useTranslation()

  const handlePositionAction = (action: 'fix' | 'unfix' | 'reset') => {
    try {
      const { viewer, live2dViewer } = homeStore.getState()

      if (modelType === 'vrm') {
        const methodMap = {
          fix: 'fixCameraPosition',
          unfix: 'unfixCameraPosition',
          reset: 'resetCameraPosition',
        }
        const method = methodMap[action]
        if (viewer && typeof (viewer as any)[method] === 'function') {
          ;(viewer as any)[method]()
        } else {
          throw new Error(`VRM viewer method ${method} not available`)
        }
      } else if (live2dViewer) {
        const methodMap = {
          fix: 'fixPosition',
          unfix: 'unfixPosition',
          reset: 'resetPosition',
        }
        const method = methodMap[action]
        if (typeof (live2dViewer as any)[method] === 'function') {
          ;(live2dViewer as any)[method]()
        } else {
          throw new Error(`Live2D viewer method ${method} not available`)
        }
      }

      const messageMap = {
        fix: t('Toasts.PositionFixed'),
        unfix: t('Toasts.PositionUnfixed'),
        reset: t('Toasts.PositionReset'),
      }

      toastStore.getState().addToast({
        message: messageMap[action],
        type: action === 'fix' ? 'success' : 'info',
        tag: `position-${action}`,
      })
    } catch (error) {
      logger.error(`Position ${action} failed:`, error)
      toastStore.getState().addToast({
        message: t('Toasts.PositionActionFailed'),
        type: 'error',
        tag: 'position-error',
      })
    }
  }

  return (
    <div className="my-6">
      <div className="text-xl font-bold mb-4">{t('CharacterPosition')}</div>
      <div className="my-2 text-sm whitespace-pre-wrap">
        {t('CharacterPositionInfo')}
      </div>
      <div className="mb-2 text-sm font-medium">
        {t('CurrentStatus')}:{' '}
        <span className="font-bold">
          {fixedCharacterPosition ? t('PositionFixed') : t('PositionNotFixed')}
        </span>
      </div>
      <div className="flex gap-4 md:flex-row flex-col">
        <button
          onClick={() => handlePositionAction('fix')}
          className="px-4 py-3 text-theme font-medium bg-primary hover:bg-primary-hover active:bg-primary-press rounded-lg transition-colors duration-200 md:rounded-full md:px-6 md:py-2"
        >
          {t('FixPosition')}
        </button>
        <button
          onClick={() => handlePositionAction('unfix')}
          className="px-4 py-3 text-theme font-medium bg-primary hover:bg-primary-hover active:bg-primary-press rounded-lg transition-colors duration-200 md:rounded-full md:px-6 md:py-2"
        >
          {t('UnfixPosition')}
        </button>
        <button
          onClick={() => handlePositionAction('reset')}
          className="px-4 py-3 text-theme font-medium bg-primary hover:bg-primary-hover active:bg-primary-press rounded-lg transition-colors duration-200 md:rounded-full md:px-6 md:py-2"
        >
          {t('ResetPosition')}
        </button>
      </div>
      <div className="mt-4">
        <div className="text-sm text-gray-600 mb-2">{t('CopyEnvVarsInfo')}</div>
        <button
          onClick={async () => {
            const { viewer, live2dViewer } = homeStore.getState()
            if (modelType === 'vrm' && viewer) {
              ;(viewer as any).saveCameraPosition()
            } else if (live2dViewer) {
              ;(live2dViewer as any).saveModelPosition?.()
            }
            const settings = settingsStore.getState()
            const pos = settings.characterPosition
            const rot = settings.characterRotation
            const envText = [
              `NEXT_PUBLIC_FIXED_CHARACTER_POSITION="${settings.fixedCharacterPosition}"`,
              `NEXT_PUBLIC_CHARACTER_POSITION="${pos.x},${pos.y},${pos.z},${pos.scale}"`,
              `NEXT_PUBLIC_CHARACTER_ROTATION="${rot.x},${rot.y},${rot.z}"`,
            ].join('\n')
            try {
              await navigator.clipboard.writeText(envText)
              toastStore.getState().addToast({
                message: t('Toasts.EnvVarsCopied'),
                type: 'success',
                tag: 'env-vars-copied',
              })
            } catch (error) {
              logger.error('Env vars copy failed:', error)
              toastStore.getState().addToast({
                message: t('Errors.UnexpectedError'),
                type: 'error',
                tag: 'env-vars-copy-failed',
              })
            }
          }}
          className="px-4 py-3 text-theme font-medium bg-primary hover:bg-primary-hover active:bg-primary-press rounded-lg transition-colors duration-200 md:rounded-full md:px-6 md:py-2"
        >
          {t('CopyEnvVars')}
        </button>
      </div>
    </div>
  )
}
