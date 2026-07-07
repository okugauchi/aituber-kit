import { logger } from '@/lib/logger'
import { Component, ErrorInfo, ReactNode } from 'react'
import i18next from 'i18next'

import toastStore from '@/features/stores/toast'

interface Props {
  children: ReactNode
  /** エラー発生元の識別名（トーストのtagとログに使用） */
  name: string
  /** エラー時に表示する代替UI（省略時は何も表示しない） */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * ビューア等のレンダリングエラーでReactツリー全体が落ちるのを防ぐ境界。
 * エラー発生時はtoastStore経由でユーザーに通知し、fallback（デフォルトはnull）を表示する。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(
      `[ErrorBoundary:${this.props.name}] rendering error:`,
      error,
      errorInfo
    )
    toastStore.getState().addToast({
      message: i18next.t('Errors.ViewerRenderingError'),
      type: 'error',
      tag: `error-boundary-${this.props.name}`,
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
