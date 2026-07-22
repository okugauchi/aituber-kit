/**
 * CommandExecutor component.
 *
 * Polls the message gateway for queued commands (pose, splat, setting, chat-reset)
 * and executes them against the local stores and viewer.
 */
import { useEffect, useRef } from 'react'
import { logger } from '@/lib/logger'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { dequeueCommands } from '@/features/api/messageGateway'
import { resetSessionId } from '@/utils/sessionId'
import toastStore from '@/features/stores/toast'
import { getMemoryService } from '@/features/memory/memoryService'

const POLL_INTERVAL_MS = 1000

export default function CommandExecutor() {
  const viewerRef = useRef<ReturnType<typeof homeStore.getState>['viewer'] | null>(null)

  useEffect(() => {
    const interval = setInterval(async () => {
      const clientId = settingsStore.getState().clientId || 'default'
      const commands = dequeueCommands(clientId)
      if (commands.length === 0) return

      for (const cmd of commands) {
        try {
          await executeCommand(cmd)
        } catch (error) {
          logger.error('Failed to execute command:', error, cmd)
        }
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  return null
}

async function executeCommand(cmd: {
  command: string
  pose?: { poseId: string }
  splat?: { action: string; args?: Record<string, unknown> }
  setting?: { key: string; value: unknown }
}) {
  const store = homeStore.getState()
  const viewer = store.viewer
  const settings = settingsStore.getState()

  switch (cmd.command) {
    case 'stop': {
      // Stop is handled by the existing messageReceiver polling — ignore here
      break
    }

    case 'pose': {
      if (!cmd.pose?.poseId) break
      const poseId = cmd.pose.poseId

      // Special case: reset to idle
      if (poseId === '__reset__') {
        const model = viewer?.model
        if (model?.mixer && model?.poseManager) {
          model.poseManager.resetToIdle(model)
        }
        break
      }

      const poseConfig = settings.poseConfigs.find((p) => p.id === poseId)
      if (!poseConfig) {
        logger.warn(`Unknown pose: ${poseId}`)
        break
      }

      // Apply pose via the VRM model
      const model = viewer?.model
      if (model?.vrm && model?.mixer && model?.poseManager) {
        await model.poseManager.applyPose(model, poseId, poseConfig)
      }
      break
    }

    case 'splat': {
      if (!cmd.splat) break
      const { action, args } = cmd.splat

      switch (action) {
        case 'move': {
          const dx = (args?.dx as number) ?? 0
          const dy = (args?.dy as number) ?? 0
          const dz = (args?.dz as number) ?? 0
          viewer?.moveSplat(dx, dy, dz)
          break
        }
        case 'zoom': {
          const factor = (args?.factor as number) ?? 1
          viewer?.zoomSplat(factor)
          break
        }
        case 'rotate': {
          const roll = (args?.roll as number) ?? 0
          const pitch = (args?.pitch as number) ?? 0
          const yaw = (args?.yaw as number) ?? 0
          viewer?.rotateSplat(roll, pitch, yaw)
          break
        }
        case 'fit': {
          viewer?.fitSplatToViewport()
          break
        }
        case 'reset': {
          viewer?.resetSplatToInitialPosition()
          break
        }
        case 'hdri-rotate': {
          const deg = (args?.degrees as number) ?? 0
          homeStore.setState({ gaussianSplatHdriRotation: deg })
          viewer?.setSplatHdriRotation(deg)
          break
        }
        case 'load': {
          const url = args?.url as string
          if (url) {
            homeStore.setState({ gaussianSplatUrl: url })
            viewer?.loadSplatScene(url)
          }
          break
        }
        case 'unload': {
          viewer?.unloadSplatScene()
          homeStore.setState({ gaussianSplatUrl: '' })
          break
        }
        case 'hdri-load': {
          const hdriUrl = args?.url as string
          if (hdriUrl) {
            homeStore.setState({ gaussianSplatHdriUrl: hdriUrl })
            viewer?.loadSplatHdri(hdriUrl)
          }
          break
        }
        case 'hdri-unload': {
          viewer?.unloadSplatHdri()
          homeStore.setState({ gaussianSplatHdriUrl: '' })
          break
        }
        case 'opacity': {
          const opacity = (args?.value as number) ?? 1
          homeStore.setState({ gaussianSplatOpacity: opacity })
          viewer?.setSplatOpacity(opacity)
          break
        }
        case 'scale': {
          const scale = (args?.value as number) ?? 1
          homeStore.setState({ gaussianSplatScale: scale })
          viewer?.setSplatScale(scale)
          break
        }
        default:
          logger.warn(`Unknown splat action: ${action}`)
      }
      break
    }

    case 'setting': {
      if (!cmd.setting) break
      const { key, value } = cmd.setting

      // Apply setting to settingsStore
      settingsStore.setState({ [key]: value })

      // For some settings we need side-effects
      if (key === 'gaussianSplatEnabled') {
        homeStore.setState({ gaussianSplatEnabled: !!value })
        if (!value) {
          viewer?.unloadSplatScene()
        } else {
          const url = homeStore.getState().gaussianSplatUrl
          if (url) viewer?.loadSplatScene(url)
        }
      }
      if (key === 'ui3dMode') {
        // ui3dMode change is handled by the main page's viewer component
      }
      break
    }

    case 'chat-reset': {
      homeStore.setState({ chatLog: [] })
      settingsStore.setState({ difyConversationId: '' })
      resetSessionId()
      // Clear IndexedDB memories
      try {
        const memoryService = getMemoryService()
        if (memoryService.isAvailable()) {
          await memoryService.clearAllMemories()
        }
      } catch (error) {
        logger.warn('Failed to clear IndexedDB memories:', error)
      }
      toastStore.getState().addToast({
        message: '会話履歴をリセットしました',
        type: 'info',
        tag: 'chat-reset',
      })
      break
    }

    default:
      logger.warn(`Unknown command: ${cmd.command}`)
  }
}
