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
  return lastUserMessage
    ? lastUserMessage.content.toLowerCase().includes('@hermes')
    : false
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

  // @hermes ルーティング: 含む → Gateway (8642), 含まない → ds4-server (9000)
  if (ss.selectAIService === 'custom-api') {
    const useGateway = isHermesRequest(messages)
    if (useGateway) {
      // Gateway 用の設定で上書き
      settingsStore.setState({
        customApiUrl: 'http://127.0.0.1:8642/v1/chat/completions',
        customApiHeaders: JSON.stringify({
          Authorization: 'Bearer change-me-local-dev',
        }),
        customApiBody: JSON.stringify({ model: 'hermes-agent' }),
      })
    } else {
      // ds4-server 直接（軽量クイック応答）
      settingsStore.setState({
        customApiUrl: 'http://127.0.0.1:9000/v1/chat/completions',
        customApiHeaders: '{}',
        customApiBody: JSON.stringify({ model: 'ds4-server' }),
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
