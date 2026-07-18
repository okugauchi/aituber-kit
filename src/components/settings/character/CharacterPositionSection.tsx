import { logger } from '@/lib/logger'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

import homeStore from '@/features/stores/home'
import settingsStore, { SettingsState } from '@/features/stores/settings'
import toastStore from '@/features/stores/toast'
import { generateMessageId } from '@/utils/messageUtils'

interface CharacterPositionSectionProps {
  modelType: SettingsState['modelType']
  fixedCharacterPosition: boolean
}

export const CharacterPositionSection = ({
  modelType,
  fixedCharacterPosition,
}: CharacterPositionSectionProps) => {
  const { t } = useTranslation()
  const [presetName, setPresetName] = useState('')

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

      {/* Position Presets */}
      <div className="mt-6 border-t border-gray-300 pt-4">
        <div className="text-lg font-bold mb-2">Position Presets</div>

        {/* Existing presets list */}
        <div className="space-y-1 mb-3">
          {settingsStore.getState().positionPresets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-gray-800/20"
            >
              <span className="flex-1">{preset.name}</span>
              <button
                className="text-blue-400 hover:text-blue-300 text-xs"
                onClick={() => {
                  const { viewer, live2dViewer } = homeStore.getState()
                  if (modelType === 'vrm' && viewer) {
                    ;(viewer as any).saveCameraPosition()
                  }
                  settingsStore.setState({
                    characterPosition: preset.position,
                    characterRotation: preset.rotation,
                    lightingIntensity: preset.lightingIntensity,
                    fixedCharacterPosition: preset.fixedPosition,
                    activePositionPresetId: preset.id,
                  })
                  toastStore.getState().addToast({
                    message: `Applied preset: ${preset.name}`,
                    type: 'success',
                    tag: `preset-${preset.id}`,
                  })
                }}
              >
                Apply
              </button>
              <button
                className="text-red-400 hover:text-red-300 text-xs"
                onClick={() => {
                  settingsStore.setState({
                    positionPresets: settingsStore
                      .getState()
                      .positionPresets.filter((p) => p.id !== preset.id),
                    activePositionPresetId:
                      settingsStore.getState().activePositionPresetId ===
                      preset.id
                        ? null
                        : settingsStore.getState().activePositionPresetId,
                  })
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Save current as preset */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Preset name..."
            className="flex-1 bg-transparent border border-white/30 rounded px-2 py-1 text-sm"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            className="text-xs bg-primary hover:bg-primary-hover px-3 py-1 rounded transition-colors"
            onClick={() => {
              const settings = settingsStore.getState()
              const newPreset = {
                id: generateMessageId(),
                name: presetName || `Preset ${settings.positionPresets.length + 1}`,
                position: settings.characterPosition,
                rotation: settings.characterRotation,
                lightingIntensity: settings.lightingIntensity,
                fixedPosition: settings.fixedCharacterPosition,
              }
              settingsStore.setState({
                positionPresets: [...settings.positionPresets, newPreset],
              })
              setPresetName('')
              toastStore.getState().addToast({
                message: `Saved preset: ${newPreset.name}`,
                type: 'success',
                tag: `preset-saved-${newPreset.id}`,
              })
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
