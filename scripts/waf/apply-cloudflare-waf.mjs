/**
 * Cloudflare WAF ルールの適用/削除スクリプト。
 * .github/workflows/apply-cloudflare-waf.yml から実行される。
 *
 * ルール定義は generate-waf-rules.mjs（= routePolicies + waf.config.json）
 * から生成する。環境変数:
 * - CLOUDFLARE_API_TOKEN（必須）
 * - OPERATION: 'apply'（既定）| 'remove'
 */

import { generateWafRules, loadWafConfig } from './generate-waf-rules.mjs'

const token = process.env.CLOUDFLARE_API_TOKEN
const operation = process.env.OPERATION || 'apply'
const config = loadWafConfig()
const zoneName = process.env.ZONE_NAME || config.zoneName

if (!token) {
  throw new Error('CLOUDFLARE_API_TOKEN is not configured')
}

const api = async (path, options = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}
  if (!response.ok || json.success === false) {
    const httpError = new Error(
      `${options.method || 'GET'} ${path} failed: ${response.status} ${text}`
    )
    httpError.status = response.status
    throw httpError
  }
  return json
}

const zones = await api(
  `/zones?name=${encodeURIComponent(zoneName)}&status=active`
)
const zone = zones.result?.[0]
if (!zone) {
  throw new Error(`Cloudflare zone not found: ${zoneName}`)
}

const phase = 'http_request_firewall_custom'
const guardRules = generateWafRules(config)
const guardRefs = new Set(guardRules.map((rule) => rule.ref))

let ruleset = null
try {
  const current = await api(
    `/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`
  )
  ruleset = current.result
} catch (error) {
  if (error.status !== 404) {
    throw error
  }
}

const existingRules = ruleset?.rules || []
const retainedRules = existingRules.filter((rule) => !guardRefs.has(rule.ref))
const nextRules =
  operation === 'remove' ? retainedRules : [...guardRules, ...retainedRules]

if (!ruleset) {
  if (operation === 'remove') {
    console.log('No custom WAF ruleset exists; nothing to remove.')
    process.exit(0)
  }
  const created = await api(`/zones/${zone.id}/rulesets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'AITuberKit custom WAF rules',
      description: 'Custom WAF rules managed by aituber-kit',
      kind: 'zone',
      phase,
      rules: nextRules,
    }),
  })
  console.log(`Created ruleset ${created.result.id} with ${nextRules.length} rules.`)
  process.exit(0)
}

const updated = await api(`/zones/${zone.id}/rulesets/${ruleset.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: ruleset.name || 'AITuberKit custom WAF rules',
    description: ruleset.description || 'Custom WAF rules managed by aituber-kit',
    kind: ruleset.kind,
    phase: ruleset.phase,
    rules: nextRules,
  }),
})
console.log(
  `Updated ruleset ${updated.result.id}; operation=${operation}; rules=${nextRules.length}.`
)
