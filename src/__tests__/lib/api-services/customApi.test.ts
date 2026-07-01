import { handleCustomApi } from '@/lib/api-services/customApi'

const originalFetch = global.fetch
const originalEnv = { ...process.env }

if (typeof global.Response === 'undefined') {
  class TestResponse {
    public status: number
    public ok: boolean
    public headers: Map<string, string>
    public body: any

    constructor(body?: any, init: { status?: number; headers?: any } = {}) {
      this.body = body
      this.status = init.status ?? 200
      this.ok = this.status >= 200 && this.status < 300
      this.headers = new Map(Object.entries(init.headers || {}))
    }

    async text() {
      if (typeof this.body === 'string') return this.body
      if (!this.body?.getReader) return ''

      const reader = this.body.getReader()
      const decoder = new TextDecoder()
      let result = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
      }
      result += decoder.decode()
      return result
    }

    async json() {
      return JSON.parse(await this.text())
    }
  }

  // @ts-expect-error – provide Response polyfill for test environment
  global.Response = TestResponse
}

function createStreamResponse(body: string): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  )
}

describe('handleCustomApi', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    global.fetch = jest.fn()
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('forwards text deltas while filtering reasoning and provider metadata by default', async () => {
    const upstream = [
      'data: {"type":"start","payload":{"id":"internal"}}',
      'data: {"type":"reasoning-delta","delta":"hidden reasoning"}',
      'data: {"type":"reasoning-delta","payload":{"text":"hidden payload reasoning"}}',
      'data: {"type":"text-delta","delta":"hello"}',
      'data: {"type":"step-finish","payload":{"metadata":{"headers":{"x-request-id":"secret"}}}}',
      'data: [DONE]',
      '',
      '',
    ].join('\n')
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue(createStreamResponse(upstream))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://example.com/custom',
      '{}',
      '{}',
      true
    )

    const text = await response.text()
    expect(text).toContain('data: {"type":"text-delta","delta":"hello"}')
    expect(text).toContain('data: [DONE]')
    expect(text).toContain('data: [DONE]\n\n')
    expect(text).not.toContain('hidden reasoning')
    expect(text).not.toContain('hidden payload reasoning')
    expect(text).not.toContain('x-request-id')
    expect(text).not.toContain('"type":"start"')
  })

  it('filters raw SSE metadata lines and trailing buffered metadata by default', async () => {
    const upstream = [
      'event: internal-event',
      'id: upstream-request-id',
      'data: {"type":"text-delta","delta":"visible"}',
      'data: {"type":"step-finish","payload":{"metadata":{"secret":"hidden"}}}',
    ].join('\n')
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue(createStreamResponse(upstream))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://example.com/custom',
      '{}',
      '{}',
      true
    )

    const text = await response.text()
    expect(text).toContain('data: {"type":"text-delta","delta":"visible"}')
    expect(text).not.toContain('internal-event')
    expect(text).not.toContain('upstream-request-id')
    expect(text).not.toContain('hidden')
  })

  it('can forward metadata when explicitly enabled', async () => {
    process.env.AITUBERKIT_FORWARD_CUSTOM_API_METADATA = 'true'
    const upstream = [
      'data: {"type":"reasoning-delta","delta":"visible reasoning"}',
      'data: {"type":"reasoning-delta","payload":{"text":"visible payload reasoning"}}',
      'data: {"type":"step-finish","payload":{"metadata":{"id":"response-id"}}}',
      '',
      '',
    ].join('\n')
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue(createStreamResponse(upstream))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://example.com/custom',
      '{}',
      '{}',
      true
    )

    const text = await response.text()
    expect(text).toContain('visible reasoning')
    expect(text).toContain('visible payload reasoning')
    expect(text).toContain('response-id')
  })

  it('normalizes quoted custom API header names and values before fetch', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue(createStreamResponse('data: [DONE]\n\n'))

    await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://example.com/custom',
      '{"\\"Authorization\\"":"\\"Bearer token\\""}',
      '{}',
      true
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/custom',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    )
  })

  it('retries Anthropic custom API requests with x-api-key after bearer auth fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-secret'
    const fetchMock = global.fetch as jest.Mock
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { type: 'authentication_error' } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(createStreamResponse('data: [DONE]\n\n'))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://api.anthropic.com/v1/messages',
      '{"Authorization":"Bearer stale"}',
      '{"model":"claude-sonnet-4-5","max_tokens":128}',
      true
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'anthropic-secret',
          'anthropic-version': '2023-06-01',
        }),
      })
    )
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty(
      'Authorization'
    )
  })

  it('uses bearer token from Custom API headers as Anthropic x-api-key', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(createStreamResponse('data: [DONE]\n\n'))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://api.anthropic.com/v1/messages',
      '{"Authorization":"Bearer custom-header-secret"}',
      '{"model":"claude-sonnet-4-5","max_tokens":128}',
      true
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'custom-header-secret',
          'anthropic-version': '2023-06-01',
        }),
      })
    )
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      'Authorization'
    )
  })

  it('strips bearer prefix from Anthropic x-api-key headers', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(createStreamResponse('data: [DONE]\n\n'))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://api.anthropic.com/v1/messages',
      '{"x-api-key":"Bearer custom-header-secret"}',
      '{"model":"claude-sonnet-4-5","max_tokens":128}',
      true
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'custom-header-secret',
          'anthropic-version': '2023-06-01',
        }),
      })
    )
  })

  it('retries Anthropic custom API requests with environment key after stale x-api-key fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-secret'
    const fetchMock = global.fetch as jest.Mock
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { type: 'authentication_error' } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(createStreamResponse('data: [DONE]\n\n'))

    const response = await handleCustomApi(
      [{ role: 'user', content: 'hi' } as any],
      'https://api.anthropic.com/v1/messages',
      '{"x-api-key":"stale-custom-secret"}',
      '{"model":"claude-sonnet-4-5","max_tokens":128}',
      true
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'anthropic-secret',
          'anthropic-version': '2023-06-01',
        }),
      })
    )
  })
})
