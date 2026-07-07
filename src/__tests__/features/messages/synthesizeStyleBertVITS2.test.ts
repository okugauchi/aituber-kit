import { synthesizeStyleBertVITS2Api } from '@/features/messages/synthesizeStyleBertVITS2'
import type { Talk } from '@/features/messages/messages'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('synthesizeStyleBertVITS2Api', () => {
  const mockTalk: Talk = {
    emotion: 'neutral',
    message: 'Hello world',
  }

  const callArgs = [
    mockTalk,
    'http://localhost:5000',
    'api-key',
    'model-1',
    'style-1',
    0.2,
    1.0,
    'ja',
  ] as const

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should send correct request to /api/stylebertvits2', async () => {
    const mockBuffer = new ArrayBuffer(8)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    await synthesizeStyleBertVITS2Api(...callArgs)

    expect(mockFetch).toHaveBeenCalledWith('/api/stylebertvits2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello world',
        stylebertvits2ServerUrl: 'http://localhost:5000',
        stylebertvits2ApiKey: 'api-key',
        stylebertvits2ModelId: 'model-1',
        stylebertvits2Style: 'style-1',
        stylebertvits2SdpRatio: 0.2,
        stylebertvits2Length: 1.0,
        selectLanguage: 'ja',
        type: 'stylebertvits2',
      }),
    })
  })

  it('should return ArrayBuffer on success', async () => {
    const mockBuffer = new ArrayBuffer(16)
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    })

    const result = await synthesizeStyleBertVITS2Api(...callArgs)

    expect(result).toBe(mockBuffer)
  })

  it('should throw with status code on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(synthesizeStyleBertVITS2Api(...callArgs)).rejects.toThrow(
      'StyleBertVITS2でエラーが発生しました: StyleBertVITS2 APIからの応答が異常です。ステータスコード: 500'
    )
  })

  it('should throw wrapped error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    await expect(synthesizeStyleBertVITS2Api(...callArgs)).rejects.toThrow(
      'StyleBertVITS2でエラーが発生しました: Network error'
    )
  })
})
