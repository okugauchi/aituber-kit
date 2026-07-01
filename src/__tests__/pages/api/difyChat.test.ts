/**
 * @jest-environment node
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '@/pages/api/difyChat'

const originalEnv = { ...process.env }
const originalFetch = global.fetch

function createMockReq(
  overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
  return {
    method: 'POST',
    body: {},
    ...overrides,
  } as NextApiRequest
}

function createMockRes() {
  const res = {
    _status: 200,
    _json: null as unknown,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  }
  return res as unknown as NextApiResponse & {
    _status: number
    _json: unknown
  }
}

describe('/api/difyChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'unprotected'
    global.fetch = jest.fn()
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it('rejects client-provided urls without a client-provided API key', async () => {
    process.env.DIFY_KEY = 'server-dify-key'

    const req = createMockReq({
      body: {
        query: 'hello',
        url: 'https://untrusted.example/v1',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({
      error: 'Dify Empty API Key',
      errorCode: 'EmptyAPIKey',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('uses server Dify settings only with the server-configured URL', async () => {
    process.env.DIFY_KEY = 'server-dify-key'
    process.env.DIFY_URL = 'https://dify.example/v1'
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'ok' }),
    })

    const req = createMockReq({
      body: {
        query: 'hello',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://dify.example/v1/chat-messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-dify-key',
        }),
      })
    )
  })
})
