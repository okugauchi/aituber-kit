import { synthesizeVoiceAivisCloudApi } from '@/features/messages/synthesizeVoiceAivisCloudApi'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceAivisCloudApi', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  const callArgs = [
    mockTalk,
    'key',
    'model-uuid',
    1,
    'style-name',
    false,
    1.0,
    0.0,
    1.0,
    1.0,
    0.1,
    0.1,
  ] as const

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should send correct request to /api/tts-aivis-cloud-api', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    await synthesizeVoiceAivisCloudApi(...callArgs)

    expect(mockFetch).toHaveBeenCalledWith('/api/tts-aivis-cloud-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello world',
        apiKey: 'key',
        modelUuid: 'model-uuid',
        styleId: 1,
        styleName: 'style-name',
        useStyleName: false,
        speed: 1.0,
        pitch: 0.0,
        emotionalIntensity: 1.0,
        tempoDynamics: 1.0,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
        outputFormat: 'mp3',
      }),
    })
  })

  it('should return ArrayBuffer on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeVoiceAivisCloudApi(...callArgs)

    expect(result).toBe(mockBuffer)
  })

  it('should use error message from response body on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid model_uuid' }),
    })

    await expect(synthesizeVoiceAivisCloudApi(...callArgs)).rejects.toThrow(
      'Aivis Cloud APIでエラーが発生しました: Aivis Cloud APIからの応答が異常です: invalid model_uuid'
    )
  })

  it('should fall back to HTTP status when response body has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    })

    await expect(synthesizeVoiceAivisCloudApi(...callArgs)).rejects.toThrow(
      'Aivis Cloud APIからの応答が異常です: HTTP 500'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(synthesizeVoiceAivisCloudApi(...callArgs)).rejects.toThrow(
      'Aivis Cloud APIでエラーが発生しました: Network error'
    )
  })
})
