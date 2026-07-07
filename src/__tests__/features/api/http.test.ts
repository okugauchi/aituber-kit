/**
 * @jest-environment node
 */

import {
  MAX_IMAGE_CHARS,
  getBearerToken,
  requireApiKey,
  getClientIdFromRequest,
  normalizeMessages,
  normalizeImage,
  sendMethodNotAllowed,
} from '@/features/api/http'
import { createMockReq, createMockRes } from '../../helpers/apiRouteTestUtils'

const originalEnv = { ...process.env }

describe('features/api/http', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.AITUBERKIT_API_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('getBearerToken', () => {
    it('extracts token from Authorization Bearer header', () => {
      const req = createMockReq({
        headers: { authorization: 'Bearer my-token ' },
      })
      expect(getBearerToken(req)).toBe('my-token')
    })

    it('falls back to x-aituberkit-api-key header', () => {
      const req = createMockReq({
        headers: { 'x-aituberkit-api-key': 'header-key' },
      })
      expect(getBearerToken(req)).toBe('header-key')
    })

    it('returns empty string when no credentials are present', () => {
      expect(getBearerToken(createMockReq({ headers: {} }))).toBe('')
    })

    it('ignores non-Bearer authorization schemes', () => {
      const req = createMockReq({
        headers: { authorization: 'Basic abc123' },
      })
      expect(getBearerToken(req)).toBe('')
    })
  })

  describe('requireApiKey', () => {
    it('responds 503 when the API key is not configured', () => {
      const res = createMockRes()

      expect(requireApiKey(createMockReq(), res)).toBe(false)
      expect(res._status).toBe(503)
      expect(res._json).toEqual(
        expect.objectContaining({ code: 'API_KEY_NOT_CONFIGURED' })
      )
    })

    it('responds 401 for an invalid token', () => {
      process.env.AITUBERKIT_API_KEY = 'secret'
      const res = createMockRes()

      expect(
        requireApiKey(
          createMockReq({ headers: { authorization: 'Bearer wrong' } }),
          res
        )
      ).toBe(false)
      expect(res._status).toBe(401)
      expect(res._json).toEqual(
        expect.objectContaining({ code: 'INVALID_API_KEY' })
      )
    })

    it('accepts a valid Bearer token', () => {
      process.env.AITUBERKIT_API_KEY = 'secret'
      const res = createMockRes()

      expect(
        requireApiKey(
          createMockReq({ headers: { authorization: 'Bearer secret' } }),
          res
        )
      ).toBe(true)
      expect(res._ended).toBe(false)
    })

    it('accepts a valid x-aituberkit-api-key header', () => {
      process.env.AITUBERKIT_API_KEY = 'secret'
      const res = createMockRes()

      expect(
        requireApiKey(
          createMockReq({ headers: { 'x-aituberkit-api-key': 'secret' } }),
          res
        )
      ).toBe(true)
    })
  })

  describe('getClientIdFromRequest', () => {
    it('prefers body clientId over query clientId', () => {
      const req = createMockReq({
        query: { clientId: 'from-query' },
      } as never)
      expect(getClientIdFromRequest(req, 'from-body')).toBe('from-body')
    })

    it('falls back to query clientId and trims whitespace', () => {
      const req = createMockReq({
        query: { clientId: '  from-query  ' },
      } as never)
      expect(getClientIdFromRequest(req, '   ')).toBe('from-query')
    })

    it('returns empty string when no clientId is provided', () => {
      const req = createMockReq({ query: {} } as never)
      expect(getClientIdFromRequest(req, undefined)).toBe('')
    })
  })

  describe('normalizeMessages', () => {
    it('wraps a non-empty string into an array', () => {
      expect(normalizeMessages('hello')).toEqual(['hello'])
    })

    it('returns empty array for a blank string', () => {
      expect(normalizeMessages('   ')).toEqual([])
    })

    it('filters non-string and blank entries from arrays', () => {
      expect(normalizeMessages(['a', '', 42, '  ', 'b'])).toEqual(['a', 'b'])
    })

    it('returns empty array for non-string, non-array values', () => {
      expect(normalizeMessages({ text: 'x' })).toEqual([])
      expect(normalizeMessages(undefined)).toEqual([])
    })
  })

  describe('normalizeImage', () => {
    it('treats null/undefined/empty as no image', () => {
      expect(normalizeImage(null)).toEqual({ ok: true, image: undefined })
      expect(normalizeImage(undefined)).toEqual({ ok: true, image: undefined })
      expect(normalizeImage('')).toEqual({ ok: true, image: undefined })
    })

    it('rejects non-string images with 400', () => {
      expect(normalizeImage(123)).toEqual({
        ok: false,
        status: 400,
        error: 'Image is not a string',
      })
    })

    it('rejects oversized images with 413', () => {
      const oversized = 'a'.repeat(MAX_IMAGE_CHARS + 1)
      expect(normalizeImage(oversized)).toEqual({
        ok: false,
        status: 413,
        error: 'Image payload is too large',
      })
    })

    it('accepts a valid image string', () => {
      expect(normalizeImage('data:image/png;base64,abc')).toEqual({
        ok: true,
        image: 'data:image/png;base64,abc',
      })
    })
  })

  describe('sendMethodNotAllowed', () => {
    it('responds 405', () => {
      const res = createMockRes()
      sendMethodNotAllowed(res)
      expect(res._status).toBe(405)
      expect(res._json).toEqual({ error: 'Method not allowed' })
    })
  })
})
