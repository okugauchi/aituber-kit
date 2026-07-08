import handler from '@/pages/api/ai/audio'
import {
  createMockReq,
  createMockRes,
  mockServerSecretGuard,
  type MockApiResponse,
} from '../../helpers/apiRouteTestUtils'

const mockCreate = jest.fn()

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: (...args: unknown[]) => mockCreate(...args),
        },
      },
    })),
  }
})

const makeAudioStream = (
  chunks: Array<Record<string, unknown> | undefined>
) => ({
  async *[Symbol.asyncIterator]() {
    for (const audio of chunks) {
      yield { choices: [{ delta: audio ? { audio } : {} }] }
    }
  },
})

/** ストリーミング対応のモックres（flushHeaders / once を補完） */
const createStreamingMockRes = (): MockApiResponse & {
  flushHeaders: jest.Mock
  once: jest.Mock
} => {
  const res = createMockRes() as MockApiResponse & {
    flushHeaders: jest.Mock
    once: jest.Mock
  }
  res.flushHeaders = jest.fn()
  res.once = jest.fn()
  return res
}

describe('/api/ai/audio', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.OPENAI_KEY
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('クライアントキーでNDJSONストリームを返す（audio差分のみ転送）', async () => {
    mockServerSecretGuard('disabled')
    mockCreate.mockResolvedValue(
      makeAudioStream([
        { transcript: 'こんにちは、' },
        { data: 'base64data1' },
        undefined, // audioなしのチャンクは転送されない
        { id: 'audio-id-123', transcript: 'お元気ですか？' },
      ])
    )

    const req = createMockReq({
      body: {
        messages: [{ role: 'user', content: 'こんにちは' }],
        apiKey: 'client-key',
        model: 'gpt-audio',
        voice: 'alloy',
      },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-audio',
        stream: true,
        modalities: ['text', 'audio'],
        audio: { voice: 'alloy', format: 'pcm16' },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('application/x-ndjson')
    expect(res._headers['X-Accel-Buffering']).toBe('no')
    expect(res.flushHeaders).toHaveBeenCalled()

    const lines = res._writes.map((w) => JSON.parse(w))
    expect(lines).toEqual([
      { transcript: 'こんにちは、' },
      { data: 'base64data1' },
      { transcript: 'お元気ですか？', id: 'audio-id-123' },
    ])
    expect(res._ended).toBe(true)
  })

  it('キーが無い場合は400 EmptyAPIKeyを返す', async () => {
    mockServerSecretGuard('unprotected')
    const req = createMockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual({
      error: 'Empty API Key',
      errorCode: 'EmptyAPIKey',
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('サーバーキー使用時はガードが評価される（disabledモードで403）', async () => {
    mockServerSecretGuard('disabled')
    process.env.OPENAI_API_KEY = 'server-key'

    const req = createMockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('demoモードではsame-originリクエストでサーバーキーが使える', async () => {
    const { headers } = mockServerSecretGuard('demo')
    process.env.OPENAI_API_KEY = 'server-key'
    mockCreate.mockResolvedValue(makeAudioStream([{ transcript: 'デモ応答' }]))

    const req = createMockReq({
      headers,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._writes.map((w) => JSON.parse(w))).toEqual([
      { transcript: 'デモ応答' },
    ])
  })

  it('demoモードでもクロスオリジンは403', async () => {
    mockServerSecretGuard('demo')
    process.env.OPENAI_API_KEY = 'server-key'

    const req = createMockReq({
      headers: { 'sec-fetch-site': 'cross-site' },
      body: { messages: [{ role: 'user', content: 'hi' }] },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(403)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('model未指定はデフォルトモデルにフォールバックする', async () => {
    mockServerSecretGuard('unprotected')
    mockCreate.mockResolvedValue(makeAudioStream([]))

    const req = createMockReq({
      body: {
        messages: [{ role: 'user', content: 'hi' }],
        apiKey: 'client-key',
      },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.any(String) }),
      expect.anything()
    )
    expect(
      (mockCreate.mock.calls[0][0] as { model: string }).model.length
    ).toBeGreaterThan(0)
  })

  it('messagesが不正な場合は400を返す', async () => {
    mockServerSecretGuard('unprotected')
    const req = createMockReq({
      body: { apiKey: 'client-key', messages: [] },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(400)
    expect(res._json).toEqual(
      expect.objectContaining({ errorCode: 'AIInvalidProperty' })
    )
  })

  it('上流エラー（ストリーム開始前）は500 AIAPIErrorを返す', async () => {
    mockServerSecretGuard('unprotected')
    mockCreate.mockRejectedValue(new Error('upstream down'))

    const req = createMockReq({
      body: {
        messages: [{ role: 'user', content: 'hi' }],
        apiKey: 'client-key',
      },
    })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({
      error: 'Unexpected Error',
      errorCode: 'AIAPIError',
    })
  })

  it('POST以外のメソッドは405を返す', async () => {
    mockServerSecretGuard('unprotected')
    const req = createMockReq({ method: 'GET' })
    const res = createStreamingMockRes()

    await handler(req, res)

    expect(res._status).toBe(405)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
