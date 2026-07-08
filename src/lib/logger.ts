/**
 * console.* の薄いラッパー。
 * log はクライアントの本番ビルドでは NEXT_PUBLIC_DEBUG_LOG=true のときのみ出力される
 * （内部状態のブラウザコンソールへのリーク防止）。サーバー側（APIルート等）の log と
 * warn / error は常に出力する。
 * 注意: NEXT_PUBLIC_DEBUG_LOG はビルド時にクライアントバンドルへ焼き込まれるため、
 * ブラウザ側の出力を切り替えるにはビルド時に設定する必要がある。
 * 各メソッドは this に依存しないため、コールバックとしてそのまま渡せる。
 */
const isLogEnabled = () =>
  typeof window === 'undefined' ||
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
