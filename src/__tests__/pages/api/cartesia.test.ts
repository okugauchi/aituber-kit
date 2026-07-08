/**
 * @jest-environment node
 */

import handler from '@/pages/api/cartesia'
import {
  createMockReq,
  createMockRes,
  mockServerSecretGuard,
} from '../../helpers/apiRouteTestUtils'

const originalEnv = { ...process.env }
const originalFetch = global.fetch

describe('/api/cartesia', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.CARTESIA_API_KEY
    delete process.env.CARTESIA_VOICE_ID
    delete process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE
    global.fetch = jest.fn()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('should respond 400 json when API key is missing (B1 regression)', async () => {
    const req = createMockReq({ body: { message: 'hello', voiceId: 'v1' } })
    const res = createMockRes()

    await handler(req, res)

    // new Response を return するとレスポンスが送信されずハングする（B1）
    expect(res._ended).toBe(true)
    expect(res._status).toBe(400)
    expect(res._json).toEqual({
      error: 'Empty API Key',
      errorCode: 'EmptyAPIKey',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should respond 400 json when voice ID is missing (B1 regression)', async () => {
    const req = createMockReq({ body: { message: 'hello', apiKey: 'key' } })
    const res = createMockRes()

    await handler(req, res)

    expect(res._ended).toBe(true)
    expect(res._status).toBe(400)
    expect(res._json).toEqual({
      error: 'Empty Voice ID',
      errorCode: 'EMPTY_PROPERTY',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should synthesize audio with client-provided credentials', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })

    const req = createMockReq({
      body: { message: 'hello', apiKey: 'key', voiceId: 'v1', language: 'ja' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cartesia.ai/tts/bytes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'key' }),
      })
    )
    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    )
    expect(requestBody.transcript).toBe('hello')
    expect(requestBody.voice).toEqual({ mode: 'id', id: 'v1' })
    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('audio/wav')
    expect(res._ended).toBe(true)
  })

  it('should reject server env key usage when guard mode is not configured', async () => {
    process.env.CARTESIA_API_KEY = 'server-key'
    process.env.CARTESIA_VOICE_ID = 'server-voice'

    const req = createMockReq({ body: { message: 'hello' } })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(res._json).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretAccessDenied',
        feature: 'cartesia',
      })
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should allow server env key usage from same-origin request in demo mode', async () => {
    const { headers } = mockServerSecretGuard('demo')
    process.env.CARTESIA_API_KEY = 'server-key'
    process.env.CARTESIA_VOICE_ID = 'server-voice'
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })

    const req = createMockReq({ body: { message: 'hello' }, headers })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('audio/wav')
  })

  it('should respond 500 on upstream error', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502 })

    const req = createMockReq({
      body: { message: 'hello', apiKey: 'key', voiceId: 'v1' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    )
  })
})
