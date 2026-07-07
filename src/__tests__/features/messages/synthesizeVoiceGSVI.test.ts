import { synthesizeVoiceGSVIApi } from '@/features/messages/synthesizeVoiceGSVI'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeVoiceGSVIApi', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should strip trailing slash and send correct request', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve({
          arrayBuffer: () => Promise.resolve(mockBuffer),
        }),
    })

    await synthesizeVoiceGSVIApi(
      mockTalk,
      'http://localhost:5000/',
      'character-1',
      2,
      1.0
    )

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:5000', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character: 'character-1',
        emotion: 'default',
        text: 'Hello world',
        batch_size: 2,
        speed: '1',
        stream: true,
      }),
    })
  })

  it('should return ArrayBuffer decoded from blob on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve({
          arrayBuffer: () => Promise.resolve(mockBuffer),
        }),
    })

    const result = await synthesizeVoiceGSVIApi(
      mockTalk,
      'http://localhost:5000',
      'character-1',
      2,
      1.0
    )

    expect(result).toBe(mockBuffer)
  })

  it('should throw with status code on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    await expect(
      synthesizeVoiceGSVIApi(
        mockTalk,
        'http://localhost:5000',
        'character-1',
        2,
        1.0
      )
    ).rejects.toThrow(
      'GSVIでエラーが発生しました: GSVI APIからの応答が異常です。ステータスコード: 404'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(
      synthesizeVoiceGSVIApi(
        mockTalk,
        'http://localhost:5000',
        'character-1',
        2,
        1.0
      )
    ).rejects.toThrow('GSVIでエラーが発生しました: Network error')
  })
})
