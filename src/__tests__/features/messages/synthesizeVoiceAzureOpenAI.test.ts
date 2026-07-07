import { synthesizeVoiceAzureOpenAIApi } from '@/features/messages/synthesizeVoiceAzureOpenAI'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceAzureOpenAIApi', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should send correct request to /api/azureOpenAITTS', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    await synthesizeVoiceAzureOpenAIApi(
      mockTalk,
      'key',
      'https://example.openai.azure.com/deployments/tts',
      'alloy',
      1.0
    )

    expect(mockFetch).toHaveBeenCalledWith('/api/azureOpenAITTS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello world',
        voice: 'alloy',
        speed: 1.0,
        apiKey: 'key',
        azureTTSEndpoint: 'https://example.openai.azure.com/deployments/tts',
      }),
    })
  })

  it('should return ArrayBuffer on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeVoiceAzureOpenAIApi(
      mockTalk,
      'key',
      'https://example.openai.azure.com',
      'alloy',
      1.0
    )

    expect(result).toBe(mockBuffer)
  })

  it('should throw with status code on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
    })

    await expect(
      synthesizeVoiceAzureOpenAIApi(
        mockTalk,
        'key',
        'https://example.openai.azure.com',
        'alloy',
        1.0
      )
    ).rejects.toThrow(
      'Azure OpenAI TTSでエラーが発生しました: Azure OpenAI TTS APIからの応答が異常です。ステータスコード: 400'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      synthesizeVoiceAzureOpenAIApi(
        mockTalk,
        'key',
        'https://example.openai.azure.com',
        'alloy',
        1.0
      )
    ).rejects.toThrow('Azure OpenAI TTSでエラーが発生しました: Network error')
  })
})
