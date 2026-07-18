import { Message } from '@/features/messages/messages'
import { AIService } from '@/features/constants/settings'
import { getDifyChatResponseStream } from './difyChat'
import { getVercelAIChatResponseStream } from './vercelAIChat'
import settingsStore from '@/features/stores/settings'
import { getOpenAIAudioChatResponseStream } from '@/features/chat/openAIAudioChat'

export interface AIChatResponseStreamOptions {
  signal?: AbortSignal
}

/** ユーザーメッセージに `@hermes` が含まれているか判定 */
const isHermesRequest = (messages: Message[]): boolean => {
  const lastUserMessage = [...messages].reverse().find(
    (m) => m.role === 'user' && typeof m.content === 'string'
  )
  if (!lastUserMessage) return false
  const content = lastUserMessage.content
  return typeof content === 'string' && content.toLowerCase().includes('@hermes')
}

export async function getAIChatResponseStream(
  messages: Message[],
  options: AIChatResponseStreamOptions = {}
): Promise<ReadableStream<string> | null> {
  const ss = settingsStore.getState()

  if (ss.selectAIService == 'openai' && ss.audioMode) {
    return options.signal
      ? getOpenAIAudioChatResponseStream(messages, options)
      : getOpenAIAudioChatResponseStream(messages)
  }

  // @hermes ルーティング: 含む → Gateway (8642), 含まない → oMLX (9000)
  if (ss.selectAIService === 'custom-api') {
    const useGateway = isHermesRequest(messages)
    if (useGateway) {
      // Gateway ルート: .env のデフォルト設定にリセット（oMLX ルートで上書きされた場合に備えて）
      settingsStore.setState({
        customApiUrl: process.env.NEXT_PUBLIC_CUSTOM_API_URL || 'http://127.0.0.1:8642/v1/chat/completions',
        customApiHeaders: process.env.NEXT_PUBLIC_CUSTOM_API_HEADERS || '{"Authorization": "Bearer change-me-local-dev"}',
        customApiBody: process.env.NEXT_PUBLIC_CUSTOM_API_BODY || '{"model": "hermes-agent"}',
        includeSystemMessagesInCustomApi: true,
      })
    } else {
      // oMLX 直接（軽量クイック応答）— system prompt 不要
      settingsStore.setState({
        customApiUrl: 'http://127.0.0.1:9000/v1/chat/completions',
        customApiHeaders: '{}',
        customApiBody: JSON.stringify({ model: 'gemma-4-12B-it-8bit' }),
      })
      // system メッセージを除外（Gemma は AITuberKit の system prompt を必要としない）
      settingsStore.setState({
        includeSystemMessagesInCustomApi: false,
      })
    }
  }

  switch (ss.selectAIService as AIService) {
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'azure':
    case 'xai':
    case 'groq':
    case 'cohere':
    case 'mistralai':
    case 'perplexity':
    case 'fireworks':
    case 'deepseek':
    case 'openrouter':
    case 'lmstudio':
    case 'ollama':
    case 'custom-api':
      return options.signal
        ? getVercelAIChatResponseStream(messages, options)
        : getVercelAIChatResponseStream(messages)
    case 'dify':
      return options.signal
        ? getDifyChatResponseStream(
            messages,
            ss.difyKey || '',
            ss.difyUrl || '',
            ss.difyConversationId,
            options
          )
        : getDifyChatResponseStream(
            messages,
            ss.difyKey || '',
            ss.difyUrl || '',
            ss.difyConversationId
          )
    default:
      throw new Error(`Unsupported AI service: ${ss.selectAIService}`)
  }
}
