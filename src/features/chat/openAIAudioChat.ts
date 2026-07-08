import { logger } from '@/lib/logger'
import { Message } from '@/features/messages/messages'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { handleReceiveTextFromRtFn } from './handlers'
import {
  base64ToArrayBuffer,
  AudioBufferManager,
} from '@/utils/audioBufferManager'
import { messageSelectors } from '../messages/messageSelectors'
import { AudioModeModel, RealtimeAPIModeVoice } from '../constants/settings'
import { defaultModels } from '../constants/aiModels'
import type { AIChatResponseStreamOptions } from './aiChatFactory'

type AudioDelta = {
  transcript?: string
  data?: string
  id?: string
}

/**
 * audioモードのチャット応答ストリームを取得する。
 *
 * OpenAIへの呼び出しはサーバー中継ルート `/api/ai/audio` が行う
 * （F1の統一アクセスポリシー配下。クライアントキー未入力時は
 * サーバー側の OPENAI_KEY / OPENAI_API_KEY にフォールバックする）。
 * レスポンスはNDJSONで、1行が delta.audio の { transcript?, data?, id? }。
 *
 * 設計ドキュメント: docs/audio-mode-auth-design.md
 */
export async function getOpenAIAudioChatResponseStream(
  messages: Message[],
  options: AIChatResponseStreamOptions = {}
): Promise<ReadableStream<string>> {
  const ss = settingsStore.getState()

  try {
    const response = await fetch('/api/ai/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messageSelectors.getAudioMessages(messages),
        apiKey: ss.openaiKey,
        model:
          (ss.selectAIModel as AudioModeModel) || defaultModels.openaiAudio,
        voice: ss.audioModeVoice as RealtimeAPIModeVoice,
      }),
      ...(options.signal && { signal: options.signal }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `OpenAI Audio API request failed with status ${response.status}: ${
          errorBody.errorCode || errorBody.error || 'Unknown error'
        }`
      )
    }

    if (!response.body) {
      throw new Error('OpenAI Audio API response has no body')
    }

    const upstreamReader = response.body.getReader()

    return new ReadableStream({
      async start(controller) {
        const handleReceiveText = handleReceiveTextFromRtFn()

        const bufferManager = new AudioBufferManager(async (buffer) => {
          await handleReceiveText('', 'assistant', 'response.audio', buffer)
        })

        const decoder = new TextDecoder()
        let pending = ''

        const processLine = (line: string) => {
          if (!line.trim()) return
          let audio: AudioDelta
          try {
            audio = JSON.parse(line)
          } catch (e) {
            logger.error('Failed to parse audio stream line:', e)
            return
          }
          if (audio.transcript) {
            controller.enqueue(audio.transcript)
          }
          if (audio.data) {
            bufferManager.addData(base64ToArrayBuffer(audio.data))
          }
          if (audio.id) {
            homeStore.getState().upsertMessage({
              id: audio.id, // これで同一メッセージを更新
              role: 'assistant',
              audio: { id: audio.id },
              content: '',
            })
          }
        }

        try {
          while (true) {
            if (options.signal?.aborted) break

            const { done, value } = await upstreamReader.read()
            if (value) {
              pending += decoder.decode(value, { stream: true })
              const lines = pending.split('\n')
              pending = lines.pop() ?? ''
              for (const line of lines) {
                processLine(line)
              }
            }
            if (done) {
              pending += decoder.decode()
              processLine(pending)
              break
            }
          }
        } catch (error) {
          // abort（旧実装のbreak相当）は正常終了扱い。それ以外の途中エラーは
          // ストリームをエラーで終端し、消費側に失敗として伝播させる
          if (!options.signal?.aborted) {
            logger.error('OpenAI Audio API stream error:', error)
            controller.error(error)
            return
          }
        } finally {
          upstreamReader.releaseLock()
        }

        await bufferManager.flush()
        controller.close()
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    logger.error('OpenAI Audio API error:', error)
    throw error
  }
}
