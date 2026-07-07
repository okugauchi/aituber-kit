/**
 * console.* の薄いラッパー。
 * log は本番ビルドでは NEXT_PUBLIC_DEBUG_LOG=true のときのみ出力される
 * （内部状態のブラウザコンソールへのリーク防止）。warn / error は常に出力する。
 * 各メソッドは this に依存しないため、コールバックとしてそのまま渡せる。
 */
const isLogEnabled = () =>
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_DEBUG_LOG === 'true'

export const logger = {
  log: (...args: unknown[]): void => {
    if (isLogEnabled()) {
      console.log(...args)
    }
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args)
  },
  error: (...args: unknown[]): void => {
    console.error(...args)
  },
}

export default logger
