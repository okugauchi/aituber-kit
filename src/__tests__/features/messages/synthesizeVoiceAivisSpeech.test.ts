import { synthesizeVoiceAivisSpeechApi } from '@/features/messages/synthesizeVoiceAivisSpeech'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceAivisSpeechApi', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should send correct request to /api/tts-aivisspeech', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    await synthesizeVoiceAivisSpeechApi(
      mockTalk,
      'speaker-1',
      1.0,
      0.0,
      1.0,
      'http://localhost:10101',
      1.0,
      0.1,
      0.1
    )

    expect(mockFetch).toHaveBeenCalledWith('/api/tts-aivisspeech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello world',
        speaker: 'speaker-1',
        speed: 1.0,
        pitch: 0.0,
        intonationScale: 1.0,
        serverUrl: 'http://localhost:10101',
        tempoDynamics: 1.0,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
      }),
    })
  })

  it('should return ArrayBuffer on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeVoiceAivisSpeechApi(
      mockTalk,
      'speaker-1',
      1.0,
      0.0,
      1.0,
      'http://localhost:10101'
    )

    expect(result).toBe(mockBuffer)
  })

  it('should throw with status code on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(
      synthesizeVoiceAivisSpeechApi(
        mockTalk,
        'speaker-1',
        1.0,
        0.0,
        1.0,
        'http://localhost:10101'
      )
    ).rejects.toThrow(
      'AivisSpeechでエラーが発生しました: AivisSpeechからの応答が異常です。ステータスコード: 500'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      synthesizeVoiceAivisSpeechApi(
        mockTalk,
        'speaker-1',
        1.0,
        0.0,
        1.0,
        'http://localhost:10101'
      )
    ).rejects.toThrow('AivisSpeechでエラーが発生しました: Network error')
  })
})
