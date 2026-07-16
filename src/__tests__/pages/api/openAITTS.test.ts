/**
 * @jest-environment node
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '@/pages/api/openAITTS'

const originalFetch = global.fetch

function createMockReq(
  overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
  return {
    method: 'POST',
    body: {},
    query: {},
    ...overrides,
  } as NextApiRequest
}

function createMockRes() {
  const res = {
    _status: 200,
    _json: null as unknown,
    _body: null as unknown,
    _chunks: [] as Buffer[],
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
    send(data: unknown) {
      res._body = data
      return res
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value
      return res
    },
    writeHead(code: number, headers: Record<string, string>) {
      res._status = code
      Object.assign(res._headers, headers)
      return res
    },
    flushHeaders() {},
    write(data: Buffer) {
      res._chunks.push(data)
      return true
    },
    once() {
      return res
    },
    off() {
      return res
    },
    end(data?: Buffer) {
      if (data) res._chunks.push(data)
      return res
    },
  }
  return res as unknown as NextApiResponse & {
    _status: number
    _json: unknown
    _body: unknown
    _chunks: Buffer[]
    _headers: Record<string, string>
  }
}

describe('/api/openAITTS', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('should return 405 for non-POST methods', async () => {
    const req = createMockReq({ method: 'GET' })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(405)
    expect(res._json).toEqual({ error: 'Method not allowed' })
  })

  it('should return 400 when message is missing', async () => {
    const req = createMockReq({
      body: { voice: 'alloy', model: 'tts-1', apiKey: 'key' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({ error: 'Missing required parameters' })
  })

  it('should return 400 when voice is missing', async () => {
    const req = createMockReq({
      body: { message: 'hello', model: 'tts-1', apiKey: 'key' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
  })

  it('should return 400 when model is missing', async () => {
    const req = createMockReq({
      body: { message: 'hello', voice: 'alloy', apiKey: 'key' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
  })

  it('should return 400 when apiKey is missing and no env vars set', async () => {
    const originalTtsKey = process.env.OPENAI_TTS_KEY
    const originalApiKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_TTS_KEY
    delete process.env.OPENAI_API_KEY

    const req = createMockReq({
      body: { message: 'hello', voice: 'alloy', model: 'tts-1' },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)

    process.env.OPENAI_TTS_KEY = originalTtsKey
    process.env.OPENAI_API_KEY = originalApiKey
  })

  it('should return audio buffer on success', async () => {
    const fakeBuffer = Buffer.from('fake-audio')
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response(fakeBuffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })
    )

    const req = createMockReq({
      body: {
        message: 'hello',
        voice: 'alloy',
        model: 'tts-1',
        speed: 1.0,
        apiKey: 'test-key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._headers['Content-Type']).toBe('audio/mpeg')
    expect(res._body).toBeTruthy()
  })

  it('should proxy raw PCM chunks in streaming mode', async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
        controller.close()
      },
    })
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response(upstream, {
        status: 200,
        headers: { 'content-type': 'audio/pcm' },
      })
    )

    const req = createMockReq({
      query: { stream: 'true' },
      body: {
        message: 'hello',
        voice: 'alloy',
        model: 'tts-1',
        speed: 1,
        apiKey: 'key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    const requestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    )
    expect(requestBody.response_format).toBe('pcm')
    expect(res._headers['Content-Type']).toBe('audio/pcm')
    expect(res._headers['X-Audio-Sample-Rate']).toBe('24000')
    expect(Buffer.concat(res._chunks)).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('should add emotional instructions for gpt-4o model', async () => {
    const fakeBuffer = Buffer.from('audio')
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response(fakeBuffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })
    )

    const req = createMockReq({
      body: {
        message: 'I am happy',
        voice: 'alloy',
        model: 'gpt-4o-audio',
        speed: 1.0,
        apiKey: 'key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    const callArgs = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    )
    expect(callArgs.instructions).toContain('rich emotional expression')
  })

  it('should not add instructions for non-gpt-4o models', async () => {
    const fakeBuffer = Buffer.from('audio')
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response(fakeBuffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      })
    )

    const req = createMockReq({
      body: {
        message: 'hello',
        voice: 'alloy',
        model: 'tts-1',
        speed: 1.0,
        apiKey: 'key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    const callArgs = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    )
    expect(callArgs.instructions).toBeUndefined()
  })

  it('should return 500 on OpenAI API error', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API error' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const req = createMockReq({
      body: {
        message: 'hello',
        voice: 'alloy',
        model: 'tts-1',
        speed: 1.0,
        apiKey: 'key',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({
      error: 'Failed to generate speech',
      errorCode: 'OpenAITTSUpstreamError',
      status: 401,
    })
    consoleErrorSpy.mockRestore()
  })
})
