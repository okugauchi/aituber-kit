const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
]

export function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1'
  ) {
    return true
  }

  if (PRIVATE_IPV4_RANGES.some((range) => range.test(normalized))) {
    return true
  }

  if (!normalized.includes(':')) return false

  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

export function isAllowedConfiguredOrListedUrl(
  parsedUrl: URL,
  configuredUrl: URL,
  allowedOriginsValue = process.env.AITUBERKIT_ALLOWED_TTS_SERVER_ORIGINS || ''
): {
  isProtectedServerResource: boolean
  isAllowedPublicUrl: boolean
} {
  const isProtectedServerResource =
    parsedUrl.origin === configuredUrl.origin ||
    isLocalOrPrivateHost(parsedUrl.hostname)
  const allowedOrigins = allowedOriginsValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    isProtectedServerResource,
    isAllowedPublicUrl: allowedOrigins.includes(parsedUrl.origin),
  }
}
