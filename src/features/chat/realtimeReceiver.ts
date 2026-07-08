import { logger } from '@/lib/logger'
import { speakCharacter } from '@/features/messages/speakCharacter'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { generateMessageId } from '@/utils/messageUtils'

/**
 * RealtimeAPIからのテキストまたは音声データを受信したときの処理
 */
export const handleReceiveTextFromRtFn = () => {
  // 連続する response.audio イベントで共通の sessionId を使用するための変数
  let currentSessionId: string | null = null

  return async (
    text?: string,
    role?: string,
    type?: string,
    buffer?: ArrayBuffer
  ) => {
    // type が `response.audio` かつ currentSessionId が未設定の場合に新しいセッションIDを発番
    // それ以外の場合は既存の sessionId を使い続ける。
    // レスポンス終了（content_part.done 等）時にリセットする。

    if (currentSessionId === null) {
      currentSessionId = generateMessageId()
    }

    const sessionId = currentSessionId

    const ss = settingsStore.getState()

    if (ss.realtimeAPIMode) {
      logger.log('realtime api mode: true')
    } else if (ss.audioMode) {
      logger.log('audio mode: true')
    } else {
      logger.log('realtime api mode: false')
      return
    }

    homeStore.setState({ chatProcessing: true })

    if (role == 'assistant') {
      if (type?.includes('response.audio') && buffer !== undefined) {
        logger.log('response.audio:')
        try {
          speakCharacter(
            sessionId,
            {
              emotion: 'neutral',
              message: '',
              buffer: buffer,
            },
            () => {},
            () => {}
          )
        } catch (e) {
          logger.error('Error in speakCharacter:', e)
        }
      } else if (type === 'response.content_part.done' && text !== undefined) {
        homeStore.getState().upsertMessage({
          role: role,
          content: text,
        })
      }
    }
    homeStore.setState({ chatProcessing: false })

    // レスポンスが完了したらセッションIDをリセット
    if (type === 'response.content_part.done') {
      currentSessionId = null
    }
  }
}
