import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import ErrorBoundary from '@/components/common/ErrorBoundary'
import toastStore from '@/features/stores/toast'

jest.mock('i18next', () => ({
  t: (key: string) => key,
}))

const ThrowingChild = () => {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    toastStore.setState({ toasts: [] })
    // Reactが再スローするエラーログを抑制
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('エラーがない場合は子をそのまま描画する', () => {
    render(
      <ErrorBoundary name="test-viewer">
        <div>viewer content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('viewer content')).toBeInTheDocument()
    expect(toastStore.getState().toasts).toHaveLength(0)
  })

  it('子のレンダリングエラーを捕捉してトーストで通知する', () => {
    render(
      <ErrorBoundary name="test-viewer">
        <ThrowingChild />
      </ErrorBoundary>
    )

    const toasts = toastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      message: 'Errors.ViewerRenderingError',
      type: 'error',
      tag: 'error-boundary-test-viewer',
    })
  })

  it('エラー時はデフォルトで何も描画しない', () => {
    const { container } = render(
      <ErrorBoundary name="test-viewer">
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('fallbackが指定されていればエラー時にそれを描画する', () => {
    render(
      <ErrorBoundary name="test-viewer" fallback={<div>fallback ui</div>}>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('fallback ui')).toBeInTheDocument()
  })

  it('同じnameのエラーはtagにより重複トーストにならない', () => {
    render(
      <ErrorBoundary name="test-viewer">
        <ThrowingChild />
      </ErrorBoundary>
    )
    render(
      <ErrorBoundary name="test-viewer">
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(toastStore.getState().toasts).toHaveLength(1)
  })
})
