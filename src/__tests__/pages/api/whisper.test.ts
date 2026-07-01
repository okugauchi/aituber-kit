/**
 * @jest-environment node
 */

jest.mock('openai', () => jest.fn())

import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '@/pages/api/whisper'

function createMockReq(
  overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
  return {
    method: 'POST',
    headers: {},
    on: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  } as unknown as NextApiRequest
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
  }
  return res as unknown as NextApiResponse & {
    _status: number
    _json: unknown
  }
}

describe('/api/whisper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects request bodies larger than the Whisper upload limit before buffering', async () => {
    const req = createMockReq({
      headers: {
        'content-length': String(26 * 1024 * 1024),
        'content-type': 'multipart/form-data; boundary=test-boundary',
      },
    })
    const res = createMockRes()

    await handler(req, res)

    expect(res._status).toBe(413)
    expect(res._json).toEqual(
      expect.objectContaining({
        error: 'Request body is too large',
      })
    )
    expect(req.on).not.toHaveBeenCalled()
  })
})
