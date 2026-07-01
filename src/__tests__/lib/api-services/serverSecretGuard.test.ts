import { createMocks } from 'node-mocks-http'
import { guardServerSecretAccess } from '@/lib/api-services/serverSecretGuard'

const originalEnv = { ...process.env }

describe('serverSecretGuard', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete (globalThis as any).__aituberKitServerSecretRateLimit
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('denies server secret access by default', () => {
    const { req, res } = createMocks({ method: 'POST' })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(403)
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretAccessDenied',
        feature: 'test-feature',
      })
    )
  })

  it('allows protected mode with a matching bearer token', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'protected'
    process.env.AITUBERKIT_SERVER_SECRET_TOKEN = 'secret-token'
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer secret-token' },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(true)
    expect(res._getStatusCode()).toBe(200)
  })

  it('allows unprotected mode without credentials', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'unprotected'
    const { req, res } = createMocks({ method: 'POST' })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(true)
    expect(res._getStatusCode()).toBe(200)
  })

  it('falls back to disabled behavior for unknown access modes', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'unexpected-mode'
    const { req, res } = createMocks({ method: 'POST' })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(403)
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretAccessDenied',
        feature: 'test-feature',
      })
    )
  })

  it('allows demo mode for same-origin requests without a demo token when no token is configured', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    delete process.env.AITUBERKIT_DEMO_ACCESS_TOKEN
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        host: 'aituberkit.example',
        origin: 'https://aituberkit.example',
        'sec-fetch-site': 'same-origin',
      },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(true)
    expect(res._getStatusCode()).toBe(200)
  })

  it('allows demo mode for same-origin requests with a configured demo token', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    process.env.AITUBERKIT_DEMO_ACCESS_TOKEN = 'demo-token'
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        host: 'aituberkit.example',
        origin: 'https://aituberkit.example',
        'sec-fetch-site': 'same-origin',
        'x-aituberkit-demo-token': 'demo-token',
      },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(true)
    expect(res._getStatusCode()).toBe(200)
  })

  it('rejects demo mode cross-site requests', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    process.env.AITUBERKIT_DEMO_ACCESS_TOKEN = 'demo-token'
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        host: 'aituberkit.example',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
        'x-aituberkit-demo-token': 'demo-token',
      },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(403)
  })

  it('rejects demo mode requests without a demo token', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    process.env.AITUBERKIT_DEMO_ACCESS_TOKEN = 'demo-token'
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        host: 'aituberkit.example',
        origin: 'https://aituberkit.example',
        'sec-fetch-site': 'same-origin',
      },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(403)
  })

  it('does not accept the protected bearer token as a configured demo token fallback', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    process.env.AITUBERKIT_SERVER_SECRET_TOKEN = 'server-secret-token'
    process.env.AITUBERKIT_DEMO_ACCESS_TOKEN = 'demo-token'
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        host: 'aituberkit.example',
        origin: 'https://aituberkit.example',
        'sec-fetch-site': 'same-origin',
        'x-aituberkit-demo-token': 'server-secret-token',
      },
    })

    const allowed = guardServerSecretAccess(req as any, res as any, {
      featureName: 'test-feature',
    })

    expect(allowed).toBe(false)
    expect(res._getStatusCode()).toBe(403)
  })

  it('rate limits demo mode requests per feature and client IP', () => {
    process.env.AITUBERKIT_SERVER_SECRET_ACCESS_MODE = 'demo'
    process.env.AITUBERKIT_DEMO_ACCESS_TOKEN = 'demo-token'
    process.env.AITUBERKIT_DEMO_RATE_LIMIT_PER_MINUTE = '1'

    const createSameOriginRequest = () =>
      createMocks({
        method: 'POST',
        headers: {
          host: 'aituberkit.example',
          origin: 'https://aituberkit.example',
          'sec-fetch-site': 'same-origin',
          'x-aituberkit-demo-token': 'demo-token',
          'x-forwarded-for': '198.51.100.1, 203.0.113.10',
        },
        socket: { remoteAddress: '198.51.100.20' },
      })

    const first = createSameOriginRequest()
    expect(
      guardServerSecretAccess(first.req as any, first.res as any, {
        featureName: 'test-feature',
      })
    ).toBe(true)

    const second = createSameOriginRequest()
    expect(
      guardServerSecretAccess(second.req as any, second.res as any, {
        featureName: 'test-feature',
      })
    ).toBe(false)
    expect(second.res._getStatusCode()).toBe(429)
    expect(second.res._getJSONData()).toEqual(
      expect.objectContaining({
        errorCode: 'ServerSecretRateLimited',
        feature: 'test-feature',
      })
    )
  })
})
