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

function getIpv4MappedAddress(normalizedHost: string): string | undefined {
  const ipv4MappedMatch = normalizedHost.match(
    /^(?:::ffff:|0:0:0:0:0:ffff:)(.+)$/
  )
  if (!ipv4MappedMatch) return undefined

  const mappedAddress = ipv4MappedMatch[1]
  if (mappedAddress.includes('.')) return mappedAddress

  const hexParts = mappedAddress.split(':')
  if (hexParts.length !== 2) return mappedAddress

  const high = Number.parseInt(hexParts[0], 16)
  const low = Number.parseInt(hexParts[1], 16)
  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return mappedAddress
  }

  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(
    '.'
  )
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const ipv4MappedAddress = getIpv4MappedAddress(normalized)

  if (ipv4MappedAddress) {
    return /^127\./.test(ipv4MappedAddress)
  }

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    /^127\./.test(normalized) ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1'
  )
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (isLoopbackHost(normalized)) return true

  const ipv4MappedAddress = getIpv4MappedAddress(normalized)
  if (ipv4MappedAddress) {
    return (
      PRIVATE_IPV4_RANGES.some((range) => range.test(ipv4MappedAddress)) ||
      ipv4MappedAddress.includes(':')
    )
  }

  if (PRIVATE_IPV4_RANGES.some((range) => range.test(normalized))) {
    return true
  }

  if (!normalized.includes(':')) return false

  const firstHextet = Number.parseInt(normalized.split(':')[0], 16)
  if (!Number.isFinite(firstHextet)) return false

  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80
}

export function isAllowedConfiguredOrListedUrl(
  parsedUrl: URL,
  configuredUrl?: URL,
  allowedOriginsValue = process.env.AITUBERKIT_ALLOWED_TTS_SERVER_ORIGINS || ''
): {
  isProtectedServerResource: boolean
  isAllowedPublicUrl: boolean
} {
  const isProtectedServerResource =
    (configuredUrl ? parsedUrl.origin === configuredUrl.origin : false) ||
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
