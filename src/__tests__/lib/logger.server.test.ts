/**
 * @jest-environment node
 */
import { logger } from '@/lib/logger'

describe('logger（サーバー側 / node環境）', () => {
  const originalNodeEnv = process.env.NODE_ENV

  let logSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    ;(process.env as any).NODE_ENV = originalNodeEnv
  })

  it('本番環境でもNEXT_PUBLIC_DEBUG_LOGなしでlogを出力する（APIルート診断ログの維持）', () => {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_DEBUG_LOG
    logger.log('server diagnostic')
    expect(logSpy).toHaveBeenCalledWith('server diagnostic')
  })
})
