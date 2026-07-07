import { getOpenAIAudioChatResponseStream } from '../../../features/chat/openAIAudioChat'
import settingsStore from '../../../features/stores/settings'
import homeStore from '../../../features/stores/home'
import { handleReceiveTextFromRtFn } from '../../../features/chat/handlers'
import {
  AudioBufferManager,
  base64ToArrayBuffer,
} from '../../../utils/audioBufferManager'
import { messageSelectors } from '../../../features/messages/messageSelectors'
import { Message } from '../../../features/messages/messages'
import { defaultModels } from '../../../features/constants/aiModels'

jest.mock('../../../features/stores/settings', () => ({
  getState: jest.fn(),
}))

jest.mock('../../../features/stores/home', () => ({
  getState: jest.fn(),
}))

jest.mock('../../../features/chat/handlers', () => ({
  handleReceiveTextFromRtFn: jest.fn(),
}))

jest.mock('../../../utils/audioBufferManager', () => ({
  AudioBufferManager: jest.fn(),
  base64ToArrayBuffer: jest.fn(),
}))

jest.mock('../../../features/messages/messageSelectors', () => ({
  messageSelectors: {
    getAudioMessages: jest.fn(),
  },
}))

/** NDJSON行列からfetchレスポンスのbodyストリームを作る */
const createNdjsonBody = (lines: Array<Record<string, unknown>>) => {
  const encoder = new TextEncoder()
  const payload = lines.map((l) => JSON.stringify(l) + '\n').join('')
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (payload) controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

const mockFetch = jest.fn()

describe('openAIAudioChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch

    const mockSettings = {
      openaiKey: 'test-openai-key',
      selectAIModel: defaultModels.openaiAudio,
      audioModeVoice: 'alloy',
    }
    ;(settingsStore.getState as jest.Mock).mockReturnValue(mockSettings)

    const mockChatLog: Message[] = []
    const mockHomeStore = {
      chatLog: mockChatLog,
      upsertMessage: jest.fn((newMessage: Message) => {
        const existingIndex = mockChatLog.findIndex(
          (msg) =>
            msg.audio?.id === newMessage.audio?.id &&
            newMessage.audio?.id !== undefined
        )
        if (existingIndex !== -1) {
          mockChatLog[existingIndex] = {
            ...mockChatLog[existingIndex],
            ...newMessage,
          }
        } else {
          mockChatLog.push(newMessage)
        }
      }),
    }
    ;(homeStore.getState as jest.Mock).mockImplementation(() => mockHomeStore)

    const mockHandleReceiveText = jest.fn()
    ;(handleReceiveTextFromRtFn as jest.Mock).mockReturnValue(
      mockHandleReceiveText
    )
    ;(AudioBufferManager as jest.Mock).mockImplementation((callback) => ({
      addData: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      callback,
    }))
    ;(base64ToArrayBuffer as jest.Mock).mockReturnValue(new ArrayBuffer(8))
    ;(messageSelectors.getAudioMessages as jest.Mock).mockImplementation(
      (messages) => messages
    )
  })

  const testMessages: Message[] = [
    {
      role: 'system',
      content: 'システムプロンプト',
      timestamp: '2023-01-01T00:00:00Z',
    },
    { role: 'user', content: 'こんにちは', timestamp: '2023-01-01T00:00:01Z' },
  ]

  const drainStream = async (stream: ReadableStream<string>) => {
    const reader = stream.getReader()
    let result = ''
    const chunks: string[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        result += value
      }
    }
    return { result, chunks }
  }

  describe('getOpenAIAudioChatResponseStream', () => {
    it('オーディオストリームを正しく処理する', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: createNdjsonBody([
          { transcript: 'こんにちは、', data: 'base64data1' },
          { transcript: 'お元気ですか？', data: 'base64data2' },
          { id: 'audio-id-123' },
        ]),
      })

      const stream = await getOpenAIAudioChatResponseStream(testMessages)
      const { chunks } = await drainStream(stream)

      // サーバー中継ルートへ正しいペイロードで送信する
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai/audio',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: testMessages,
            apiKey: 'test-openai-key',
            model: defaultModels.openaiAudio,
            voice: 'alloy',
          }),
        })
      )

      expect(chunks).toContain('こんにちは、')
      expect(chunks).toContain('お元気ですか？')

      expect(base64ToArrayBuffer).toHaveBeenCalledWith('base64data1')
      expect(base64ToArrayBuffer).toHaveBeenCalledWith('base64data2')

      const bufferManagerInstance = (AudioBufferManager as jest.Mock).mock
        .results[0].value
      expect(bufferManagerInstance.addData).toHaveBeenCalledTimes(2)

      expect(homeStore.getState().chatLog).toContainEqual({
        role: 'assistant',
        audio: { id: 'audio-id-123' },
        content: '',
        id: 'audio-id-123',
      })

      expect(bufferManagerInstance.flush).toHaveBeenCalled()
    })

    it('AbortSignalが指定された場合はfetchへ渡す', async () => {
      const controller = new AbortController()
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: createNdjsonBody([]),
      })

      await getOpenAIAudioChatResponseStream(testMessages, {
        signal: controller.signal,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai/audio',
        expect.objectContaining({ signal: controller.signal })
      )
    })

    it('APIエラーレスポンスを適切に処理する', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: jest
          .fn()
          .mockResolvedValue({ errorCode: 'ServerSecretAccessDenied' }),
      })

      const originalConsoleError = console.error
      console.error = jest.fn()

      await expect(
        getOpenAIAudioChatResponseStream(testMessages)
      ).rejects.toThrow(
        'OpenAI Audio API request failed with status 403: ServerSecretAccessDenied'
      )

      expect(console.error).toHaveBeenCalled()

      console.error = originalConsoleError
    })

    it('fetch自体の失敗をrethrowする', async () => {
      const mockError = new Error('network error')
      mockFetch.mockRejectedValue(mockError)

      const originalConsoleError = console.error
      console.error = jest.fn()

      await expect(
        getOpenAIAudioChatResponseStream(testMessages)
      ).rejects.toThrow('network error')

      expect(console.error).toHaveBeenCalledWith(
        'OpenAI Audio API error:',
        mockError
      )

      console.error = originalConsoleError
    })

    it('オーディオデータなしのレスポンスを処理する', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: createNdjsonBody([]),
      })

      const stream = await getOpenAIAudioChatResponseStream(testMessages)
      const { chunks } = await drainStream(stream)

      expect(chunks).toHaveLength(0)
      expect(base64ToArrayBuffer).not.toHaveBeenCalled()

      const bufferManagerInstance = (AudioBufferManager as jest.Mock).mock
        .results[0].value
      expect(bufferManagerInstance.addData).not.toHaveBeenCalled()
      expect(bufferManagerInstance.flush).toHaveBeenCalled()
    })

    it('チャンク境界で分割されたNDJSON行を結合して処理する', async () => {
      const encoder = new TextEncoder()
      const line = JSON.stringify({ transcript: '分割された行' }) + '\n'
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(line.slice(0, 5)))
          controller.enqueue(encoder.encode(line.slice(5)))
          controller.close()
        },
      })
      mockFetch.mockResolvedValue({ ok: true, status: 200, body })

      const stream = await getOpenAIAudioChatResponseStream(testMessages)
      const { chunks } = await drainStream(stream)

      expect(chunks).toEqual(['分割された行'])
    })
  })
})
