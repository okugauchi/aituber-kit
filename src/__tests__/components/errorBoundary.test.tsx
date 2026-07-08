import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'

import ErrorBoundary, {
  reportViewerError,
} from '@/components/common/ErrorBoundary'
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

  it('resetKeyが変化するとエラー状態をリセットして子を再描画する', () => {
    const MaybeThrowingChild = ({ modelPath }: { modelPath: string }) => {
      if (modelPath === 'broken.vrm') {
        throw new Error('boom')
      }
      return <div>recovered content</div>
    }

    const Harness = () => {
      const [modelPath, setModelPath] = useState('broken.vrm')
      return (
        <>
          <button onClick={() => setModelPath('valid.vrm')}>fix model</button>
          <ErrorBoundary name="test-viewer" resetKey={modelPath}>
            <MaybeThrowingChild modelPath={modelPath} />
          </ErrorBoundary>
        </>
      )
    }

    render(<Harness />)
    expect(screen.queryByText('recovered content')).not.toBeInTheDocument()

    // ユーザーが正常なモデルを選び直す（resetKey変化）と復帰する
    fireEvent.click(screen.getByText('fix model'))
    expect(screen.getByText('recovered content')).toBeInTheDocument()
  })

  it('resetKeyが変化しなければエラー状態のまま', () => {
    const { rerender } = render(
      <ErrorBoundary name="test-viewer" resetKey="same.vrm">
        <ThrowingChild />
      </ErrorBoundary>
    )
    rerender(
      <ErrorBoundary name="test-viewer" resetKey="same.vrm">
        <div>should stay hidden</div>
      </ErrorBoundary>
    )
    expect(screen.queryByText('should stay hidden')).not.toBeInTheDocument()
  })
})

describe('reportViewerError', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    toastStore.setState({ toasts: [] })
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('非同期のロード失敗のcatch節から直接呼べる（ログ+トースト）', () => {
    reportViewerError('vrm-viewer', 'Failed to load VRM:', new Error('bad'))

    expect(consoleErrorSpy).toHaveBeenCalled()
    const toasts = toastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      message: 'Errors.ViewerRenderingError',
      type: 'error',
      tag: 'error-boundary-vrm-viewer',
    })
  })
})
