/**
 * usesServerSecret 判定の共通ヘルパー
 *
 * 「クライアントが値を持ち込まず、サーバーenvに値がある場合は
 * サーバー秘匿リソースを使う」という判定式を一元化する。
 * （旧S7: 各ルートで微妙に異なる手書き式の集約）
 */

import type { NextApiRequest } from 'next'
import type { SecretPair } from './types'

/**
 * dynamicルート用の低レベルヘルパー。
 * [クライアント提供値, サーバーenv値] のペア列を受け取り、
 * いずれかのペアで「クライアント未提供かつenv有り」なら true。
 */
export function computeUsesServerSecret(
  pairs: Array<[clientValue: unknown, envValue: string | undefined]>
): boolean {
  return pairs.some(
    ([clientValue, envValue]) => !clientValue && Boolean(envValue)
  )
}

/**
 * 宣言的 SecretPair をリクエストに対して評価する。
 */
export function evaluateSecretPairs(
  req: NextApiRequest,
  pairs: SecretPair[]
): boolean {
  return pairs.some((pair) => {
    const holder = pair.source === 'body' ? req.body : req.query
    const rawValue =
      holder && typeof holder === 'object'
        ? (holder as Record<string, unknown>)[pair.key]
        : undefined
    const clientValue = Array.isArray(rawValue) ? rawValue[0] : rawValue
    return (
      !clientValue && pair.envVars.some((name) => Boolean(process.env[name]))
    )
  })
}
