import type { NextApiResponse } from 'next'
import type { PolicyGate } from '@/lib/accessPolicy/withAccessPolicy'
import {
  isAllowedConfiguredOrListedUrl,
  isHttpUrl,
} from '@/lib/api-services/serverUrlGuard'

export function guardLocalLlmUrl(
  res: NextApiResponse,
  gate: PolicyGate,
  rawUrl: string
): boolean {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    res.status(400).json({
      error: 'Invalid Local LLM URL',
      errorCode: 'AIInvalidProperty',
    })
    return false
  }

  if (!isHttpUrl(parsedUrl)) {
    res.status(400).json({
      error: 'Invalid Local LLM URL protocol',
      errorCode: 'AIInvalidProperty',
    })
    return false
  }

  const { isProtectedServerResource, isAllowedPublicUrl } =
    isAllowedConfiguredOrListedUrl(
      parsedUrl,
      undefined,
      process.env.AITUBERKIT_ALLOWED_LLM_SERVER_ORIGINS || ''
    )

  if (!isProtectedServerResource && !isAllowedPublicUrl) {
    res.status(400).json({
      error: 'Local LLM URL is not allowed',
      errorCode: 'AIInvalidProperty',
    })
    return false
  }

  return gate.guardServerSecret(isProtectedServerResource, {
    allowLocalLoopbackUrl: parsedUrl,
  })
}
