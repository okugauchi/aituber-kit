/**
 * @jest-environment node
 */

const mockAxiosPost = jest.fn()
jest.mock('axios', () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
}))

import handler from '@/pages/api/tts-koeiromap'
import { createMockReq, createMockRes } from '../../helpers/apiRouteTestUtils'

describe('/api/tts-koeiromap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should synthesize audio and return base64 payload', async () => {
    mockAxiosPost.mockResolvedValue({ data: { audio: 'base64-audio-data' } })

    const req = createMockReq({
      body: {
        message: 'こんにちは',
        speakerX: 1.5,
        speakerY: -0.5,
        style: 'talk',
        apiKey: 'key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://api.rinna.co.jp/koeiromap/v1.0/infer',
      expect.objectContaining({
        text: 'こんにちは',
        speaker_x: 1.5,
        speaker_y: -0.5,
        style: 'talk',
        output_format: 'mp3',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'key',
        }),
      })
    )
    expect(res._status).toBe(200)
    expect(res._json).toEqual({ audio: 'base64-audio-data' })
  })

  it('should respond 500 on upstream error', async () => {
    mockAxiosPost.mockRejectedValue(new Error('upstream failure'))

    const req = createMockReq({
      body: { message: 'test', speakerX: 0, speakerY: 0, style: 'talk' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'Internal Server Error' })
  })
})
