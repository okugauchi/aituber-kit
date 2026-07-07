import { synthesizeVoiceCartesiaApi } from '@/features/messages/synthesizeVoiceCartesia'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceCartesiaApi', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should throw when apiKey is missing', async () => {
    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, '', 'voice-id', 'ja')
    ).rejects.toThrow('CartesiaのAPIキーが設定されていません')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should throw when voiceId is missing', async () => {
    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, 'key', '', 'ja')
    ).rejects.toThrow('CartesiaのVoice IDが設定されていません')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should throw when message is empty', async () => {
    await expect(
      synthesizeVoiceCartesiaApi(
        { emotion: 'neutral', message: '  ' },
        'key',
        'voice-id',
        'ja'
      )
    ).rejects.toThrow('合成するメッセージが空です')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should send correct request to /api/cartesia', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    await synthesizeVoiceCartesiaApi(mockTalk, 'key', 'voice-id', 'ja')

    expect(mockFetch).toHaveBeenCalledWith('/api/cartesia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello world',
        voiceId: 'voice-id',
        apiKey: 'key',
        language: 'ja',
      }),
    })
  })

  it('should return ArrayBuffer on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeVoiceCartesiaApi(
      mockTalk,
      'key',
      'voice-id',
      'ja'
    )

    expect(result).toBe(mockBuffer)
  })

  it('should include error detail text on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request detail'),
    })

    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, 'key', 'voice-id', 'ja')
    ).rejects.toThrow(
      'Cartesiaでエラーが発生しました: Cartesia APIからの応答が異常です。ステータスコード: 400, エラー詳細: bad request detail'
    )
  })

  it('should fall back when error detail text cannot be read', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('stream closed')),
    })

    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, 'key', 'voice-id', 'ja')
    ).rejects.toThrow('エラー詳細を取得できませんでした')
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, 'key', 'voice-id', 'ja')
    ).rejects.toThrow('Cartesiaでエラーが発生しました: Network error')
  })

  it('should throw generic error for non-Error exceptions', async () => {
    mockFetch.mockRejectedValue('string error')

    await expect(
      synthesizeVoiceCartesiaApi(mockTalk, 'key', 'voice-id', 'ja')
    ).rejects.toThrow('Cartesiaで不明なエラーが発生しました')
  })
})
