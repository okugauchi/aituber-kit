import { synthesizeVoiceKoeiromapApi } from '@/features/messages/synthesizeVoiceKoeiromap'
import type { Talk } from '@/features/messages/messages'
import type { KoeiroParam } from '@/features/constants/koeiroParam'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceKoeiromapApi', () => {
  const mockTalk: Talk = {
    emotion: 'happy',
    message: 'Hello world',
  }
  const koeiroParam: KoeiroParam = { speakerX: 1.5, speakerY: 2.5 }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should send correct request to /api/tts-koeiromap with mapped emotion style', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio: 'http://localhost/audio.wav' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })

    await synthesizeVoiceKoeiromapApi(mockTalk, 'key', koeiroParam)

    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/tts-koeiromap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello world',
        speakerX: 1.5,
        speakerY: 2.5,
        style: 'happy',
        apiKey: 'key',
      }),
    })
  })

  it('should fetch the returned audio URL and return its ArrayBuffer', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio: 'http://localhost/audio.wav' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeVoiceKoeiromapApi(
      mockTalk,
      'key',
      koeiroParam
    )

    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost/audio.wav')
    expect(result).toBe(mockBuffer)
  })

  it('should default unmapped emotions to "talk" style', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio: 'http://localhost/audio.wav' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })

    await synthesizeVoiceKoeiromapApi(
      { emotion: 'relaxed', message: 'hi' },
      'key',
      koeiroParam
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.style).toBe('talk')
  })

  it('should throw with status code on non-ok first response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(
      synthesizeVoiceKoeiromapApi(mockTalk, 'key', koeiroParam)
    ).rejects.toThrow(
      'Koeiromapでエラーが発生しました: Koeiromap APIからの応答が異常です。ステータスコード: 500'
    )
  })

  it('should throw when no audio URL is returned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio: null }),
    })

    await expect(
      synthesizeVoiceKoeiromapApi(mockTalk, 'key', koeiroParam)
    ).rejects.toThrow(
      'Koeiromapでエラーが発生しました: Koeiromap APIから音声URLが返されませんでした'
    )
  })

  it('should throw when the audio file fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio: 'http://localhost/audio.wav' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    await expect(
      synthesizeVoiceKoeiromapApi(mockTalk, 'key', koeiroParam)
    ).rejects.toThrow(
      'Koeiromapでエラーが発生しました: Koeiromap音声ファイルの取得に失敗しました。ステータスコード: 404'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      synthesizeVoiceKoeiromapApi(mockTalk, 'key', koeiroParam)
    ).rejects.toThrow('Koeiromapでエラーが発生しました: Network error')
  })
})
