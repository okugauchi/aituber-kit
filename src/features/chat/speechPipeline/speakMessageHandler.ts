import { generateMessageId } from '@/utils/messageUtils'
import {
  THINKING_MARKER,
  TOOL_MARKER,
  ERROR_MARKER,
} from '@/features/chat/vercelAIChat'
import { getFirstSpeechCommaMinChars, SpeechSegmenter } from './speechSegmenter'
import { NormalizedMessageLogWriter } from './messageLogWriter'
import { createSpeechDispatcher } from './speechDispatcher'
import { SegmenterEvent } from './types'
import settingsStore from '@/features/stores/settings'

/**
 * 受け取った完成テキストを処理し、発話させる。
 * WebSocketの direct_send / スライド自動再生の台本読みで使用される。
 *
 * ストリーミング応答と同じSpeechSegmenterを一括pushで使うため、
 * 文分割・タグ・コードブロックの意味論はprocessAIResponseと同一
 * （表示形式のみ現行の正規化フォーマットを踏襲。設計§5.1）。
 * chatProcessing管理・記憶保存・思考ポーズは行わない（現行踏襲）。
 */
export const speakMessageHandler = async (receivedMessage: string) => {
  const sessionId = generateMessageId()
  const writer = new NormalizedMessageLogWriter()
  const dispatcher = createSpeechDispatcher(sessionId)
  const segmenter = new SpeechSegmenter({
    firstSpeechCommaMinChars: getFirstSpeechCommaMinChars(
      settingsStore.getState().selectVoice
    ),
  })

  // マーカー除去（direct_send 通知にマーカーが含まれても発話が壊れないようにする）
  const stripped = receivedMessage
    .replaceAll(THINKING_MARKER, '')
    .replaceAll(TOOL_MARKER, '')
    .replaceAll(ERROR_MARKER, '')

  const handleEvent = (event: SegmenterEvent) => {
    writer.handleEvent(event)
    if (event.kind === 'speech') {
      dispatcher.dispatch(event)
    }
  }

  for (const event of segmenter.push(stripped)) {
    handleEvent(event)
  }
  for (const event of segmenter.flush()) {
    handleEvent(event)
  }
  writer.finalize()
}
