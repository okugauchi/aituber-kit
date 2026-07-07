import { logger } from '@/lib/logger'
import { Component, ErrorInfo, ReactNode } from 'react'
import i18next from 'i18next'

import toastStore from '@/features/stores/toast'

/**
 * ビューアのエラーをログとトーストでユーザーに通知する。
 * ErrorBoundaryはレンダーフェーズの例外しか捕捉できないため、
 * 非同期のモデル読み込み失敗等のcatch節からはこの関数を直接呼ぶこと。
 */
export function reportViewerError(name: string, ...errors: unknown[]): void {
  logger.error(`[ErrorBoundary:${name}] rendering error:`, ...errors)
  toastStore.getState().addToast({
    message: i18next.t('Errors.ViewerRenderingError'),
    type: 'error',
    tag: `error-boundary-${name}`,
  })
}

interface Props {
  children: ReactNode
  /** エラー発生元の識別名（トーストのtagとログに使用） */
  name: string
  /** エラー時に表示する代替UI（省略時は何も表示しない） */
  fallback?: ReactNode
  /** 変化したらエラー状態をリセットするキー（選択中のモデルパス等） */
  resetKey?: unknown
}

interface State {
  hasError: boolean
}

/**
 * ビューア等のレンダリングエラーでReactツリー全体が落ちるのを防ぐ境界。
 * エラー発生時はtoastStore経由でユーザーに通知し、fallback（デフォルトはnull）を表示する。
 * resetKeyが変化すると子の再描画を試みる（例: ユーザーが別モデルを選択して復旧するケース）。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportViewerError(this.props.name, error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
