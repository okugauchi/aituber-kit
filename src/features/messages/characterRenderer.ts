import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { Talk } from './messages'
import { Live2DHandler } from './live2dHandler'
import { PNGTuberHandler } from '@/features/pngTuber/pngTuberHandler'

/**
 * VRM / Live2D / PNGTuber の3実装が慣習のみで共有していた speak() 系メソッドの共通インターフェース。
 * PNGTuberは talk.emotion / talk.motion を無視するが、型としては同じシグネチャで受け取る（対応しないだけ）。
 */
export interface CharacterRenderer {
  speak(buffer: ArrayBuffer, talk: Talk, isNeedDecode?: boolean): Promise<void>
  stopSpeaking(): void | Promise<void>
  resetToIdle(): void | Promise<void>
}

/**
 * 現在のmodelType設定に対応するCharacterRendererを返す。
 * VRMはビューアにモデルが読み込まれていない場合nullを返す。
 */
export function getCharacterRenderer(): CharacterRenderer | null {
  const ss = settingsStore.getState()

  if (ss.modelType === 'live2d') {
    return {
      speak: (buffer, talk, isNeedDecode) =>
        Live2DHandler.speak(buffer, talk, isNeedDecode),
      stopSpeaking: () => Live2DHandler.stopSpeaking(),
      resetToIdle: () => Live2DHandler.resetToIdle(),
    }
  }

  if (ss.modelType === 'pngtuber') {
    return {
      speak: (buffer, talk, isNeedDecode) =>
        PNGTuberHandler.speak(buffer, talk, isNeedDecode),
      stopSpeaking: () => PNGTuberHandler.stopSpeaking(),
      resetToIdle: () => PNGTuberHandler.resetToIdle(),
    }
  }

  const model = homeStore.getState().viewer.model
  if (!model) return null

  return {
    speak: (buffer, talk, isNeedDecode) =>
      model.speak(buffer, talk, isNeedDecode),
    stopSpeaking: () => {
      model.stopSpeaking()
      if (model.poseManager?.isActive) {
        model.poseManager?.resetToIdle(model)
      }
    },
    resetToIdle: async () => {
      await model.playEmotion('neutral')
      if (model.poseManager?.isActive) {
        model.poseManager?.resetToIdle(model)
      }
    },
  }
}
