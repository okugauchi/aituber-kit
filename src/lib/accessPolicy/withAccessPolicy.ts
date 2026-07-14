/**
 * 統一アクセスポリシーのエントリポイント
 *
 * 全APIルートはこの高階関数でラップされ、統一順序でガードが評価される:
 * 1. メソッド検査（405）
 * 2. 制限モード（403）
 * 3. 外部制御API認証（503/401）
 * 4. サーバーURL検証（400）
 * 5. サーバー秘匿リソースガード（403/429）
 *
 * 設計ドキュメント: docs/access-policy-design.md §4.2
 */

import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'
import {
  guardServerSecretAccess,
  isServerSecretAccessDisabled,
} from '@/lib/api-services/serverSecretGuard'
import {
  isAllowedConfiguredOrListedUrl,
  isHttpUrl,
  isLoopbackHost,
} from '@/lib/api-services/serverUrlGuard'
import {
  isRestrictedMode,
  createRestrictedModeErrorResponse,
} from '@/utils/restrictedMode'
import { requireApiKey, sendMethodNotAllowed } from '@/features/api/http'
import { evaluateSecretPairs, extractClientValue } from './secretPairs'
import type { ApiHttpMethod, RoutePolicy } from './types'

/** serverUrl 宣言を持つルートに渡される解決済みURL情報 */
export interface ResolvedServerUrl {
  /** 解決済みURL文字列（クライアント値 → env → defaultUrl の優先順） */
  raw: string
  parsed: URL
  /** サーバー設定URLと同一オリジン、またはローカル/プライベートホスト */
  isProtectedServerResource: boolean
  isClientProvided: boolean
}

export interface PolicyGate {
  /** pairs/always 評価の結果（dynamicルートでは常に false） */
  usesServerSecret: boolean
  serverUrl?: ResolvedServerUrl
  /**
   * secret.kind === 'dynamic' のルート専用の遅延ガード。
   * false が返ったらレスポンス送信済みなので即 return すること。
   */
  guardServerSecret(usesServerSecret: boolean): boolean
}

export type PolicyGuardedHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  gate: PolicyGate
) => unknown | Promise<unknown>

function isSameMachineLoopbackRequest(req: NextApiRequest): boolean {
  const hostHeader = req.headers?.host
  if (!hostHeader) return false

  let requestHostname: string
  try {
    requestHostname = new URL(`http://${hostHeader}`).hostname
  } catch {
    return false
  }

  const remoteAddress = req.socket?.remoteAddress
  return (
    Boolean(remoteAddress) &&
    isLoopbackHost(requestHostname) &&
    isLoopbackHost(remoteAddress || '')
  )
}

export function withAccessPolicy(
  policy: RoutePolicy,
  handler: PolicyGuardedHandler
): NextApiHandler {
  return async function policyGuardedHandler(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    // 1. メソッド検査
    if (!policy.methods.includes((req.method || '') as ApiHttpMethod)) {
      return sendMethodNotAllowed(res)
    }

    // 2. 制限モード
    if (policy.restrictedBehavior === 'deny' && isRestrictedMode()) {
      return res
        .status(403)
        .json(
          createRestrictedModeErrorResponse(
            policy.restrictedFeatureName || policy.featureName
          )
        )
    }

    // 3. 外部制御API認証
    if (policy.requiresApiKey && !requireApiKey(req, res)) {
      return
    }

    // 4. サーバーURL検証
    let resolvedServerUrl: ResolvedServerUrl | undefined
    if (policy.serverUrl) {
      const declaration = policy.serverUrl
      const clientValue = extractClientValue(
        req,
        declaration.source,
        declaration.key
      )
      const configuredRaw =
        process.env[declaration.envVar] || declaration.defaultUrl
      const raw =
        typeof clientValue === 'string' && clientValue
          ? clientValue
          : configuredRaw

      let parsed: URL
      let configured: URL
      try {
        parsed = new URL(raw)
        configured = new URL(configuredRaw)
      } catch {
        return res.status(400).json({ error: 'Invalid server URL' })
      }

      if (!isHttpUrl(parsed)) {
        return res.status(400).json({ error: 'Invalid server URL protocol' })
      }

      const { isProtectedServerResource, isAllowedPublicUrl } =
        isAllowedConfiguredOrListedUrl(parsed, configured)
      const isClientProvided = Boolean(clientValue)

      if (
        isClientProvided &&
        !isProtectedServerResource &&
        !isAllowedPublicUrl
      ) {
        return res.status(400).json({ error: 'Server URL is not allowed' })
      }

      resolvedServerUrl = {
        raw,
        parsed,
        isProtectedServerResource,
        isClientProvided,
      }
    }

    // 5. サーバー秘匿リソースガード
    let usesServerSecret = false
    if (policy.secret.kind === 'pairs') {
      usesServerSecret = evaluateSecretPairs(req, policy.secret.pairs)
      const allowsLocalLoopback =
        policy.serverUrl?.allowLocalLoopback === true &&
        isServerSecretAccessDisabled() &&
        Boolean(resolvedServerUrl) &&
        isLoopbackHost(resolvedServerUrl?.parsed.hostname || '') &&
        isSameMachineLoopbackRequest(req)
      const mustGuard =
        !allowsLocalLoopback &&
        (usesServerSecret ||
          Boolean(resolvedServerUrl?.isProtectedServerResource))
      if (
        mustGuard &&
        !guardServerSecretAccess(req, res, { featureName: policy.featureName })
      ) {
        return
      }
    } else if (policy.secret.kind === 'always') {
      usesServerSecret = true
      if (
        !guardServerSecretAccess(req, res, { featureName: policy.featureName })
      ) {
        return
      }
    }

    const gate: PolicyGate = {
      usesServerSecret,
      serverUrl: resolvedServerUrl,
      guardServerSecret: (dynamicUsesServerSecret: boolean): boolean => {
        if (policy.secret.kind !== 'dynamic') {
          throw new Error(
            `guardServerSecret() is only available for secret.kind === 'dynamic' routes (${policy.path})`
          )
        }
        if (!dynamicUsesServerSecret) {
          return true
        }
        return guardServerSecretAccess(req, res, {
          featureName: policy.featureName,
        })
      },
    }

    return handler(req, res, gate)
  }
}
