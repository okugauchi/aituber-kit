import { logger } from '@/lib/logger'

describe('logger', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalDebugLog = process.env.NEXT_PUBLIC_DEBUG_LOG

  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    ;(process.env as any).NODE_ENV = originalNodeEnv
    if (originalDebugLog === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG_LOG
    } else {
      process.env.NEXT_PUBLIC_DEBUG_LOG = originalDebugLog
    }
  })

  it('非production環境ではlogを出力する', () => {
    ;(process.env as any).NODE_ENV = 'development'
    delete process.env.NEXT_PUBLIC_DEBUG_LOG
    logger.log('hello', 123)
    expect(logSpy).toHaveBeenCalledWith('hello', 123)
  })

  it('production環境ではlogを出力しない', () => {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_DEBUG_LOG
    logger.log('hidden')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('productionでもNEXT_PUBLIC_DEBUG_LOG=trueならlogを出力する', () => {
    ;(process.env as any).NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_DEBUG_LOG = 'true'
    logger.log('debug enabled')
    expect(logSpy).toHaveBeenCalledWith('debug enabled')
  })

  it('warn/errorはproductionでも常に出力する', () => {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_DEBUG_LOG
    logger.warn('warn message')
    logger.error('error message')
    expect(warnSpy).toHaveBeenCalledWith('warn message')
    expect(errorSpy).toHaveBeenCalledWith('error message')
  })

  it('メソッド参照をコールバックとして渡しても動作する', () => {
    ;(process.env as any).NODE_ENV = 'development'
    const fn = logger.error
    fn('detached call')
    expect(errorSpy).toHaveBeenCalledWith('detached call')
  })
})
