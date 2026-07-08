/**
 * @jest-environment node
 */

const mockAxiosPost = jest.fn()
jest.mock('axios', () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
  isAxiosError: (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'response' in error,
}))

import handler from '@/pages/api/tts-aivis-cloud-api'
import {
  createMockReq,
  createMockRes,
  mockServerSecretGuard,
} from '../../helpers/apiRouteTestUtils'

const originalEnv = { ...process.env }

const VALID_API_KEY = 'aivis_0123456789abcdef'
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('/api/tts-aivis-cloud-api', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.AIVIS_CLOUD_API_KEY
    delete process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = originalEnv
  })

  const validBody = {
    text: 'こんにちは',
    modelUuid: VALID_UUID,
    apiKey: VALID_API_KEY,
  }

  it('should respond 400 when API key is missing', async () => {
    const req = createMockReq({
      body: { text: 'test', modelUuid: VALID_UUID },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'API key is required' })
  })

  it('should respond 400 for invalid API key format', async () => {
    const req = createMockReq({
      body: { ...validBody, apiKey: 'invalid-key' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid API key format' })
  })

  it('should respond 400 for invalid model UUID format', async () => {
    const req = createMockReq({
      body: { ...validBody, modelUuid: 'not-a-uuid' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid model UUID format' })
  })

  it('should respond 400 when text is missing', async () => {
    const req = createMockReq({
      body: { modelUuid: VALID_UUID, apiKey: VALID_API_KEY },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Text is required' })
  })

  it('should synthesize audio and forward Aivis credit headers', async () => {
    mockAxiosPost.mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: {
        'content-type': 'audio/mpeg',
        'x-aivis-character-count': '5',
        'x-aivis-credits-remaining': '100',
      },
    })

    const req = createMockReq({ body: { ...validBody, styleId: 2 } })
    const res = createMockRes()

    await handler(req, res)

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://api.aivis-project.com/v1/tts/synthesize',
      expect.objectContaining({
        model_uuid: VALID_UUID,
        text: 'こんにちは',
        style_id: 2,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${VALID_API_KEY}`,
        }),
        responseType: 'arraybuffer',
      })
    )
    expect(res._headers['Content-Type']).toBe('audio/mpeg')
    expect(res._headers['X-Aivis-Character-Count']).toBe('5')
    expect(res._headers['X-Aivis-Credits-Remaining']).toBe('100')
    expect(res._ended).toBe(true)
  })

  it('should reject server env key usage when guard mode is not configured', async () => {
    process.env.AIVIS_CLOUD_API_KEY = VALID_API_KEY

    const req = createMockReq({
      body: { text: 'test', modelUuid: VALID_UUID },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(res._json).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretAccessDenied',
        feature: 'tts-aivis-cloud-api',
      })
    )
    expect(mockAxiosPost).not.toHaveBeenCalled()
  })

  it('should allow server env key usage from same-origin request in demo mode', async () => {
    const { headers } = mockServerSecretGuard('demo')
    process.env.AIVIS_CLOUD_API_KEY = VALID_API_KEY
    mockAxiosPost.mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: { 'content-type': 'audio/mpeg' },
    })

    const req = createMockReq({
      body: { text: 'test', modelUuid: VALID_UUID },
      headers,
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._headers['Content-Type']).toBe('audio/mpeg')
    expect(res._ended).toBe(true)
  })

  it('should map upstream 401 to invalid API key error', async () => {
    mockAxiosPost.mockRejectedValue({
      response: { status: 401, data: {} },
    })

    const req = createMockReq({ body: validBody })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(401)
    expect(res._json).toEqual({ error: 'Invalid API key' })
  })

  it('should map upstream 429 to rate limit error', async () => {
    mockAxiosPost.mockRejectedValue({
      response: { status: 429, data: {} },
    })

    const req = createMockReq({ body: validBody })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(429)
    expect(res._json).toEqual({ error: 'Rate limit exceeded' })
  })

  it('should respond 500 on network error without response', async () => {
    mockAxiosPost.mockRejectedValue(new Error('network down'))

    const req = createMockReq({ body: validBody })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'Internal Server Error' })
  })
})
