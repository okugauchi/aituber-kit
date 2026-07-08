/**
 * @jest-environment node
 */

const mockSpeechCreate = jest.fn()
const mockAzureOpenAI = jest.fn().mockImplementation(() => ({
  audio: { speech: { create: mockSpeechCreate } },
}))
jest.mock('openai', () => ({
  // new AzureOpenAI(...) されるためコンストラクタ呼び出し可能な形にする
  AzureOpenAI: function (this: unknown, ...args: unknown[]) {
    return mockAzureOpenAI(...args)
  },
}))

import handler from '@/pages/api/azureOpenAITTS'
import {
  createMockReq,
  createMockRes,
  mockServerSecretGuard,
} from '../../helpers/apiRouteTestUtils'

const originalEnv = { ...process.env }

describe('/api/azureOpenAITTS', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.AZURE_TTS_KEY
    delete process.env.AZURE_TTS_ENDPOINT
    delete process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = originalEnv
  })

  const validBody = {
    message: 'hello',
    voice: 'alloy',
    speed: 1,
    apiKey: 'key',
    endpoint:
      'https://example.openai.azure.com/openai/deployments/my-tts/audio/speech?api-version=2024-02-15-preview',
  }

  it('should respond 405 for non-POST requests', async () => {
    const req = createMockReq({ method: 'GET' })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(405)
    expect(res._json).toEqual({ error: 'Method not allowed' })
  })

  it('should respond 400 when required parameters are missing', async () => {
    const req = createMockReq({ body: { message: 'hello' } })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Missing required parameters' })
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should synthesize audio and parse deployment name from endpoint', async () => {
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    })

    const req = createMockReq({ body: validBody })
    const res = createMockRes()

    await handler(req, res)

    expect(mockAzureOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'key',
        deployment: 'my-tts',
        apiVersion: '2024-02-15-preview',
      })
    )
    expect(mockSpeechCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'my-tts',
        voice: 'alloy',
        input: 'hello',
        speed: 1,
      })
    )
    expect(res._headers['Content-Type']).toBe('audio/mpeg')
    expect(res._ended).toBe(true)
  })

  it('should reject server env key usage when guard mode is not configured', async () => {
    process.env.AZURE_TTS_KEY = 'server-key'
    process.env.AZURE_TTS_ENDPOINT =
      'https://example.openai.azure.com/openai/deployments/tts/audio/speech'

    const req = createMockReq({
      body: { message: 'hello', voice: 'alloy', speed: 1 },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(res._json).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretAccessDenied',
        feature: 'azureOpenAITTS',
      })
    )
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should allow server env key usage from same-origin request in demo mode', async () => {
    const { headers } = mockServerSecretGuard('demo')
    process.env.AZURE_TTS_KEY = 'server-key'
    process.env.AZURE_TTS_ENDPOINT =
      'https://example.openai.azure.com/openai/deployments/tts/audio/speech'
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    })

    const req = createMockReq({
      body: { message: 'hello', voice: 'alloy', speed: 1 },
      headers,
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._headers['Content-Type']).toBe('audio/mpeg')
    expect(res._ended).toBe(true)
  })

  it('should respond 400 for unparsable endpoint URL (S13)', async () => {
    const req = createMockReq({
      body: { ...validBody, endpoint: 'not a url' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid Azure TTS endpoint URL' })
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should respond 400 for non-http endpoint protocol (S13)', async () => {
    const req = createMockReq({
      body: { ...validBody, endpoint: 'ftp://example.openai.azure.com/x' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid Azure TTS endpoint URL' })
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should respond 400 for deployment name with invalid characters (S13)', async () => {
    const req = createMockReq({
      body: {
        ...validBody,
        endpoint:
          'https://example.openai.azure.com/openai/deployments/bad%20name%3B/audio/speech',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid Azure TTS deployment name' })
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should respond 400 when deployments segment has no following name (S13)', async () => {
    const req = createMockReq({
      body: {
        ...validBody,
        endpoint: 'https://example.openai.azure.com/openai/deployments',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Invalid Azure TTS deployment name' })
    expect(mockSpeechCreate).not.toHaveBeenCalled()
  })

  it('should respond 500 on upstream error', async () => {
    mockSpeechCreate.mockRejectedValue(new Error('upstream failure'))

    const req = createMockReq({ body: validBody })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'Failed to generate speech' })
  })
})
